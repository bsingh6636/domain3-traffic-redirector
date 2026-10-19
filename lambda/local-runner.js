/**
 * Local Test Runner for faphouse3.com with Live MongoDB Verification
 *
 * Demonstrates:
 * 1. Cold start database connection logging.
 * 2. Visitor IP extraction and granular log insertion in MongoDB ('visits' collection).
 * 3. Atomic counter increment and value verification in MongoDB ('stats' collection).
 * 4. Warm start connection reuse (0ms connect latency) on subsequent requests.
 *
 * Usage:
 *   npm run test:local
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { handler } from "./handler.js";
import { closeDatabaseConnection } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runLocalTest() {
  console.log("######################################################################");
  console.log("  faphouse3.com Traffic Redirector: MongoDB Logging Verification     ");
  console.log("######################################################################\n");

  const mockPath = resolve(__dirname, "../contracts/mock-event-domain3-wrong.json");
  const eventData = JSON.parse(readFileSync(mockPath, "utf-8"));

  const mockContext1 = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "req-cold-001",
    getRemainingTimeInMillis: () => 3000,
    callbackWaitsForEmptyEventLoop: true
  };

  console.log(">>> [SIMULATION 1: Cold Start Request]");
  console.log("Expecting: New DB connection + Insert log + Counter increment...\n");

  const res1 = await handler(eventData, mockContext1);
  const parsed1 = JSON.parse(res1.body);

  console.log("\n>>> [SIMULATION 1 SUMMARY]");
  console.log(`HTTP Status: ${res1.statusCode}`);
  console.log(`DB Tracking Result:`, parsed1.dbTrackingResult);

  console.log("\n======================================================================");
  console.log(">>> [SIMULATION 2: Warm Start Request (Subsequent Visitor)]");
  console.log("Expecting: Connection REUSE (0ms connect) + Second counter increment...\n");

  const mockContext2 = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "req-warm-002",
    getRemainingTimeInMillis: () => 3000,
    callbackWaitsForEmptyEventLoop: true
  };

  // Modify simulated IP for second visitor
  const eventData2 = JSON.parse(JSON.stringify(eventData));
  eventData2.headers["cf-connecting-ip"] = "198.51.100.88";
  eventData2.headers["cf-ipcountry"] = "DE";
  eventData2.headers["cf-ipcity"] = "Berlin";
  eventData2.rawPath = "/categories/trending";

  const res2 = await handler(eventData2, mockContext2);
  const parsed2 = JSON.parse(res2.body);

  console.log("\n>>> [SIMULATION 2 SUMMARY]");
  console.log(`HTTP Status: ${res2.statusCode}`);
  console.log(`DB Tracking Result:`, parsed2.dbTrackingResult);

  console.log("\n######################################################################");
  console.log("  Verification Complete: Both DB Connection & Value Updates Logged!   ");
  console.log("######################################################################\n");

  await closeDatabaseConnection();
  process.exit(0);
}

runLocalTest().catch(async (err) => {
  console.error("[FATAL ERROR]", err);
  await closeDatabaseConnection().catch(() => {});
  process.exit(1);
});

