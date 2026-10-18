/**
 * AWS Lambda Handler Template: faphouse3.com Traffic Tracker & Redirector
 *
 * NOTE FOR DEVELOPER:
 * You are writing the backend implementation yourself!
 * This template provides the structure, signatures, event contracts,
 * and step-by-step guidance so you can learn how AWS Lambda handles traffic
 * on faphouse3.com and redirects visitors to faphouse2.com.
 *
 * Runtime: Node.js 20.x or Node.js 22.x
 * Handler entry point: lambda/handler.handler
 *
 * @see contracts/lambda-types.d.ts for detailed type definitions.
 */

// If you choose to use AWS SDK v3 for DynamoDB tracking, import them here:
// import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
// const docClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * Main Lambda Handler invoked by API Gateway (HTTP API v2 payload format) for faphouse3.com.
 *
 * @param {import('../contracts/lambda-types').APIGatewayHttpApiV2Event} event - The API Gateway v2 event
 * @param {object} context - Lambda runtime context
 * @returns {Promise<import('../contracts/lambda-types').APIGatewayHttpApiV2Result>} HTTP API v2 response
 */
export async function handler(event, context) {
  console.log("[faphouse3-gateway] Received event:", JSON.stringify(event, null, 2));

  // =========================================================================
  // STEP 1: Verify Ingress Domain and Extract Path
  // =========================================================================
  // In single-domain mode, all incoming traffic is from faphouse3.com.
  // API Gateway populates event.requestContext.domainName or event.headers.host.
  const domain = event.requestContext?.domainName || event.headers?.["host"] || "faphouse3.com";
  const path = event.rawPath || "/";
  const queryString = event.rawQueryString ? `?${event.rawQueryString}` : "";

  // =========================================================================
  // STEP 2: Filter Visit Types (Page Views vs Noise)
  // =========================================================================
  // Ignore favicon or asset requests so your visitor metrics remain clean:
  const isStaticNoise = path.endsWith(".ico") || path.endsWith(".png") || path.startsWith("/.well-known");

  // =========================================================================
  // STEP 3: Record Visit to DynamoDB (Atomic Counter)
  // =========================================================================
  // Record cumulative visits and daily counts for faphouse3.com:
  //
  // if (!isStaticNoise) {
  //   const today = new Date().toISOString().slice(0, 10); // "2026-10-19"
  //   const command = new UpdateCommand({
  //     TableName: process.env.TRACKING_TABLE_NAME || "DomainTrafficStats",
  //     Key: {
  //       domain: "faphouse3.com",
  //       metric: `DATE#${today}` // or "TOTAL"
  //     },
  //     UpdateExpression: "ADD visitCount :inc SET lastVisitedAt = :ts",
  //     ExpressionAttributeValues: {
  //       ":inc": 1,
  //       ":ts": new Date().toISOString()
  //     }
  //   });
  //   try {
  //     await docClient.send(command);
  //   } catch (dbErr) {
  //     console.error("[WARN] DynamoDB write failed, continuing redirect:", dbErr);
  //   }
  // }

  // =========================================================================
  // STEP 4: Construct Target Destination on faphouse2.com
  // =========================================================================
  // All traffic from faphouse3.com forwards to faphouse2.com with full path and query preservation:
  const targetOrigin = process.env.TARGET_DOMAIN || "https://faphouse2.com";
  const destinationUrl = `${targetOrigin.replace(/\/$/, "")}${path}${queryString}`;

  // =========================================================================
  // STEP 5: Choose Response Mode (Direct 302 Redirect vs Branded HTML Notice)
  // =========================================================================
  // Mode A: Direct 302 Redirect (instant, headless)
  // return {
  //   statusCode: 302,
  //   headers: {
  //     "Location": destinationUrl,
  //     "Cache-Control": "no-cache, no-store, must-revalidate"
  //   }
  // };
  //
  // Mode B: Branded HTML Notice (10-second countdown with image slider)
  // return {
  //   statusCode: 200,
  //   headers: {
  //     "Content-Type": "text/html; charset=utf-8"
  //   },
  //   body: htmlTemplate
  // };

  // SKELETON PLACEHOLDER RESPONSE (Update this with your own logic):
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Ingress-Domain": domain,
      "X-Redirect-Target": destinationUrl
    },
    body: JSON.stringify({
      message: "faphouse3.com -> faphouse2.com Traffic Gateway Skeleton",
      status: "ready_for_developer_implementation",
      ingressDomain: domain,
      targetUrl: destinationUrl,
      countdownSeconds: 10,
      nextSteps: [
        "Uncomment and configure DynamoDB UpdateCommand in Step 3",
        "Choose between 302 redirect or serving the public/index.html UI in Step 5",
        "Test locally with 'npm run test:local'"
      ]
    })
  };
}
