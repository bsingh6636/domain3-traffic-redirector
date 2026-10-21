/**
 * AWS Lambda Handler: faphouse3.com Traffic Tracker & Redirector (HTML Notice & Visitor Tracking Edition)
 *
 * Serves the branded 10-second redirect notice page with image slider and countdown.
 * Automatically identifies first-time vs returning visitors using dual Cookie + LocalStorage tracking.
 * Awaits visitor analytics before returning so Lambda cannot freeze an unfinished write.
 * Handles client-side redirection to faphouse2.com in the browser when the timer expires.
 *
 * Runtime: Node.js 20.x or Node.js 22.x
 * Handler entry point: lambda/handler.handler
 *
 * @see contracts/mongodb-schema.d.ts for document structures.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { getDatabase, recordVisit } from "./db.js";

// Top-level await finishes the connection during Lambda's initialization phase.
// Local imports stay lazy so tests and the demo can configure MongoDB first.
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
  console.log("[DB:INIT] Opening MongoDB connection during Lambda initialization...");
  try {
    await getDatabase();
    console.log("[DB:INIT_READY] MongoDB connection is ready for requests.");
  } catch (err) {
    console.error(`[DB:INIT_ERROR] MongoDB initialization failed: ${err.message}. Tracking requests will retry the connection.`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedHtml = null;
let cachedCss = null;

/**
 * Extracts a named cookie from HTTP API v2 / Lambda Function URL event.
 */
function getCookie(event, name) {
  if (Array.isArray(event?.cookies)) {
    for (const c of event.cookies) {
      const [k, v] = c.split("=");
      if (k?.trim() === name) return v?.trim();
    }
  }
  const cookieHeader = event?.headers?.cookie || event?.headers?.Cookie;
  if (cookieHeader && typeof cookieHeader === "string") {
    const parts = cookieHeader.split(";");
    for (const part of parts) {
      const [k, v] = part.split("=");
      if (k?.trim() === name) return v?.trim();
    }
  }
  return null;
}

/**
 * Generates an ultra-fast, unique visitor tracking ID.
 * e.g. "fh3_m7xyz_a1b2c3d4e5f67890"
 */
function generateTrackingId() {
  const ts = Date.now().toString(36);
  const rand = randomBytes(8).toString("hex");
  return `fh3_${ts}_${rand}`;
}

/**
 * Loads and caches HTML and CSS templates from public/ directory for fast in-memory reuse.
 */
function loadAssets() {
  if (!cachedHtml) {
    try {
      const htmlPath = resolve(__dirname, "../public/index.html");
      cachedHtml = readFileSync(htmlPath, "utf-8");
    } catch (e) {
      console.error("[ASSETS] Could not load index.html:", e.message);
      cachedHtml = "<html><head><title>Redirecting</title></head><body><h1>Redirecting to faphouse2.com...</h1><script>setTimeout(() => window.location.href='https://faphouse2.com', 2000);</script></body></html>";
    }
  }
  if (!cachedCss) {
    try {
      const cssPath = resolve(__dirname, "../public/style.css");
      cachedCss = readFileSync(cssPath, "utf-8");
    } catch (e) {
      console.error("[ASSETS] Could not load style.css:", e.message);
      cachedCss = "";
    }
  }
}

const DEFAULT_SLIDES = [
  {
    image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1000&auto=format&fit=crop",
    title: "Welcome to <strong>Faphouse 3</strong> Ingress",
    description: "You have reached the new domain <strong>faphouse3.com</strong>. You will be automatically redirected to our primary active mirror at <a href='https://faphouse2.com' target='_blank' style='color:#f4bb2e;text-decoration:underline;'>faphouse2.com</a>.",
    badge: "Mirror 3"
  },
  {
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&auto=format&fit=crop",
    title: "Anti-Censorship Edge Infrastructure",
    description: "Our distributed cloud gateway automatically bypasses regional ISP sinkholing to ensure 100% continuous, high-speed streaming.",
    badge: "Global CDN"
  },
  {
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&auto=format&fit=crop",
    title: "100% Account & Bookmark Continuity",
    description: "All your saved bookmarks, preferences, and login sessions are fully preserved on <span style='color:#f4bb2e;font-weight:700;'>faphouse2.com</span>.",
    badge: "Synchronized"
  }
];

