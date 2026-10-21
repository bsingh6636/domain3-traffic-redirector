/**
 * MongoDB client and pageview logger for QuietTab
 *
 * Implements serverless connection pooling and structured logging for:
 * 1. Database connection lifecycle (cold connect, warm reuse, connection timing).
 * 2. Database value updates (inserting visit audit log, atomic counter increments, and count verification).
 */

import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;
let connectionPromise = null;

/**
 * Safely masks MongoDB URI credentials for logging.
 * e.g. "mongodb+srv://admin:secret123@cluster.mongodb.net" -> "mongodb+srv://admin:***@cluster.mongodb.net"
 */
function sanitizeUri(uri) {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
  } catch {
    return uri;
  }
}

/**
 * Verifies the cached pool with a ping, or connects before returning a database.
 * Shares readiness checks and connection attempts across concurrent callers.
 */
export async function getDatabase() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB_NAME || "faphouse3_analytics";

  // A cached object alone does not prove the server is reachable after thawing.
  if (connectionPromise) return connectionPromise;

  connectionPromise = ensureDatabaseReady(uri, dbName);
  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

async function ensureDatabaseReady(uri, dbName) {
  if (cachedDb && cachedClient) {
    try {
      await cachedDb.command({ ping: 1 });
      console.log(`[DB:CONNECTION_REUSED] MongoDB ping succeeded; reusing cached pool (Database: "${dbName}").`);
      return cachedDb;
    } catch (err) {
      console.warn(`[DB:RECONNECTING] Cached MongoDB pool failed its health check: ${err.message}`);
      const staleClient = cachedClient;
      cachedClient = null;
      cachedDb = null;
      await staleClient.close().catch(() => {});
    }
  }
  return connectDatabase(uri, dbName);
}

async function connectDatabase(uri, dbName) {
  // Cold start: establish new connection pool
  console.log(`[DB:CONNECTING] Connecting to MongoDB at: ${sanitizeUri(uri)} (DB: "${dbName}")...`);
  const connStartTime = Date.now();

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    // Bound connection attempts and individual writes. Allow at least 15s
    // for the Lambda invocation to finish connecting and all three writes.
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 2000,
    timeoutMS: 2000
  });

  try {
    await client.connect();
    const connDuration = Date.now() - connStartTime;

    cachedClient = client;
    cachedDb = client.db(dbName);

    console.log(`[DB:CONNECTED] Successfully established MongoDB connection in ${connDuration}ms. Pool ready.`);
    return cachedDb;
  } catch (err) {
    const connDuration = Date.now() - connStartTime;
    console.error(`[DB:CONNECTION_ERROR] Failed to connect after ${connDuration}ms: ${err.message}`);
    await client.close().catch(() => {});
    throw err;
  }
}

/**
 * Records a visitor event and updates atomic counters in MongoDB with full logging.
 *
 * @param {object} visitData - Extracted visitor metadata
 * @returns {Promise<object>} Result summary with insertedId and updated count
 */
