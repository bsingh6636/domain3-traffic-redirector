/**
 * Local Test Runner for faphouse3.com
 *
 * Runs your Lambda handler locally with mock API Gateway events,
 * allowing you to test your domain tracking, 10-second redirect, and image carousel logic instantly.
 *
 * Usage:
 *   node lambda/local-runner.js
 *   npm run test:local
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { handler } from "./handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runLocalTest() {
  console.log("=================================================");
  console.log(" faphouse3.com Traffic Redirector: Local Test    ");
  console.log("=================================================\n");

  const mockPath = resolve(__dirname, "../contracts/mock-event-domain3-wrong.json");
  const eventData = JSON.parse(readFileSync(mockPath, "utf-8"));

  console.log(`[INFO] Loaded mock event for domain: "${eventData.requestContext.domainName}"`);
  console.log(`[INFO] Path: "${eventData.rawPath}", Query: "${eventData.rawQueryString}"\n`);

  const mockContext = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "local-test-req-001",
    getRemainingTimeInMillis: () => 3000
  };

  try {
    const startTime = Date.now();
    const result = await handler(eventData, mockContext);
    const duration = Date.now() - startTime;

    console.log(`[SUCCESS] Handler completed in ${duration}ms\n`);
    console.log("Response Object:");
    console.log("----------------");
    console.log(`Status Code: ${result.statusCode}`);
    console.log("Headers:", JSON.stringify(result.headers, null, 2));
    if (result.body) {
      try {
        console.log("Body (parsed JSON):", JSON.parse(result.body));
      } catch {
        console.log("Body (text/html):", result.body.slice(0, 300) + (result.body.length > 300 ? "..." : ""));
      }
    }
    console.log("\n=================================================");
    console.log(" Next step: Open lambda/handler.js and implement your logic!");
    console.log("=================================================");
  } catch (err) {
    console.error("[ERROR] Lambda handler threw an exception:", err);
  }
}

runLocalTest();