function getSlides() {
  if (process.env.SLIDES_JSON) {
    try {
      const parsed = JSON.parse(process.env.SLIDES_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* use default */ }
  }
  return DEFAULT_SLIDES;
}

/**
 * Builds a 100% self-contained HTML page with CSS and dynamic config inlined,
 * ensuring zero broken asset dependencies or 404s when served via Lambda URL.
 */
function renderNoticeHtml({ domain, targetOrigin, countdownSeconds, slides, visitorId, isReturning }) {
  loadAssets();

  const configScript = `
window.REDIRECT_CONFIG = {
  brandName: "FAPHOUSE 3",
  ingressDomain: "${domain || "faphouse3.com"}",
  targetDomain: "${targetOrigin || "https://faphouse2.com"}",
  countdownSeconds: ${Number(countdownSeconds) || 10},
  autoRedirect: true,
  preservePathAndQuery: true,
  visitorId: "${visitorId}",
  isReturning: ${Boolean(isReturning)},
  serverTracking: true,
  slides: ${JSON.stringify(slides)}
};
`;

  let rendered = cachedHtml;
  if (cachedCss) {
    rendered = rendered.replace(
      '<link rel="stylesheet" href="style.css">',
      `<style>\n${cachedCss}\n</style>`
    );
  }
  rendered = rendered.replace(
    '<script src="config.js"></script>',
    `<script>\n${configScript}\n</script>`
  );

  return rendered;
}

/**
 * Main Lambda Handler invoked by API Gateway (HTTP API v2) or Lambda Function URL.
 */
export async function handler(event, context) {
  const requestStartTime = Date.now();
  try {
    return await processRequest(event, context, requestStartTime);
  } catch (err) {
    console.error("[FATAL] Unhandled error in handler:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "error",
        message: "Unhandled error in Lambda handler",
        error: describeError(err),
        diagnostics: buildDiagnostics(),
        executionTimeMs: Date.now() - requestStartTime
      })
    };
  }
}

/** Serialises an Error (name, message, stack) for inclusion in diagnostics. */
function describeError(err) {
  if (!err) return null;
  return {
    name: err?.name || "Error",
    message: err?.message || String(err),
    code: err?.code ?? null,
    stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 8) : null
  };
}