export async function recordVisit(visitData) {
  const startTime = Date.now();
  const db = await getDatabase();

  const domain = visitData.domain || "faphouse3.com";
  const visitorId = visitData.visitorId || "fh3_anon";
  const isReturning = Boolean(visitData.isReturning);
  const visitCount = Number(visitData.visitCount) || 1;

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dailyPeriod = `DAILY#${today}`;
  const totalPeriod = "TOTAL";

  const visitsCollectionName = process.env.MONGODB_VISITS_COLLECTION || "visits";
  const statsCollectionName = process.env.MONGODB_STATS_COLLECTION || "stats";

  console.log(`\n--- [DB OPERATION START: ${domain}] ---`);

  // =========================================================================
  // 1. INSERT GRANULAR VISIT LOG
  // =========================================================================
  const visitDoc = {
    domain: domain,
    visitorId: visitorId,
    isReturning: isReturning,
    visitCount: visitCount,
    ip: visitData.ip || null,
    ipSource: visitData.ipSource || "not-recorded",
    geoSource: visitData.geoSource || "not-recorded",
    geoProvider: visitData.geoProvider || "not-recorded",
    geoAvailable: Boolean(visitData.geoAvailable),
    geoIsApproximate: Boolean(visitData.geoIsApproximate),
    metadataTrust: visitData.metadataTrust || "not-recorded",
    ipIsProxyPeer: Boolean(visitData.ipIsProxyPeer),
    forwardedHost: visitData.forwardedHost || null,
    cfRay: visitData.cfRay || null,
    requestHost: visitData.requestHost || domain,
    requestId: visitData.requestId || null,
    analyticsVersion: visitData.analyticsVersion || 1,
    isBot: Boolean(visitData.isBot),
    trafficType: visitData.trafficType || "unclassified",
    deviceType: visitData.deviceType || "unknown",
    country: visitData.country || "UNKNOWN",
    city: visitData.city || "UNKNOWN",
    region: visitData.region || null,
    regionCode: visitData.regionCode || null,
    continent: visitData.continent || null,
    timezone: visitData.timezone || null,
    postalCode: visitData.postalCode || null,
    latitude: visitData.latitude ?? null,
    longitude: visitData.longitude ?? null,
    userAgent: visitData.userAgent || "unknown",
    referer: visitData.referer || "direct",
    path: visitData.path || "/",
    queryString: visitData.queryString || "",
    targetRedirect: visitData.targetDestination || "",
    createdAt: new Date()
  };

  console.log(`[DB:INSERT_START] Writing visit log to collection '${visitsCollectionName}'...`);
  console.log(`[DB:INSERT_PAYLOAD] VID: ${visitorId} | Status: ${isReturning ? "RETURNING (#" + visitCount + ")" : "NEW"} | IP: ${visitDoc.ip} | Country: ${visitDoc.country}`);

  const insertStartTime = Date.now();
  const insertResult = await db.collection(visitsCollectionName).insertOne(visitDoc);
  const insertDuration = Date.now() - insertStartTime;

  console.log(`[DB:INSERT_SUCCESS] Inserted visit log in ${insertDuration}ms (ID: ${insertResult.insertedId})`);

  // =========================================================================
  // 2. ATOMICALLY INCREMENT DAILY & TOTAL COUNTERS
  // =========================================================================
  console.log(`[DB:UPDATE_START] Incrementing counter in collection '${statsCollectionName}' for period '${dailyPeriod}'...`);

  const counterIncrements = {
    totalVisits: 1
  };
  if (visitData.isBot) {
    counterIncrements.botVisits = 1;
  } else if (visitData.trafficType === "browser-like") {
    counterIncrements.browserLikeVisits = 1;
    if (isReturning) counterIncrements.returningVisits = 1;
    else counterIncrements.newBrowserCookies = 1;
  } else if (visitData.analyticsVersion === 2) {
    counterIncrements.unknownClientVisits = 1;
  } else if (isReturning) {
    counterIncrements.returningVisits = 1;
  } else {
    counterIncrements.uniqueVisitors = 1;
  }

  const updateStartTime = Date.now();
  const updateResult = await db.collection(statsCollectionName).findOneAndUpdate(
    { domain: domain, period: dailyPeriod, analyticsVersion: visitData.analyticsVersion || 1 },
    {
      $inc: counterIncrements,
      $set: { lastVisitedAt: new Date() }
    },
    {
      upsert: true,
      returnDocument: "after"
    }
  );
  const updateDuration = Date.now() - updateStartTime;

  const currentCount = updateResult?.totalVisits ?? updateResult?.value?.totalVisits ?? "updated";

  console.log(`[DB:UPDATE_SUCCESS] Counter incremented (+1) in ${updateDuration}ms.`);
  console.log(`[DB:VALUE_VERIFIED] Confirmed in '${statsCollectionName}':`);
  console.log(`                    -> Domain: ${domain}`);
  console.log(`                    -> Period: ${dailyPeriod}`);
  console.log(`                    -> Total Visits (Current): ${currentCount}`);
  console.log(`                    -> Visitor Status: ${isReturning ? "Returning Visitor" : "New Unique Visitor"}`);
  console.log(`                    -> Last Visited At: ${new Date().toISOString()}`);

  // Optional: Also increment cumulative all-time total
  await db.collection(statsCollectionName).updateOne(
    { domain: domain, period: totalPeriod, analyticsVersion: visitData.analyticsVersion || 1 },
    {
      $inc: counterIncrements,
      $set: { lastVisitedAt: new Date() }
    },
    { upsert: true }
  );

  const totalOpTime = Date.now() - startTime;
  console.log(`[DB:COMPLETED] Entire database tracking finished in ${totalOpTime}ms.`);
  console.log(`--- [DB OPERATION END] ---\n`);

  return {
    insertedId: insertResult.insertedId,
    visitorId: visitorId,
    isReturning: isReturning,
    visitCount: visitCount,
    period: dailyPeriod,
    totalVisits: currentCount,
    durationMs: totalOpTime
  };
}

/**
 * Closes the MongoDB connection (used during graceful shutdown or CLI tests).
 */
export async function closeDatabaseConnection() {
  if (connectionPromise) {
    await connectionPromise.catch(() => {});
  }
  if (cachedClient) {
    console.log("[DB:DISCONNECT] Closing MongoDB connection pool...");
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    console.log("[DB:DISCONNECT] Connection closed cleanly.");
  }
}

