import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { MongoClient } from "mongodb";
import { handler } from "../lambda/handler.js";
import { closeDatabaseConnection, getDatabase } from "../lambda/db.js";

let writes;
let connect;
let close;
let ping;
let failAt;
let releaseConnect;
const event = (overrides = {}) => ({
  rawPath: "/",
  rawQueryString: "",
  headers: { host: "faphouse3.com", "user-agent": "Mozilla/5.0 browser", authorization: "Bearer test-debug-token" },
  requestContext: { http: { method: "GET", sourceIp: "203.0.113.1" } },
  ...overrides
});

beforeEach(() => {
  process.env.MONGODB_URI = "mongodb://localhost:27017";
  process.env.ANALYTICS_ENABLED = "true";
  process.env.DEBUG_TOKEN = "test-debug-token";
  delete process.env.ADS_ENABLED;
  delete process.env.AD_TAG_HTML;
  writes = [];
  failAt = null;
  releaseConnect = null;
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
  mock.method(console, "warn", () => {});
  connect = mock.method(MongoClient.prototype, "connect", async function () {
    if (releaseConnect) await releaseConnect;
    return this;
  });
  close = mock.method(MongoClient.prototype, "close", async () => {});
  ping = mock.fn(async () => ({ ok: 1 }));
  mock.method(MongoClient.prototype, "db", () => ({
    command: ping,
    collection: (name) => ({
      insertOne: async (doc) => {
        if (failAt === "insert") throw new Error("Insert unavailable");
        writes.push({ name, doc });
        return { insertedId: "visit-1" };
      },
      findOneAndUpdate: async (filter, update) => {
        if (failAt === "daily") throw new Error("Daily counter unavailable");
        writes.push({ name, filter, update });
        return { totalVisits: 1 };
      },
      updateOne: async (filter, update) => {
        if (failAt === "total") throw new Error("Total counter unavailable");
        writes.push({ name, filter, update });
        return { acknowledged: true };
      }
    })
  }));
});

afterEach(async () => {
  await closeDatabaseConnection();
  mock.restoreAll();
});

