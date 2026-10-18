/**
 * AWS Lambda Handler: faphouse3.com Traffic Tracker & Redirector (MongoDB Edition)
 *
 * NOTE FOR DEVELOPER:
 * You are writing the backend logic yourself!
 * This template demonstrates how to extract visitor IP, geolocation, and request metadata,
 * provides connection pooling for MongoDB, and includes structured console logging
 * for easy observation in AWS CloudWatch and local testing.
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
//   console.log("[MONGODB] Initializing new connection to MongoDB cluster...");
//   const startTime = Date.now();
//   const client = new MongoClient(uri, {
//     maxPoolSize: 10,
//     serverSelectionTimeoutMS: 3000
//   });
//   await client.connect();
//   cachedClient = client;
//   cachedDb = client.db(process.env.MONGODB_DB_NAME || "faphouse3_analytics");
//   console.log(`[MONGODB] Connected successfully in ${Date.now() - startTime}ms.`);
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
  const requestStartTime = Date.now();
  const requestId = context?.awsRequestId || event.requestContext?.requestId || "local-req";

  // Prevent Lambda from waiting for MongoDB's background connection pool to close
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  // =========================================================================
  // STEP 1: Extract Visitor IP, Location, Device, and Request Details
  // =========================================================================
  const httpMethod = event.requestContext?.http?.method || "GET";
  const path = event.rawPath || "/";
  const queryString = event.rawQueryString ? `?${event.rawQueryString}` : "";

  // 1. IP Address extraction:
  let ipSource = "direct-sourceIp";
  let clientIp = event.requestContext?.http?.sourceIp || "127.0.0.1";

  if (event.headers?.["cf-connecting-ip"]) {
    clientIp = event.headers["cf-connecting-ip"];
    ipSource = "cf-connecting-ip (Cloudflare True IP)";
  } else if (event.headers?.["x-forwarded-for"]) {
    clientIp = event.headers["x-forwarded-for"].split(",")[0].trim();
    ipSource = "x-forwarded-for (Proxy Header)";
  }

  // 2. Geolocation headers:
  const country = event.headers?.["cf-ipcountry"] || event.headers?.["cloudfront-viewer-country"] || "UNKNOWN";
  const city = event.headers?.["cf-ipcity"] || "UNKNOWN";

  // 3. User-Agent & Referer:
  const userAgent = event.headers?.["user-agent"] || "unknown";
  const referer = event.headers?.["referer"] || "direct";

  // 4. Ingress domain & target reconstruction:
  const domain = event.requestContext?.domainName || event.headers?.["host"] || "faphouse3.com";
  const targetOrigin = process.env.TARGET_DOMAIN || "https://faphouse2.com";
  const targetDestination = `${targetOrigin.replace(/\/$/, "")}${path}${queryString}`;

  // =========================================================================
  // STRUCTURED CONSOLE LOGS (CloudWatch & Local Observability)
  // =========================================================================
  console.log("----------------------------------------------------------------------");
  console.log(`[REQUEST] ${httpMethod} ${domain}${path}${queryString} [ID: ${requestId}]`);
  console.log(`[VISITOR] IP: ${clientIp} (Resolved via: ${ipSource})`);
  console.log(`[GEO]     Country: ${country} | City: ${city}`);
  console.log(`[REFERER] ${referer}`);
  console.log(`[DEVICE]  ${userAgent.slice(0, 120)}${userAgent.length > 120 ? "..." : ""}`);
  console.log(`[ROUTING] Target: ${targetDestination}`);

  // =========================================================================
  // STEP 2: Filter Asset Noise
  // =========================================================================
  const isStaticNoise =
    path.endsWith(".ico") ||
    path.endsWith(".png") ||
    path.endsWith(".css") ||
    path.startsWith("/.well-known");

  if (isStaticNoise) {
    console.log(`[FILTER]  Skipping database tracking for static asset request: "${path}"`);
  } else {
    console.log(`[FILTER]  Valid pageview detected. Proceeding to visit tracking.`);
  }

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
  //     const dbStartTime = Date.now();
  //     const db = await getDatabase();
  //     const today = new Date().toISOString().slice(0, 10);
  //
  //     console.log(`[MONGODB] Recording visit log for IP ${clientIp} (${country})...`);
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
  //
  //     console.log(`[MONGODB] Successfully stored visit & updated counter in ${Date.now() - dbStartTime}ms.`);
  //   } catch (dbErr) {
  //     console.error("[MONGODB ERROR] Database operation failed:", dbErr.message);
  //     console.warn("[MONGODB WARN] Continuing redirect to prevent user disruption.");
  //   }
  // }

  // =========================================================================
  // STEP 4: Return Response (Direct 302 vs 10-Second HTML Notice)
  // =========================================================================
  // Mode A: Direct 302 Redirect
  // console.log(`[RESPONSE] Returning HTTP 302 redirect to: ${targetDestination}`);
  // return {
  //   statusCode: 302,
  //   headers: {
  //     "Location": targetDestination,
  //     "Cache-Control": "no-cache, no-store, must-revalidate"
  //   }
  // };

  // Mode B: Skeleton response for development & testing
  const duration = Date.now() - requestStartTime;
  console.log(`[RESPONSE] Returning 200 OK preview (Execution time: ${duration}ms)`);
  console.log("----------------------------------------------------------------------\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Ingress-Domain": domain,
      "X-Client-IP": clientIp,
      "X-Country": country,
      "X-Redirect-Target": targetDestination,
      "X-Execution-Time": `${duration}ms`
    },
    body: JSON.stringify({
      message: "faphouse3.com -> faphouse2.com Traffic Gateway (MongoDB Ready)",
      status: "ready_for_developer_implementation",
      trackingDetailsExtracted: {
        domain: domain,
        clientIp: clientIp,
        ipSource: ipSource,
        country: country,
        city: city,
        userAgent: userAgent,
        referer: referer,
        path: path,
        targetDestination: targetDestination
      },
      executionTimeMs: duration,
      nextSteps: [
        "Uncomment getDatabase() and the MongoDB insertOne / updateOne operations in Step 3",
        "Configure MONGODB_URI in your .env or Lambda environment variables",
        "Test locally with 'npm run test:local'"
      ]
    })
  };
}
