# MongoDB Visitor & IP Tracking Architecture for `faphouse3.com`

This guide explains how visitor traffic, IP addresses, geolocation, and request metadata are captured and stored in **MongoDB** when users hit `faphouse3.com`.

## Lambda completion and troubleshooting

During Lambda initialization, the handler module opens MongoDB using top-level
`await`. This runs once per execution environment, before its first request.
On-demand Lambda normally initializes when traffic arrives; deploying a function
does not by itself keep a connected instance running. Provisioned concurrency can
initialize environments ahead of requests. Local imports retain lazy connection
setup so scripts can load their configuration first.

Before each tracking operation, a cached pool is checked with `{ ping: 1 }`.
If the check fails, the stale client is closed and a new connection is established
before any writes start. Concurrent callers share that health check or connection
attempt. Startup failures are logged without preventing HTML delivery; the next
tracking request retries. Look for `[DB:INIT_READY]`, `[DB:CONNECTION_REUSED]`,
or `[DB:RECONNECTING]`. A ping adds one database round trip to warm tracking
requests. Writes themselves are not replayed after failures.

The Lambda handler awaits the visit insert and both counter updates before
returning HTML. A 350 ms `Promise.race` does not cancel MongoDB work, and Lambda
can freeze unfinished work after the response. Server-rendered pages disable the
browser tracking beacon to avoid counting the same pageview twice. The standalone
`/api/track` endpoint also awaits its writes and returns HTTP 503 on failure.

Set the Lambda timeout to at least **15 seconds**. Connection selection and
individual MongoDB operations have 2-second timeouts; the handler performs a
health check, a possible reconnection, and three writes. Cold requests can take longer than 350 ms.
The local demo server is a long-running process and still tracks after serving HTML.

For a Lambda console test, use `rawPath: "/"` and
`rawQueryString: "debug=true"`. This returns `dbStatus: "ok"` only after all writes
finish, or `dbStatus: "failed"` with the actual error. The console does not run
HTML or send browser beacons. A loopback IP (`127.0.0.1`) and `UNKNOWN` location
mean the event lacks real visitor IP/geolocation fields; they do not diagnose
MongoDB connectivity. Supply the HTTP API v2 request context and headers from a
real request to exercise metadata extraction.

Normal pages still return HTML when tracking fails. Writes to the visit log and
the two counters are separate operations, so a failure may leave partial
analytics. The browser does not retry these writes automatically. On successful
saves, look for `[DB:COMPLETED]` followed by `[DB:SYNC]` in CloudWatch.

Run `npm test` for offline tracking regression tests. These use a mocked MongoDB
client and do not connect to Atlas or load `.env`.

---

## 1. What Details Can We Track & Where Do They Come From?

When a user visits `https://faphouse3.com/watch/video-42?ref=campaign`, their browser sends an HTTP request through Cloudflare and AWS API Gateway into AWS Lambda.

We extract the following metadata:

| Detail | Source Header / Event Property | Example Value |
|---|---|---|
| **Real Visitor IP** | `event.headers['cf-connecting-ip']` *(Cloudflare)*<br>or `event.headers['x-forwarded-for']`<br>or `event.requestContext.http.sourceIp` | `"103.21.244.15"` |
| **Country Code** | `event.headers['cf-ipcountry']` *(Provided free by Cloudflare)* | `"US"`, `"DE"`, `"IN"` |
| **City** | `event.headers['cf-ipcity']` *(Cloudflare)* | `"San Jose"`, `"Frankfurt"` |
| **User-Agent** | `event.headers['user-agent']` | `"Mozilla/5.0 (iPhone; CPU iPhone OS...)"` |
| **Referrer** | `event.headers['referer']` | `"https://twitter.com/..."` or `"direct"` |
| **Requested Path** | `event.rawPath` | `"/watch/sample-video"` |
| **Query Parameters**| `event.rawQueryString` | `"ref=campaign&tag=trending"` |
| **Timestamp** | `new Date()` | `2026-10-19T03:30:00.000Z` |

---

## 2. MongoDB Dual-Collection Storage Design

We recommend organizing your MongoDB database (`faphouse3_analytics`) into **two collections**:

```
faphouse3_analytics/
├── visits   # Detailed event stream (1 document per visit)
└── stats    # High-speed aggregate counters (daily & cumulative totals)
```

