/**
 * AWS Lambda Handler Template: Multi-Domain Traffic Tracker & Router
 *
 * NOTE FOR DEVELOPER:
 * You are writing the implementation logic yourself!
 * This template provides the structure, signatures, event contracts,
 * and step-by-step guidance so you can learn how AWS Lambda handles multi-domain traffic.
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
 * Main Lambda Handler function invoked by API Gateway (HTTP API v2 payload format).
 *
 * @param {import('../contracts/lambda-types').APIGatewayHttpApiV2Event} event - The API Gateway v2 event
 * @param {object} context - Lambda runtime context
 * @returns {Promise<import('../contracts/lambda-types').APIGatewayHttpApiV2Result>} HTTP API v2 response
 */
export async function handler(event, context) {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // =========================================================================
  // STEP 1: Identify the Incoming Domain and Path
  // =========================================================================
  // API Gateway HTTP API populates event.requestContext.domainName with the exact
  // domain requested by the user's browser (e.g. "faphouse3.com", "faphouse.com", "faphouse2.com").
  // Fallback: event.headers?.['host']
  //
  // YOUR TASK:
  // - Extract the domain name.
  // - Extract the rawPath (e.g. "/watch/sample-video") and rawQueryString.
  const rawDomain = event.requestContext?.domainName || event.headers?.["host"] || "unknown-domain";
  const domain = rawDomain.toLowerCase().replace(/^www\./, "");
  const path = event.rawPath || "/";
  const queryString = event.rawQueryString ? `?${event.rawQueryString}` : "";

  // =========================================================================
  // STEP 2: Filter Visit Types (Page Views vs Noise)
  // =========================================================================
  // Browsers often request "/favicon.ico", "/robots.txt", or static assets.
  // Decide whether you want to count every request or only top-level navigation:
  // e.g.: const isAsset = path.endsWith(".ico") || path.endsWith(".png") || path.endsWith(".css");
  //
  // YOUR TASK:
  // - Determine if this request should increment your analytics counter.

  // =========================================================================
  // STEP 3: Record Visit to Storage (e.g. DynamoDB)
  // =========================================================================
  // Recommended DynamoDB UpdateCommand pattern for atomic increment:
  //
  // const command = new UpdateCommand({
  //   TableName: process.env.TRACKING_TABLE_NAME || "DomainTrafficStats",
  //   Key: {
  //     domain: domain,
  //     metric: "TOTAL_VISITS" // Or `DATE#${new Date().toISOString().slice(0, 10)}`
  //   },
  //   UpdateExpression: "ADD visitCount :inc SET lastVisitedAt = :ts",
  //   ExpressionAttributeValues: {
  //     ":inc": 1,
  //     ":ts": new Date().toISOString()
  //   }
  // });
  // await docClient.send(command);
  //
  // YOUR TASK:
  // - Implement your database persistence call here.
  // - Catch errors gracefully so a database outage doesn't block redirection.

  // =========================================================================
  // STEP 4: Determine Routing / Redirect Action
  // =========================================================================
  // For this project:
  // - "faphouse3.com" is the new domain under demonstration.
  //   If a user visits faphouse3.com, you can either:
  //   A) Return an HTTP 302/301 redirect directly with a "Location" header.
  //   B) Return HTTP 200 with an HTML landing page (e.g. "You've reached the wrong domain. Redirecting...").
  //
  // YOUR TASK:
  // - Define your routing table or conditional branch.
  // - For demonstration: target domain is "https://faphouse2.com".
  const targetDestination = `https://faphouse2.com${path}${queryString}`;

  // =========================================================================
  // STEP 5: Construct and Return the HTTP Response
  // =========================================================================
  // Example A: Direct HTTP 302 Redirect
  // return {
  //   statusCode: 302,
  //   headers: {
  //     "Location": targetDestination,
  //     "Cache-Control": "no-cache, no-store, must-revalidate"
  //   }
  // };
  //
  // Example B: Intermediate HTML warning page
  // (You can read public/index.html or return an inline HTML template)

  // SKELETON PLACEHOLDER RESPONSE (Update this with your own logic):
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Processed-Domain": domain
    },
    body: JSON.stringify({
      message: "Multi-Domain Traffic Gateway Skeleton",
      status: "ready_for_implementation",
      incomingDomain: domain,
      targetDestination: targetDestination,
      hints: [
        "Review docs/04-lambda-developer-guide.md for implementation steps",
        "Configure DynamoDB UpdateCommand in Step 3",
        "Return either 302 redirect or HTML demonstration in Step 5"
      ]
    })
  };
}