test("cold connection exceeding 350ms completes every write before the response", async () => {
  let release;
  releaseConnect = new Promise((resolve) => { release = resolve; });
  let returned = false;
  const responsePromise = handler(event(), {}).then((response) => {
    returned = true;
    return response;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(returned, false);
    assert.equal(writes.length, 0);
  } finally {
    release();
  }
  const response = await responsePromise;
  assert.equal(response.statusCode, 200);
  assert.equal(writes.length, 3);
  assert.equal(writes[0].doc.ip, "203.0.113.1");
  assert.match(response.body, /QuietTab/);
  assert.doesNotMatch(response.body, /faphouse2|setInterval|REDIRECT_CONFIG/);
});

test("warm visits reuse the connection and retain returning visitor identity", async () => {
  const first = await handler(event(), {});
  const id = first.headers["X-Visitor-Id"];
  const second = await handler(event({ cookies: [`fh3_vid=${id}`] }), {});
  assert.equal(connect.mock.callCount(), 1);
  assert.equal(ping.mock.callCount(), 1);
  assert.deepEqual(ping.mock.calls[0].arguments, [{ ping: 1 }]);
  assert.equal(writes.length, 6);
  assert.equal(second.headers["X-Visitor-Id"], id);
  assert.equal(writes[3].doc.isReturning, true);
});

test("connection failures are reported in debug JSON and the failed pool is closed", async () => {
  connect.mock.mockImplementation(async () => { throw new Error("Connection unavailable"); });
  const response = await handler(event({ rawQueryString: "debug=true" }), {});
  const body = JSON.parse(response.body);
  assert.equal(body.dbStatus, "failed");
  assert.equal(body.dbError.message, "Connection unavailable");
  assert.equal(close.mock.callCount(), 1);
  assert.equal(writes.length, 0);
  connect.mock.mockImplementation(async function () { return this; });
  const retry = await handler(event({ rawQueryString: "debug=true" }), {});
  assert.equal(JSON.parse(retry.body).dbStatus, "ok");
});

test("partial failures still serve HTML without a second browser write", async () => {
  failAt = "daily";
  const response = await handler(event(), {});
  assert.equal(response.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.doesNotMatch(response.body, /sendBeacon|api\/track/);
});

test("retired beacon cannot create a second pageview", async () => {
  const response = await handler(event({ rawPath: "/api/track" }), {});
  assert.equal(response.statusCode, 410);
  const post = await handler(event({ rawPath: "/api/track", requestContext: { http: { method: "POST" } } }), {});
  assert.equal(post.statusCode, 405);
  assert.equal(writes.length, 0);
  assert.equal(connect.mock.callCount(), 0);
});

test("concurrent cold requests share a single MongoDB connection attempt", async () => {
  let release;
  releaseConnect = new Promise((resolve) => { release = resolve; });
  const first = getDatabase();
  const second = getDatabase();
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one, two);
  assert.equal(connect.mock.callCount(), 1);
});

test("Lambda initialization waits for MongoDB before exporting a usable handler", async () => {
  const previousFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  process.env.AWS_LAMBDA_FUNCTION_NAME = "tracking-test";
  let release;
  let started;
  const connectionStarted = new Promise((resolve) => { started = resolve; });
  const connectionReady = new Promise((resolve) => { release = resolve; });
  connect.mock.mockImplementation(async function () {
    started();
    await connectionReady;
    return this;
  });
  try {
    let initialized = false;
    const modulePromise = import("../lambda/handler.js?startup-ready").then((module) => {
      initialized = true;
      return module;
    });
    await connectionStarted;
    assert.equal(initialized, false);
    assert.equal(writes.length, 0);
    release();
    const module = await modulePromise;
    assert.equal(initialized, true);
    assert.equal(connect.mock.callCount(), 1);
    await module.handler(event(), {});
    assert.equal(connect.mock.callCount(), 1);
    assert.equal(ping.mock.callCount(), 1);
    assert.equal(writes.length, 3);
  } finally {
    release();
    if (previousFunctionName === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = previousFunctionName;
  }
});

test("a failed startup connection allows initialization and retries on the first tracking request", async () => {
  const previousFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  process.env.AWS_LAMBDA_FUNCTION_NAME = "tracking-test";
  connect.mock.mockImplementation(async () => { throw new Error("Startup unavailable"); });
  try {
    const module = await import("../lambda/handler.js?startup-failed");
    assert.equal(close.mock.callCount(), 1);
    assert.equal(writes.length, 0);
    assert.ok(console.error.mock.calls.some(({ arguments: args }) => args[0].includes("[DB:INIT_ERROR]")));
    connect.mock.mockImplementation(async function () { return this; });
    const response = await module.handler(event(), {});
    assert.equal(response.statusCode, 200);
    assert.equal(connect.mock.callCount(), 2);
    assert.equal(writes.length, 3);
  } finally {
    if (previousFunctionName === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = previousFunctionName;
  }
});

test("a failed cached health check shares one reconnection across concurrent callers", async () => {
  const original = await getDatabase();
  ping.mock.mockImplementation(async () => { throw new Error("Idle connection lost"); });
  const [one, two] = await Promise.all([getDatabase(), getDatabase()]);
  assert.equal(one, two);
  assert.notEqual(one, original);
  assert.equal(ping.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 1);
  assert.equal(connect.mock.callCount(), 2);
  assert.equal(writes.length, 0);
});

test("reconnection failure prevents writes and the next tracking request can recover", async () => {
  await getDatabase();
  ping.mock.mockImplementation(async () => { throw new Error("Idle connection lost"); });
  connect.mock.mockImplementation(async () => { throw new Error("Reconnection unavailable"); });
  const failed = await handler(event({ rawQueryString: "debug=true" }), {});
  assert.equal(JSON.parse(failed.body).dbStatus, "failed");
  assert.equal(JSON.parse(failed.body).dbError.message, "Reconnection unavailable");
  assert.equal(writes.length, 0);
  assert.equal(close.mock.callCount(), 2);
  connect.mock.mockImplementation(async function () { return this; });
  const recovered = await handler(event({ rawQueryString: "debug=true" }), {});
  assert.equal(JSON.parse(recovered.body).dbStatus, "ok");
  assert.equal(writes.length, 3);
});

test("static assets do not connect or write to MongoDB", async () => {
  for (const rawPath of ["/favicon.ico", "/style.css", "/config.js"]) {
    assert.ok((await handler(event({ rawPath }), {})).statusCode < 300);
  }
  assert.equal(connect.mock.callCount(), 0);
  assert.equal(writes.length, 0);
});

test("canonical domain, metadata and bot counters are saved without tool query values", async () => {
  const response = await handler(event({ rawPath: "/guides/private-browsing", rawQueryString: "url=https://private.example&password=secret", headers: {
    host: "origin.lambda-url.ap-south-1.on.aws", "user-agent": "ClaudeBot/1.0", "cf-connecting-ip": "203.0.113.8", "cf-ipcountry": "IN", "cf-ipcity": "New%20Delhi", "cf-region": "Delhi", "cf-timezone": "Asia/Kolkata", "cf-iplatitude": "28.6139", "cf-iplongitude": "77.209", "x-forwarded-host": "www.faphouse3.com", referer: "https://example.com/private?q=secret"
  }, requestContext: { domainName: "origin.lambda-url.ap-south-1.on.aws", http: { method: "GET", sourceIp: "203.0.113.9" } } }), {});
  assert.equal(response.statusCode, 200);
  const visit = writes[0].doc;
  assert.equal(visit.domain, "faphouse3.com");
  assert.equal(visit.ip, "203.0.113.8");
  assert.equal(visit.ipSource, "cf-connecting-ip");
  assert.equal(visit.country, "IN");
  assert.equal(visit.city, "New Delhi");
  assert.equal(visit.geoSource, "cloudflare-headers");
  assert.equal(visit.region, "Delhi");
  assert.equal(visit.timezone, "Asia/Kolkata");
  assert.equal(visit.latitude, 28.6139);
  assert.equal(visit.longitude, 77.209);
  assert.equal(visit.forwardedHost, "www.faphouse3.com");
  assert.equal(visit.metadataTrust, "forwarded-unverified");
  assert.equal(visit.trafficType, "identified-bot");
  assert.equal(visit.isBot, true);
  assert.equal(visit.referer, "https://example.com");
  assert.equal(visit.queryString, "");
  assert.equal(visit.targetRedirect, "");
  assert.equal(writes[1].update.$inc.botVisits, 1);
  assert.equal(writes[1].update.$inc.uniqueVisitors, undefined);
});

test("invalid proxy headers fall back to a valid request source and missing IP stays null", async () => {
  await handler(event({ headers: { "cf-connecting-ip": "bad-value", "x-forwarded-for": "bad-value" } }), {});
  assert.equal(writes[0].doc.ip, "203.0.113.1");
  await handler(event({ requestContext: {} }), {});
  assert.equal(writes[3].doc.ip, null);
});

test("head, missing pages and disabled analytics do not write visits", async () => {
  assert.equal((await handler(event({ rawPath: "/missing" }), {})).statusCode, 404);
  assert.equal((await handler(event({ requestContext: { http: { method: "HEAD" } } }), {})).body, "");
  process.env.ANALYTICS_ENABLED = "false";
  const response = await handler(event(), {});
  assert.equal(response.cookies.length, 0);
  assert.equal(writes.length, 0);
});

test("diagnostics require an operator token", async () => {
  const response = await handler(event({ rawQueryString: "debug=true", headers: {} }), {});
  assert.equal(response.statusCode, 403);
  assert.equal(writes.length, 0);
});