### Collection 1: `visits` (Granular Audit Log)
Stores the full forensic breakdown of every visitor:

```json
{
  "_id": ObjectId("67132100a7b45c0012345678"),
  "domain": "faphouse3.com",
  "ip": "103.21.244.15",
  "country": "US",
  "city": "San Jose",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0",
  "referer": "https://google.com/search?q=faphouse3",
  "path": "/watch/sample-video",
  "queryString": "source=ref_campaign",
  "targetRedirect": "https://faphouse2.com/watch/sample-video?source=ref_campaign",
  "createdAt": ISODate("2026-10-19T03:30:00.000Z")
}
```

### Collection 2: `stats` (Atomic Aggregate Counters)
Maintains instant counters without scanning millions of raw rows:

```json
{
  "_id": ObjectId("67132100a7b45c0012345679"),
  "domain": "faphouse3.com",
  "period": "DAILY#2026-10-19",
  "totalVisits": 1420,
  "lastVisitedAt": ISODate("2026-10-19T03:30:00.000Z")
}
```

---

## 3. Serverless Connection Pooling Pattern in AWS Lambda

> ⚠️ **Critical Rule for Serverless MongoDB**:  
> In AWS Lambda, **never** call `await MongoClient.connect()` inside the `handler` function without caching. Doing so creates a new TCP socket connection on every single HTTP request, quickly exhausting MongoDB connection limits and causing 200ms+ latency penalties.

### The Recommended Pattern:
Declare the connection variable **outside** the handler function so warm Lambda containers reuse existing connections:

```javascript
import { MongoClient } from "mongodb";

let cachedDb = null;

async function getDatabase() {
  if (cachedDb) return cachedDb;

  const client = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 3000
  });

  await client.connect();
  cachedDb = client.db(process.env.MONGODB_DB_NAME || "faphouse3_analytics");
  return cachedDb;
}

export async function handler(event, context) {
  // CRITICAL: Tells Lambda to return the HTTP response immediately
  // without waiting for background MongoDB connection sockets to drain.
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  const db = await getDatabase();
  
  // Your database operations here...
}
```

---

## 4. How to Insert Records & Increment Counters

```javascript
// Step 1: Insert Granular Log
await db.collection("visits").insertOne({
  domain: "faphouse3.com",
  ip: clientIp,
  country: country,
  city: city,
  userAgent: userAgent,
  referer: referer,
  path: path,
  queryString: queryString,
  targetRedirect: destinationUrl,
  createdAt: new Date()
});

// Step 2: Atomic Increment Counter
const today = new Date().toISOString().slice(0, 10);
await db.collection("stats").updateOne(
  { domain: "faphouse3.com", period: `DAILY#${today}` },
  {
    $inc: { totalVisits: 1 },
    $set: { lastVisitedAt: new Date() }
  },
  { upsert: true }
);
```

---

## 5. Recommended MongoDB Indexes

Run these index creation commands in MongoDB Compass, `mongosh`, or during initialization to ensure maximum query speed:

```javascript
// 1. Optimize queries by date and domain
db.visits.createIndex({ domain: 1, createdAt: -1 });

// 2. Optimize IP lookups and unique visitor counting
db.visits.createIndex({ ip: 1 });

// 3. Optional TTL Index: Automatically purge visit logs older than 30 days
db.visits.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);
```

---

## 6. How to Query Analytics from MongoDB

Once data is recorded, you can run simple queries to answer business questions:

### A. How many visits happened today?
```javascript
const todayStats = await db.collection("stats").findOne({
  domain: "faphouse3.com",
  period: "DAILY#2026-10-19"
});
console.log(`Visits today: ${todayStats.totalVisits}`);
```

### B. How many unique visitors (by IP) visited today?
```javascript
const startOfDay = new Date("2026-10-19T00:00:00Z");
const uniqueIps = await db.collection("visits").distinct("ip", {
  domain: "faphouse3.com",
  createdAt: { $gte: startOfDay }
});
console.log(`Unique visitors today: ${uniqueIps.length}`);
```

### C. Top 5 countries sending traffic:
```javascript
const topCountries = await db.collection("visits").aggregate([
  { $match: { domain: "faphouse3.com" } },
  { $group: { _id: "$country", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 5 }
]).toArray();
```
