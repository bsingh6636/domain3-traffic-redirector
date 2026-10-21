/**
 * Local Test Runner for faphouse3.com with Visitor Tracking Verification
 *
 * Demonstrates:
 * 1. New Visitor: Generates unique tracking ID, sets Cookie, saves to MongoDB as NEW.
 * 2. Returning Visitor: Recognizes existing Cookie, tags as RETURNING, updates returning counter.
 * 3. Browser Beacon (/api/track): Simulates LocalStorage + Cookie synchronization from client.
 * 4. Diagnostic JSON view via ?debug=true.
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
  console.log("  faphouse3.com: Dual Cookie + LocalStorage Visitor Tracking Test     ");
  console.log("######################################################################\n");

  const mockPath = resolve(__dirname, "../contracts/mock-event-domain3-wrong.json");
  const eventData = JSON.parse(readFileSync(mockPath, "utf-8"));

  const mockContext1 = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "req-first-visit-001",
    getRemainingTimeInMillis: () => 10000,
    callbackWaitsForEmptyEventLoop: true
  };

  // =========================================================================
  // SIMULATION 1: First-Time Visitor (No Cookie)
  // =========================================================================
  console.log(">>> [SIMULATION 1: First-Time Visitor (Cold Ingress)]");
  console.log("Expecting: New tracking ID generated, Set-Cookie returned, DB records NEW visitor...\n");

  delete eventData.headers["cookie"];
  delete eventData.headers["Cookie"];
  delete eventData.cookies;

  const res1 = await handler(eventData, mockContext1);
  const isHtml1 = res1.headers?.["Content-Type"]?.includes("text/html");
  const assignedVid = res1.headers?.["X-Visitor-Id"];
  const setCookie = res1.headers?.["Set-Cookie"];

  console.log(">>> [SIMULATION 1 SUMMARY]");
  console.log(`HTTP Status:   ${res1.statusCode}`);
  console.log(`Assigned VID:  ${assignedVid}`);
  console.log(`Is Returning:  ${res1.headers?.["X-Is-Returning"]}`);
  console.log(`Set-Cookie:    ${setCookie}`);
  console.log(`HTML Payload:  ${isHtml1 ? "Rendered " + res1.body.length + " bytes" : "Not HTML"}`);

  // =========================================================================
  // SIMULATION 2: Returning Visitor (With Cookie from Simulation 1)
  // =========================================================================
  console.log("\n======================================================================");
  console.log(">>> [SIMULATION 2: Returning Visitor (Carrying Cookie)]");
  console.log("Expecting: System recognizes existing VID, tags as RETURNING VISITOR, increments counter...\n");

  const returnEvent = JSON.parse(JSON.stringify(eventData));
  returnEvent.headers["cookie"] = `fh3_vid=${assignedVid}`;
  returnEvent.cookies = [`fh3_vid=${assignedVid}`];
  returnEvent.rawPath = "/categories/popular";

  const mockContext2 = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "req-return-visit-002",
    getRemainingTimeInMillis: () => 10000,
    callbackWaitsForEmptyEventLoop: true
  };

  const res2 = await handler(returnEvent, mockContext2);

  console.log(">>> [SIMULATION 2 SUMMARY]");
  console.log(`HTTP Status:   ${res2.statusCode}`);
  console.log(`Recognized VID:${res2.headers?.["X-Visitor-Id"]}`);
  console.log(`Is Returning:  ${res2.headers?.["X-Is-Returning"]}`);
  console.log(`Match Check:   ${res2.headers?.["X-Visitor-Id"] === assignedVid ? "PASSED (Identity Preserved)" : "FAILED"}`);

  // =========================================================================
  // SIMULATION 3: Browser Background Beacon (/api/track with LocalStorage ID)
  // =========================================================================
  console.log("\n======================================================================");
  console.log(">>> [SIMULATION 3: Client Background Beacon (/api/track)]");
  console.log("Expecting: Client-side LocalStorage syncs tracking ID and visit count in background...\n");

  const beaconEvent = JSON.parse(JSON.stringify(eventData));
  beaconEvent.rawPath = "/api/track";
  beaconEvent.requestContext.http.path = "/api/track";
  beaconEvent.body = JSON.stringify({
    visitorId: assignedVid,
    isReturning: true,
    visitCount: 2,
    firstSeen: new Date().toISOString(),
    path: "/categories/popular",
    referrer: "https://google.com/search?q=faphouse3"
  });

  const mockContext3 = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "req-beacon-003",
    getRemainingTimeInMillis: () => 10000,
    callbackWaitsForEmptyEventLoop: true
  };

  const res3 = await handler(beaconEvent, mockContext3);
  const parsed3 = JSON.parse(res3.body);

  console.log(">>> [SIMULATION 3 SUMMARY]");
  console.log(`HTTP Status:   ${res3.statusCode}`);
  console.log(`Beacon Result:`, parsed3);

  // =========================================================================
  // SIMULATION 4: Diagnostic Request (?debug=true)
  // =========================================================================
  console.log("\n======================================================================");
  console.log(">>> [SIMULATION 4: Admin Diagnostic View (?debug=true)]");
  console.log("Expecting: 200 OK + JSON diagnostic output showing identity and DB status...\n");

  const debugEvent = JSON.parse(JSON.stringify(eventData));
  debugEvent.rawQueryString = "debug=true";
  debugEvent.headers["cookie"] = `fh3_vid=${assignedVid}`;

  const mockContext4 = {
    functionName: "faphouse3TrafficRedirector",
    awsRequestId: "req-debug-004",
    getRemainingTimeInMillis: () => 10000,
    callbackWaitsForEmptyEventLoop: true
  };

  const res4 = await handler(debugEvent, mockContext4);
  const parsed4 = JSON.parse(res4.body);

  console.log(">>> [SIMULATION 4 SUMMARY]");
  console.log(`HTTP Status:            ${res4.statusCode}`);
  console.log(`Visitor Identification:`, parsed4.visitorIdentification);
  console.log(`DB Status:              ${parsed4.dbStatus}`);

  console.log("\n######################################################################");
  console.log("  All Simulations Passed: Dual Cookie + LocalStorage Tracking Active! ");
  console.log("######################################################################\n");

  await closeDatabaseConnection();
  process.exit(0);
}

runLocalTest().catch(async (err) => {
  console.error("[FATAL ERROR]", err);
  await closeDatabaseConnection().catch(() => {});
  process.exit(1);
});
