/**
 * AWS Lambda Handler: faphouse3.com Traffic Tracker & Redirector (MongoDB Edition)
 *
 * NOTE FOR DEVELOPER:
 * You are writing the backend logic yourself!
 * This template demonstrates how to extract visitor IP, geolocation, and request metadata,
 * and provides the connection pooling pattern for MongoDB in a serverless environment.
 *
 * Runtime: Node.js 20.x or Node.js 22.x
 * Handler entry point: lambda/handler.handler
 *
 * @see contracts/mongodb-schema.d.ts for document structures.
 */

// =========================================================================
// MONGODB SERVERLESS CONNECTION CACHING PATTERN
// =========================================================================
// In AWS Lambda, initialize the MongoClient OUTSIDE the handler.
// This allows warm Lambda instances to reuse the existing TCP connection pool
// instead of opening a new database connection on every single request.
//
// import { MongoClient } from "mongodb";
//
// let cachedClient = null;
// let cachedDb = null;
//
// async function getDatabase() {
//   if (cachedDb) return cachedDb;
//   const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
//   const client = new MongoClient(uri, {
//     maxPoolSize: 10,
//     serverSelectionTimeoutMS: 3000
//   });
//   await client.connect();
//   cachedClient = client;
//   cachedDb = client.db(process.env.MONGODB_DB_NAME || "faphouse3_analytics");
//   return cachedDb;
// }

/**
 * Main Lambda Handler invoked by API Gateway (HTTP API v2 payload format).
 *
 * @param {import('../contracts/lambda-types').APIGatewayHttpApiV2Event} event - The API Gateway v2 event
 * @param {object} context - Lambda runtime context
 * @returns {Promise<import('../contracts/lambda-types').APIGatewayHttpApiV2Result>} HTTP API v2 response
 */
export async function handler(event, context) {
  // Prevent Lambda from waiting for MongoDB's background connection pool to close
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  console.log("[faphouse3-gateway] Incoming request event received.");

  // =========================================================================
  // STEP 1: Extract Visitor IP, Location, Device, and Request Details
  // =========================================================================
  // 1. IP Address extraction:
  //    - If behind Cloudflare: event.headers['cf-connecting-ip'] (True visitor IP)
  //    - If behind standard proxy: event.headers['x-forwarded-for']?.split(',')[0].trim()
  //    - Fallback: event.requestContext.http.sourceIp
  const clientIp =
    event.headers?.["cf-connecting-ip"] ||
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.requestContext?.http?.sourceIp ||
    "127.0.0.1";

  // 2. Geolocation headers (provided automatically for free by Cloudflare / CloudFront):
  const country = event.headers?.["cf-ipcountry"] || event.headers?.["cloudfront-viewer-country"] || "UNKNOWN";
  const city = event.headers?.["cf-ipcity"] || "UNKNOWN";

  // 3. User-Agent & Referer:
  const userAgent = event.headers?.["user-agent"] || "unknown";
  const referer = event.headers?.["referer"] || "direct";

  // 4. Ingress domain, Path, and Query parameters:
  const domain = event.requestContext?.domainName || event.headers?.["host"] || "faphouse3.com";
  const path = event.rawPath || "/";
  const queryString = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const targetDestination = `${process.env.TARGET_DOMAIN || "https://faphouse2.com"}${path}${queryString}`;

  // =========================================================================
  // STEP 2: Filter Asset Noise
  // =========================================================================
  const isStaticNoise =
    path.endsWith(".ico") ||
    path.endsWith(".png") ||
    path.endsWith(".css") ||
    path.startsWith("/.well-known");

  // =========================================================================
  // STEP 3: Record to MongoDB (Visits Log + Aggregated Counters)
  // =========================================================================
  // YOUR TASK:
  // Connect to MongoDB and write tracking documents.
  // Wrap this in a try/catch so a slow database query NEVER blocks your redirect!
  //
  // Example implementation pattern:
  // if (!isStaticNoise) {
  //   try {
  //     const db = await getDatabase();
  //     const today = new Date().toISOString().slice(0, 10);
  //
  //     // 3A. Insert granular visit audit log:
  //     await db.collection("visits").insertOne({
  //       domain: domain,
  //       ip: clientIp,
  //       country: country,
  //       city: city,
  //       userAgent: userAgent,
  //       referer: referer,
  //       path: path,
  //       queryString: queryString,
  //       targetRedirect: targetDestination,
  //       createdAt: new Date()
  //     });
  //
  //     // 3B. Atomically increment aggregated total and daily counters:
  //     await db.collection("stats").updateOne(
  //       { domain: domain, period: `DAILY#${today}` },
  //       {
  //         $inc: { totalVisits: 1 },
  //         $set: { lastVisitedAt: new Date() }
  //       },
  //       { upsert: true }
  //     );
  //   } catch (dbErr) {
  //     console.error("[WARN] MongoDB write failed, proceeding with redirect:", dbErr);
  //   }
  // }

  // =========================================================================
  // STEP 4: Return Response (Direct 302 vs 10-Second HTML Notice)
  // =========================================================================
  // Mode A: Direct 302 Redirect
  // return {
  //   statusCode: 302,
  //   headers: {
  //     "Location": targetDestination,
  //     "Cache-Control": "no-cache, no-store, must-revalidate"
  //   }
  // };

  // Skeleton response for local development:
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Ingress-Domain": domain,
      "X-Client-IP": clientIp,
      "X-Country": country,
      "X-Redirect-Target": targetDestination
    },
    body: JSON.stringify({
      message: "faphouse3.com -> faphouse2.com Traffic Gateway (MongoDB Ready)",
      status: "ready_for_developer_implementation",
      trackingDetailsExtracted: {
        domain: domain,
        clientIp: clientIp,
        country: country,
        city: city,
        userAgent: userAgent,
        referer: referer,
        path: path,
        targetDestination: targetDestination
      },
      nextSteps: [
        "Uncomment getDatabase() and the MongoDB insertOne / updateOne operations in Step 3",
        "Configure MONGODB_URI in your .env or Lambda environment variables",
        "Test locally with 'npm run test:local'"
      ]
    })
  };
}
