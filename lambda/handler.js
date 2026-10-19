/**
 * AWS Lambda Handler: faphouse3.com Traffic Tracker & Redirector (MongoDB Edition)
 *
 * Implements visitor tracking, IP extraction, and automated logging for
 * MongoDB database connections and value updates.
 *
 * Runtime: Node.js 20.x or Node.js 22.x
 * Handler entry point: lambda/handler.handler
 *
 * @see contracts/mongodb-schema.d.ts for document structures.
 */

import { recordVisit } from "./db.js";

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
  console.log("======================================================================");
  console.log(`[REQUEST]  ${httpMethod} ${domain}${path}${queryString} [ID: ${requestId}]`);
  console.log(`[VISITOR]  IP: ${clientIp} (Resolved via: ${ipSource})`);
  console.log(`[GEO]      Country: ${country} | City: ${city}`);
  console.log(`[REFERER]  ${referer}`);
  console.log(`[DEVICE]   ${userAgent.slice(0, 110)}${userAgent.length > 110 ? "..." : ""}`);
  console.log(`[ROUTING]  Target: ${targetDestination}`);

  // =========================================================================
  // STEP 2: Filter Asset Noise
  // =========================================================================
  const isStaticNoise =
    path.endsWith(".ico") ||
    path.endsWith(".png") ||
    path.endsWith(".css") ||
    path.startsWith("/.well-known");

  let dbResult = null;

  if (isStaticNoise) {
    console.log(`[FILTER]   Skipping database tracking for static asset request: "${path}"`);
  } else {
    console.log(`[FILTER]   Valid pageview detected. Proceeding to MongoDB tracking.`);

    // =======================================================================
    // STEP 3: Record to MongoDB with Detailed Logging
    // =======================================================================
    try {
      dbResult = await recordVisit({
        domain: domain,
        ip: clientIp,
        country: country,
        city: city,
        userAgent: userAgent,
        referer: referer,
        path: path,
        queryString: queryString,
        targetDestination: targetDestination
      });
    } catch (dbErr) {
      console.error("[DB:ERROR] Database recording failed:", dbErr.message);
      console.warn("[DB:WARN]  Proceeding with redirection to preserve user experience.");
    }
  }

  // =========================================================================
  // STEP 4: Return Response
  // =========================================================================
  // In production redirect mode, return HTTP 302:
  // return {
  //   statusCode: 302,
  //   headers: {
  //     "Location": targetDestination,
  //     "Cache-Control": "no-cache, no-store, must-revalidate"
  //   }
  // };

  const duration = Date.now() - requestStartTime;
  console.log(`[RESPONSE] Completed in ${duration}ms (Status: 200 OK)`);
  console.log("======================================================================\n");

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
      message: "faphouse3.com -> faphouse2.com Traffic Gateway (MongoDB Connected)",
      status: "active",
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
      dbTrackingResult: dbResult || "bypassed_or_failed",
      executionTimeMs: duration
    })
  };
}
