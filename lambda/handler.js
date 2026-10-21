/** QuietTab website and MongoDB pageview handler (HTTP API v2 / Function URL). */
import { readFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { getDatabase, recordVisit } from "./db.js";
import { renderSite, robots, sitemap, siteConfig } from "./site.js";
import { extractVisitorMetadata } from "./visitor.js";

if (process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.ANALYTICS_ENABLED !== "false") {
  console.log("[DB:INIT] Opening MongoDB connection during Lambda initialization...");
  try {
    await getDatabase();
    console.log("[DB:INIT_READY] MongoDB connection is ready for requests.");
  } catch (error) {
    console.error(`[DB:INIT_ERROR] ${error.message}. Tracking requests will retry.`);
  }
}

const ASSETS = {
  "/site.css": ["site.css", "text/css; charset=utf-8"],
  "/style.css": ["site.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "application/javascript; charset=utf-8"],
  "/tools.js": ["tools.js", "application/javascript; charset=utf-8"],
  "/config.js": ["config.js", "application/javascript; charset=utf-8"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"],
  "/favicon.ico": ["favicon.svg", "image/svg+xml"],
  "/social-card.svg": ["social-card.svg", "image/svg+xml"]
};
const assetCache = new Map();
const BOT = /bot|crawler|spider|slurp|scrapy|headless|curl|wget|python|go-http-client|InternetMeasurement|MonsterLeadRadar/i;
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "SAMEORIGIN"
};

function cookie(event, name) {
  const parts = [...(Array.isArray(event.cookies) ? event.cookies : []), ...(String(event.headers?.cookie || "").split(";"))];
  return parts.map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}
function safeReferrer(value) {
  try { return new URL(value).origin; } catch { return "direct"; }
}
function debugAllowed(headers) {
  const expected = process.env.DEBUG_TOKEN;
  const supplied = (headers.authorization || "").replace(/^Bearer /i, "");
  return Boolean(expected && supplied && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}
function response(statusCode, body, type = "text/html; charset=utf-8", headers = {}) {
  return { statusCode, headers: { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "no-store", ...headers }, body };
}

export async function handler(rawEvent = {}, context) {
  const started = Date.now();
  const event = { ...rawEvent, headers: Object.fromEntries(Object.entries(rawEvent.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])) };
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  try {
    const result = await processRequest(event, context, started, method);
    if (method === "HEAD") result.body = "";
    return result;
  } catch (error) {
    console.error(`[REQUEST:ERROR] ${error.message}`);
    return response(500, "The page could not be loaded. Please try again.", "text/plain; charset=utf-8");
  }
}

async function processRequest(event, context, started, method) {
  const path = event.rawPath || event.path || "/";
  const headers = event.headers;
  if (!["GET", "HEAD"].includes(method)) return response(405, "Method not allowed", "text/plain; charset=utf-8", { Allow: "GET, HEAD" });
  if (path === "/api/track") return response(410, JSON.stringify({ status: "retired", message: "Pageviews are recorded once by the server." }), "application/json");
  if (ASSETS[path]) {
    const [file, type] = ASSETS[path];
    if (!assetCache.has(file)) assetCache.set(file, readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8"));
    return response(200, assetCache.get(file), type, { "Cache-Control": "public, max-age=3600" });
  }
  if (path === "/robots.txt") return response(200, robots(), "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
  if (path === "/sitemap.xml") return response(200, sitemap(), "application/xml; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
  if (path === "/ads.txt") {
    let sellers = process.env.ADS_TXT || "";
    if (!sellers) { try { sellers = readFileSync(new URL("../public/ads.txt", import.meta.url), "utf8"); } catch {} }
    return response(sellers.trim() ? 200 : 404, sellers.trim() || "No authorized advertising sellers configured.", "text/plain; charset=utf-8");
  }
  if (path === "/index.html") return response(308, "", "text/plain", { Location: "/" });
  const query = new URLSearchParams(event.rawQueryString || "");
  const isDebug = query.get("debug") === "true" || query.get("debug") === "1";
  if (isDebug && !debugAllowed(headers)) return response(403, JSON.stringify({ status: "forbidden" }), "application/json", { "X-Robots-Tag": "noindex" });

  const page = renderSite(path);
  if (page.statusCode === 404) return response(404, page.html, undefined, { "X-Robots-Tag": "noindex" });
  if (method === "HEAD") return response(200, "");
  const config = siteConfig();
  const existing = cookie(event, "fh3_vid");
  const validId = existing && /^fh3_[a-z0-9_]{8,100}$/i.test(existing);
  const visitorId = validId ? existing : `fh3_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
  const isReturning = Boolean(validId);
  const previousCount = Number(cookie(event, "fh3_vc"));
  const visitCount = isReturning ? (Number.isInteger(previousCount) && previousCount > 0 && previousCount < 1000000 ? previousCount + 1 : 2) : 1;
  const secure = process.env.AWS_LAMBDA_FUNCTION_NAME || headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  const cookieAttributes = `; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`;
  const userAgent = headers["user-agent"] || event.requestContext?.http?.userAgent || "unknown";
  const isBot = BOT.test(userAgent);
  const trafficType = isBot ? "identified-bot" : /Mozilla\//i.test(userAgent) ? "browser-like" : "unknown-client";
  const deviceType = isBot ? "bot" : /iPad|tablet/i.test(userAgent) ? "tablet" : /mobile|iPhone|Android/i.test(userAgent) ? "mobile" : userAgent === "unknown" ? "unknown" : "desktop";
  const visitor = extractVisitorMetadata(event);
  const metadata = {
    domain: config.domain, requestHost: event.requestContext?.domainName || headers.host || config.domain,
    requestId: context?.awsRequestId || event.requestContext?.requestId || "local",
    visitorId, isReturning, visitCount, ...visitor,
    userAgent, referer: safeReferrer(headers.referer), path, queryString: "", targetDestination: "",
    isBot, trafficType, deviceType, analyticsVersion: 2
  };
  let dbResult = null, dbError = null;
  console.log(`[REQUEST] ${method} ${config.domain}${path} | ${trafficType} | IP source: ${visitor.ipSource} | Geo: ${visitor.geoSource}`);
  if (config.analytics) {
    try { dbResult = await recordVisit(metadata); }
    catch (error) { dbError = error; console.error(`[DB:ERROR] Tracking failed: ${error.message}. Serving page.`); }
  }
  const resultHeaders = { "X-Visitor-Id": visitorId, "X-Is-Returning": String(isReturning), "X-Execution-Time": `${Date.now() - started}ms` };
  const cookies = config.analytics ? [`fh3_vid=${visitorId}${cookieAttributes}`, `fh3_vc=${visitCount}${cookieAttributes}`] : [];
  if (cookies.length) resultHeaders["Set-Cookie"] = cookies[0];
  if (isDebug) return { ...response(200, JSON.stringify({
    status: "active", dbStatus: !config.analytics ? "disabled" : dbError ? "failed" : "ok",
    dbError: dbError ? { name: dbError.name, message: dbError.message } : null,
    visitorIdentification: { visitorId, isReturningVisitor: isReturning },
    trackingDetailsExtracted: metadata, dbTrackingResult: dbResult,
    executionTimeMs: Date.now() - started
  }), "application/json", { ...resultHeaders, "X-Robots-Tag": "noindex" }), cookies };
  return { ...response(200, page.html, undefined, resultHeaders), cookies };
}
