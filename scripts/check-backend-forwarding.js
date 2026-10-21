/** Optional integration check against the actual sibling BackendDev proxy.
 * No .env is loaded. HTTP stays on loopback and MongoDB is mocked.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { test, mock } from "node:test";
import { pathToFileURL } from "node:url";
import { MongoClient } from "mongodb";
import { closeDatabaseConnection } from "../lambda/db.js";

async function listen(listener) {
  const server = http.createServer(listener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

function request(server, headers, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: "/guides/private-browsing", method, headers: { host: "www.faphouse3.com", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

test("actual BackendDev -> Lambda handler -> mocked MongoDB preserves visitor metadata", async (t) => {
  const originalEnv = Object.fromEntries(["MONGODB_URI", "ANALYTICS_ENABLED", "VISITOR_PROXY_MODE", "DOMAIN3_LAMBDA_URL"].map((key) => [key, process.env[key]]));
  const servers = [];
  const visits = [];
  t.after(async () => {
    for (const server of servers) {
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    }
    await closeDatabaseConnection();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    mock.restoreAll();
  });
  process.env.MONGODB_URI = "mongodb://localhost:27017";
  process.env.ANALYTICS_ENABLED = "true";
  process.env.VISITOR_PROXY_MODE = "cloudflare";
  mock.method(console, "log", () => {});
  mock.method(MongoClient.prototype, "connect", async function () { return this; });
  mock.method(MongoClient.prototype, "close", async () => {});
  mock.method(MongoClient.prototype, "db", () => ({
    command: async () => ({ ok: 1 }),
    collection: () => ({
      insertOne: async (doc) => { visits.push(doc); return { insertedId: "mock-visit" }; },
      findOneAndUpdate: async () => ({ totalVisits: visits.length }),
      updateOne: async () => ({ acknowledged: true })
    })
  }));
  const { handler } = await import("../lambda/handler.js");
  const moduleUrl = process.env.BACKEND_PROXY_MODULE
    ? pathToFileURL(process.env.BACKEND_PROXY_MODULE).href
    : new URL("../../BackendDev/lib/domain3.js", import.meta.url).href;
  const { serveDomain3 } = await import(moduleUrl);
  const upstream = await listen(async (req, res) => {
    const result = await handler({ rawPath: req.url.split("?")[0], headers: req.headers, requestContext: { domainName: "test.lambda-url.ap-south-1.on.aws", http: { method: req.method, sourceIp: "198.51.100.99" } } }, {});
    for (const [key, value] of Object.entries(result.headers)) if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
    if (result.cookies?.length) res.setHeader("set-cookie", result.cookies);
    res.statusCode = result.statusCode;
    res.end(result.body);
  });
  servers.push(upstream);
  process.env.DOMAIN3_LAMBDA_URL = `http://127.0.0.1:${upstream.address().port}/`;
  const backend = await listen(async (req, res) => { if (!await serveDomain3(req, res)) { res.statusCode = 404; res.end(); } });
  servers.push(backend);
  const headers = {
    "user-agent": "Mozilla/5.0 integration-check", "cf-connecting-ip": "203.0.113.8", "cf-ipcountry": "IN", "cf-ipcity": "New%20Delhi",
    "cf-region": "Delhi", "cf-region-code": "DL", "cf-timezone": "Asia/Kolkata", "cf-postal-code": "110001",
    "cf-ipcontinent": "AS", "cf-iplatitude": "28.6139", "cf-iplongitude": "77.2090", "cf-ray": "integration-BOM",
    "x-forwarded-for": "198.51.100.1", "x-vercel-ip-country": "US", "x-vercel-ip-city": "Ashburn"
  };
  const result = await request(backend, headers);
  assert.equal(result.status, 200);
  assert.match(result.body, /QuietTab/);
  const visit = visits[0];
  for (const [field, expected] of Object.entries({ ip: "203.0.113.8", country: "IN", city: "New Delhi", region: "Delhi", regionCode: "DL", timezone: "Asia/Kolkata", postalCode: "110001", continent: "AS", latitude: 28.6139, longitude: 77.209, cfRay: "integration-BOM", forwardedHost: "www.faphouse3.com", geoSource: "cloudflare-headers" })) assert.equal(visit[field], expected, field);
  const visitorCookie = result.headers["set-cookie"].find((value) => value.startsWith("fh3_vid="));
  assert.ok(visitorCookie);
  const returning = await request(backend, { ...headers, "cf-ipcity": "", cookie: visitorCookie.split(";")[0] });
  assert.equal(returning.status, 200);
  assert.equal(visits[1].visitorId, visit.visitorId);
  assert.equal(visits[1].isReturning, true);
  assert.equal(visits[1].city, "UNKNOWN");
  assert.equal(visits[1].geoSource, "cloudflare-headers");
  const head = await request(backend, headers, "HEAD");
  assert.equal(head.body, "");
  assert.equal(visits.length, 2);
});
