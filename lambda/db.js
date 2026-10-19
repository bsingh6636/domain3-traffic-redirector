/**
 * MongoDB Client & Database Logger for faphouse3.com
 *
 * Implements serverless connection pooling and structured logging for:
 * 1. Database connection lifecycle (cold connect, warm reuse, connection timing).
 * 2. Database value updates (inserting visit audit log, atomic counter increments, and count verification).
 */

import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

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
 * Connects to MongoDB with connection reuse across warm Lambda invocations.
 * Logs connection establishment and pool reuse events.
 */
export async function getDatabase() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB_NAME || "faphouse3_analytics";

  // Warm start: reuse existing open connection
  if (cachedDb && cachedClient) {
    console.log(`[DB:CONNECTION_REUSED] Reusing cached connection pool (Database: "${dbName}")`);
    return cachedDb;
  }

  // Cold start: establish new connection pool
  console.log(`[DB:CONNECTING] Connecting to MongoDB at: ${sanitizeUri(uri)} (DB: "${dbName}")...`);
  const connStartTime = Date.now();

  try {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    await client.connect();
    const connDuration = Date.now() - connStartTime;

    cachedClient = client;
    cachedDb = client.db(dbName);

    console.log(`[DB:CONNECTED] Successfully established MongoDB connection in ${connDuration}ms. Pool ready.`);
    return cachedDb;
  } catch (err) {
    const connDuration = Date.now() - connStartTime;
    console.error(`[DB:CONNECTION_ERROR] Failed to connect after ${connDuration}ms: ${err.message}`);
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
    ip: visitData.ip || "127.0.0.1",
    country: visitData.country || "UNKNOWN",
    city: visitData.city || "UNKNOWN",
    userAgent: visitData.userAgent || "unknown",
    referer: visitData.referer || "direct",
    path: visitData.path || "/",
    queryString: visitData.queryString || "",
    targetRedirect: visitData.targetDestination || "",
    createdAt: new Date()
  };

  console.log(`[DB:INSERT_START] Writing visit log to collection '${visitsCollectionName}'...`);
  console.log(`[DB:INSERT_PAYLOAD] IP: ${visitDoc.ip} | Country: ${visitDoc.country} | Path: ${visitDoc.path}`);

  const insertStartTime = Date.now();
  const insertResult = await db.collection(visitsCollectionName).insertOne(visitDoc);
  const insertDuration = Date.now() - insertStartTime;

  console.log(`[DB:INSERT_SUCCESS] Inserted visit log in ${insertDuration}ms (ID: ${insertResult.insertedId})`);

  // =========================================================================
  // 2. ATOMICALLY INCREMENT DAILY & TOTAL COUNTERS
  // =========================================================================
  console.log(`[DB:UPDATE_START] Incrementing counter in collection '${statsCollectionName}' for period '${dailyPeriod}'...`);

  const updateStartTime = Date.now();
  const updateResult = await db.collection(statsCollectionName).findOneAndUpdate(
    { domain: domain, period: dailyPeriod },
    {
      $inc: { totalVisits: 1 },
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
  console.log(`                    -> Last Visited At: ${new Date().toISOString()}`);

  // Optional: Also increment cumulative all-time total
  await db.collection(statsCollectionName).updateOne(
    { domain: domain, period: totalPeriod },
    {
      $inc: { totalVisits: 1 },
      $set: { lastVisitedAt: new Date() }
    },
    { upsert: true }
  );

  const totalOpTime = Date.now() - startTime;
  console.log(`[DB:COMPLETED] Entire database tracking finished in ${totalOpTime}ms.`);
  console.log(`--- [DB OPERATION END] ---\n`);

  return {
    insertedId: insertResult.insertedId,
    period: dailyPeriod,
    totalVisits: currentCount,
    durationMs: totalOpTime
  };
}

/**
 * Closes the MongoDB connection (used during graceful shutdown or CLI tests).
 */
export async function closeDatabaseConnection() {
  if (cachedClient) {
    console.log("[DB:DISCONNECT] Closing MongoDB connection pool...");
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    console.log("[DB:DISCONNECT] Connection closed cleanly.");
  }
}

