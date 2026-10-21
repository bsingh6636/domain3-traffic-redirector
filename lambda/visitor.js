import { isIP } from "node:net";

const GEO_FIELDS = {
  cloudflare: { country: "cf-ipcountry", city: "cf-ipcity", region: "cf-region", regionCode: "cf-region-code", continent: "cf-ipcontinent", timezone: "cf-timezone", postalCode: "cf-postal-code", latitude: "cf-iplatitude", longitude: "cf-iplongitude" },
  vercel: { country: "x-vercel-ip-country", city: "x-vercel-ip-city", regionCode: "x-vercel-ip-country-region", continent: "x-vercel-ip-continent", timezone: "x-vercel-ip-timezone", postalCode: "x-vercel-ip-postal-code", latitude: "x-vercel-ip-latitude", longitude: "x-vercel-ip-longitude" },
  cloudfront: { country: "cloudfront-viewer-country", city: "cloudfront-viewer-city", region: "cloudfront-viewer-country-region-name", regionCode: "cloudfront-viewer-country-region", timezone: "cloudfront-viewer-time-zone", postalCode: "cloudfront-viewer-postal-code", latitude: "cloudfront-viewer-latitude", longitude: "cloudfront-viewer-longitude" }
};

function text(value, maxLength = 160) {
  if (value === undefined || value === null) return null;
  let result = String(value).trim();
  try { result = decodeURIComponent(result); } catch { /* Keep malformed encoding as text. */ }
  result = result.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  return result && !["unknown", "null", "undefined"].includes(result.toLowerCase()) ? result : null;
}

function coordinate(value, limit) {
  const normalized = text(value);
  if (!normalized || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function forwardedHost(value) {
  const first = text(String(value || "").split(",")[0], 253);
  if (!first || /[\s/?#@\\]/.test(first)) return null;
  try { return new URL(`https://${first}`).hostname; } catch { return null; }
}

/**
 * Analytics-only metadata. Forwarded headers are not proof of identity.
 * Never combine fields from different geo providers: behind Cloudflare, Vercel
 * can geolocate Cloudflare's edge instead of the original visitor.
 */
export function extractVisitorMetadata(event = {}, { proxyMode = process.env.VISITOR_PROXY_MODE || "auto" } = {}) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([name, value]) => [name.toLowerCase(), value]));
  const mode = ["auto", "cloudflare", "vercel", "cloudfront", "direct"].includes(proxyMode) ? proxyMode : "auto";
  const hasCloudflare = Object.keys(headers).some((name) => name.startsWith("cf-") && text(headers[name]));
  const hasCloudfront = Object.keys(headers).some((name) => name.startsWith("cloudfront-viewer-") && text(headers[name]));
  const hasVercel = Object.keys(headers).some((name) => name.startsWith("x-vercel-") && text(headers[name]));
  const provider = mode !== "auto" ? mode : hasCloudflare ? "cloudflare" : hasCloudfront ? "cloudfront" : hasVercel ? "vercel" : "direct";
  const candidates = [
    ...(provider === "cloudflare" || mode === "auto" ? [["cf-connecting-ipv6", headers["cf-connecting-ipv6"]], ["cf-connecting-ip", headers["cf-connecting-ip"]]] : []),
    ["x-forwarded-for", String(headers["x-forwarded-for"] || "").split(",")[0]],
    ["x-vercel-forwarded-for", String(headers["x-vercel-forwarded-for"] || "").split(",")[0]],
    ["x-real-ip", headers["x-real-ip"]],
    ["request-context", event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp]
  ];
  const [ipSource, ip] = candidates.map(([name, value]) => [name, text(value)]).find(([, value]) => isIP(value || "")) || ["missing", null];
  const names = GEO_FIELDS[provider] || {};
  const read = (field) => text(headers[names[field]]);
  const country = read("country")?.toUpperCase();
  const continent = read("continent")?.toUpperCase();
  const geo = {
    country: /^[A-Z]{2}$/.test(country || "") && country !== "XX" ? country : "UNKNOWN",
    city: read("city") || "UNKNOWN",
    region: read("region"), regionCode: read("regionCode"),
    continent: /^(AF|AN|AS|EU|NA|OC|SA)$/.test(continent || "") ? continent : null,
    timezone: read("timezone"), postalCode: read("postalCode"),
    latitude: coordinate(headers[names.latitude], 90), longitude: coordinate(headers[names.longitude], 180)
  };
  const geoAvailable = Object.entries(geo).some(([name, value]) => !["country", "city"].includes(name) ? value !== null : value !== "UNKNOWN");
  return {
    ip, ipSource, ipIsProxyPeer: provider === "cloudflare" && ip !== null && !ipSource.startsWith("cf-connecting-ip"),
    ...geo, geoProvider: provider, geoAvailable,
    geoSource: geoAvailable ? `${provider}-headers` : "not-provided",
    geoIsApproximate: geoAvailable,
    metadataTrust: ipSource === "missing" && !geoAvailable ? "not-available" : ipSource !== "request-context" || geoAvailable ? "forwarded-unverified" : "request-context",
    forwardedHost: forwardedHost(headers["x-forwarded-host"]),
    cfRay: text(headers["cf-ray"], 100)
  };
}