/** Runtime facts useful for debugging a deployment. Never exposes credentials. */
function buildDiagnostics() {
  const uri = process.env.MONGODB_URI || "";
  let mongoHost = null;
  try {
    mongoHost = uri ? uri.replace(/^mongodb(\+srv)?:\/\//, "").replace(/^[^@]*@/, "").split(/[/?]/)[0] : null;
  } catch { /* ignore */ }
  return {
    nodeVersion: process.version,
    mongoUriConfigured: Boolean(uri),
    mongoHost: mongoHost,
    mongoDbName: process.env.MONGODB_DB_NAME || "faphouse3_analytics",
    targetDomain: process.env.TARGET_DOMAIN || "https://faphouse2.com",
    lambdaFunction: process.env.AWS_LAMBDA_FUNCTION_NAME || null,
    lambdaMemoryMb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || null,
    region: process.env.AWS_REGION || null
  };
}

async function processRequest(event, context, requestStartTime) {
  const requestId = context?.awsRequestId || event.requestContext?.requestId || "local-req";

  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  // =========================================================================
  // STEP 1: Extract Visitor IP, Tracking ID, Location, Device, and Request
  // =========================================================================
  const httpMethod = event.requestContext?.http?.method || "GET";
  const path = event.rawPath || "/";
  const queryString = event.rawQueryString ? `?${event.rawQueryString}` : "";

  // 1. Visitor Tracking ID Extraction (Cookie / Identity Resolution)
  const existingCookieVid = getCookie(event, "fh3_vid");
  const isReturning = Boolean(existingCookieVid);
  const visitorId = existingCookieVid || generateTrackingId();
  const cookieHeaderVal = `fh3_vid=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;

  // 2. IP Address extraction:
  let ipSource = "direct-sourceIp";
  let clientIp = event.requestContext?.http?.sourceIp || "127.0.0.1";

  if (event.headers?.["cf-connecting-ip"]) {
    clientIp = event.headers["cf-connecting-ip"];
    ipSource = "cf-connecting-ip (Cloudflare True IP)";
  } else if (event.headers?.["x-forwarded-for"]) {
    clientIp = event.headers["x-forwarded-for"].split(",")[0].trim();
    ipSource = "x-forwarded-for (Proxy Header)";
  }

  // 3. Geolocation headers:
  const country = event.headers?.["cf-ipcountry"] || event.headers?.["cloudfront-viewer-country"] || "UNKNOWN";
  const city = event.headers?.["cf-ipcity"] || "UNKNOWN";

  // 4. User-Agent & Referer:
  const userAgent = event.headers?.["user-agent"] || "unknown";
  const referer = event.headers?.["referer"] || "direct";

  // 5. Ingress domain & target reconstruction:
  const domain = event.requestContext?.domainName || event.headers?.["host"] || "faphouse3.com";
  const targetOrigin = process.env.TARGET_DOMAIN || "https://faphouse2.com";
  const targetDestination = `${targetOrigin.replace(/\/$/, "")}${path}${queryString}`;

  // =========================================================================
  // ROUTE 1: Dedicated Asset Endpoints
  // =========================================================================
  if (path === "/favicon.ico") {
    return {
      statusCode: 204,
      headers: { "Cache-Control": "public, max-age=86400" },
      body: ""
    };
  }

  if (path === "/style.css") {
    loadAssets();
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400" },
      body: cachedCss
    };
  }

  if (path === "/config.js") {
    const configScript = `window.REDIRECT_CONFIG = { brandName: "FAPHOUSE 3", ingressDomain: "${domain.includes("lambda-url") ? "faphouse3.com" : domain}", targetDomain: "${targetOrigin}", countdownSeconds: ${process.env.COUNTDOWN_SECONDS || 10}, autoRedirect: true, preservePathAndQuery: true, visitorId: "${visitorId}", isReturning: ${isReturning}, slides: ${JSON.stringify(getSlides())} };`;
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
        "Set-Cookie": cookieHeaderVal
      },
      cookies: [cookieHeaderVal],
      body: configScript
    };
  }

  // =========================================================================
  // ROUTE 2: Browser Background Tracking Beacon (/api/track)
  // =========================================================================
  if (path === "/api/track") {
    let beaconData = {};
    try {
      beaconData = event.body
        ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body)
        : {};
    } catch { /* ignore JSON parse error */ }

    // Use beacon's visitorId (from LocalStorage) if provided, else fallback to server-side ID
    const effectiveVid = beaconData.visitorId || visitorId;
    const effectiveIsReturning = Boolean(beaconData.isReturning || isReturning);
    const visitCount = Number(beaconData.visitCount) || (effectiveIsReturning ? 2 : 1);
    const beaconCookieVal = `fh3_vid=${effectiveVid}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;

    console.log(`[BEACON] Background tracking: VID=${effectiveVid} | Status=${effectiveIsReturning ? "RETURNING (#" + visitCount + ")" : "NEW"} | IP=${clientIp} (${country})`);
    try {
      const result = await recordVisit({
        domain: domain,
        visitorId: effectiveVid,
        isReturning: effectiveIsReturning,
        visitCount: visitCount,
        ip: clientIp,
        country: country,
        city: city,
        userAgent: userAgent,
        referer: beaconData.referrer || referer,
        path: beaconData.path || path,
        queryString: beaconData.search || queryString,
        targetDestination: targetDestination
      });
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": beaconCookieVal
        },
        cookies: [beaconCookieVal],
        body: JSON.stringify({
          status: "tracked",
          visitorId: effectiveVid,
          isReturning: effectiveIsReturning,
          visitCount: visitCount,
          id: result.insertedId,
          total: result.totalVisits
        })
      };
    } catch (trackErr) {
      console.error("[DB:BEACON_ERROR] Background beacon tracking failed:", trackErr.message);
      return {
        statusCode: 503,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": beaconCookieVal
        },
        cookies: [beaconCookieVal],
        body: JSON.stringify({ status: "failed", error: trackErr.message })
      };
    }
  }

  // =========================================================================
  // STRUCTURED CONSOLE LOGS (CloudWatch & Local Observability)
  // =========================================================================
  console.log("======================================================================");
  console.log(`[REQUEST]  ${httpMethod} ${domain}${path}${queryString} [ID: ${requestId}]`);
  console.log(`[TRACKING] VID: ${visitorId} | Status: ${isReturning ? "RETURNING VISITOR" : "NEW VISITOR"}`);
  console.log(`[VISITOR]  IP: ${clientIp} (Resolved via: ${ipSource})`);
  console.log(`[GEO]      Country: ${country} | City: ${city}`);
  console.log(`[REFERER]  ${referer}`);
  console.log(`[DEVICE]   ${userAgent.slice(0, 110)}${userAgent.length > 110 ? "..." : ""}`);
  console.log(`[ROUTING]  Target: ${targetDestination}`);

  // =========================================================================
  // STEP 2: Finish tracking before returning from this Lambda invocation.
  // =========================================================================
  const isStaticNoise =
    path.endsWith(".ico") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".css") ||
    path.startsWith("/.well-known");

  let dbResult = null;
  let dbError = null;

  if (!isStaticNoise) {
    try {
      dbResult = await recordVisit({
        domain: domain,
        visitorId: visitorId,
        isReturning: isReturning,
        visitCount: isReturning ? 2 : 1,
        ip: clientIp,
        country: country,
        city: city,
        userAgent: userAgent,
        referer: referer,
        path: path,
        queryString: queryString,
        targetDestination: targetDestination
      });
      console.log(`[DB:SYNC] Visit saved before response in ${Date.now() - requestStartTime}ms (VID: ${visitorId}).`);
    } catch (dbErr) {
      dbError = dbErr;
      console.error(`[DB:ERROR] Visit tracking failed: ${dbErr.message}. Serving the redirect page without confirmed analytics.`);
    }
  }

  const duration = Date.now() - requestStartTime;

  // =========================================================================
  // ROUTE 3: Admin Debug View (?debug=true or ?debug=1)
  // =========================================================================
  const isDebug = queryString.includes("debug=true") || queryString.includes("debug=1");
  if (isDebug) {
    const dbStatus = isStaticNoise ? "bypassed" : dbError ? "failed" : "ok";
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieHeaderVal,
        "X-Ingress-Domain": domain,
        "X-Client-IP": clientIp,
        "X-Country": country,
        "X-Visitor-Id": visitorId,
        "X-Is-Returning": String(isReturning),
        "X-Redirect-Target": targetDestination,
        "X-Execution-Time": `${duration}ms`
      },
      cookies: [cookieHeaderVal],
      body: JSON.stringify({
        message: "faphouse3.com -> faphouse2.com Traffic Gateway (Debug Diagnostic Mode)",
        status: "active",
        dbStatus: dbStatus,
        dbError: describeError(dbError),
        visitorIdentification: {
          visitorId: visitorId,
          isReturningVisitor: isReturning,
          cookieFound: Boolean(existingCookieVid)
        },
        diagnostics: buildDiagnostics(),
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
        dbTrackingResult: dbResult,
        executionTimeMs: duration
      })
    };
  }

  // =========================================================================
  // ROUTE 4: Standard Production Response - 10-Second Countdown HTML Notice
  // =========================================================================
  const displayDomain = domain.includes("lambda-url") || domain.includes("amazonaws.com")
    ? (process.env.INGRESS_DOMAIN || "faphouse3.com")
    : domain;

  const html = renderNoticeHtml({
    domain: displayDomain,
    targetOrigin: targetOrigin,
    countdownSeconds: process.env.COUNTDOWN_SECONDS || 10,
    slides: getSlides(),
    visitorId: visitorId,
    isReturning: isReturning
  });

  console.log(`[RESPONSE] Delivering 10-Second Countdown HTML Page in ${duration}ms (Status: 200 OK, VID: ${visitorId})`);
  console.log("======================================================================\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Set-Cookie": cookieHeaderVal,
      "X-Ingress-Domain": displayDomain,
      "X-Client-IP": clientIp,
      "X-Country": country,
      "X-Visitor-Id": visitorId,
      "X-Is-Returning": String(isReturning),
      "X-Redirect-Target": targetDestination,
      "X-Execution-Time": `${duration}ms`
    },
    cookies: [cookieHeaderVal],
    body: html
  };
}
