import assert from "node:assert/strict";
import { test } from "node:test";
import { extractVisitorMetadata } from "../lambda/visitor.js";

test("Cloudflare visitor headers win over Vercel edge geolocation", () => {
  const metadata = extractVisitorMetadata({ headers: {
    "CF-Connecting-IP": "203.0.113.8", "CF-IPCountry": "in", "CF-IPCity": "New%20Delhi",
    "CF-Region": "National%20Capital%20Territory", "CF-Region-Code": "DL", "CF-IPContinent": "AS",
    "CF-Timezone": "Asia/Kolkata", "CF-Postal-Code": "110001", "CF-IPLatitude": "28.6139", "CF-IPLongitude": "77.2090",
    "X-Forwarded-Host": "www.faphouse3.com", "CF-Ray": "example-BOM",
    "x-vercel-ip-country": "US", "x-vercel-ip-city": "Ashburn", "x-forwarded-for": "198.51.100.1"
  } });
  assert.equal(metadata.ip, "203.0.113.8");
  assert.equal(metadata.city, "New Delhi");
  assert.equal(metadata.country, "IN");
  assert.equal(metadata.region, "National Capital Territory");
  assert.equal(metadata.regionCode, "DL");
  assert.equal(metadata.continent, "AS");
  assert.equal(metadata.timezone, "Asia/Kolkata");
  assert.equal(metadata.postalCode, "110001");
  assert.equal(metadata.latitude, 28.6139);
  assert.equal(metadata.longitude, 77.209);
  assert.equal(metadata.forwardedHost, "www.faphouse3.com");
  assert.equal(metadata.geoSource, "cloudflare-headers");
  assert.equal(metadata.metadataTrust, "forwarded-unverified");
  assert.equal(metadata.ipIsProxyPeer, false);
});

test("missing Cloudflare geo stays unknown and never mixes providers", () => {
  const metadata = extractVisitorMetadata({ headers: {
    "cf-connecting-ip": "203.0.113.8", "cf-ipcountry": "IN", "cf-ipcity": "   ",
    "x-vercel-ip-city": "Ashburn", "cloudfront-viewer-city": "Washington",
    "x-vercel-ip-latitude": "38.9"
  } });
  assert.equal(metadata.country, "IN");
  assert.equal(metadata.city, "UNKNOWN");
  assert.equal(metadata.latitude, null);
  const absent = extractVisitorMetadata({ headers: { "x-vercel-ip-city": "Ashburn" } }, { proxyMode: "cloudflare" });
  assert.equal(absent.geoSource, "not-provided");
  assert.equal(absent.city, "UNKNOWN");
  assert.equal(absent.geoAvailable, false);
});

test("direct Vercel and CloudFront deployments can explicitly select their own provider", () => {
  const vercel = extractVisitorMetadata({ headers: {
    "x-vercel-ip-country": "US", "x-vercel-ip-city": "San%20Francisco", "x-real-ip": "203.0.113.1"
  } }, { proxyMode: "vercel" });
  assert.equal(vercel.city, "San Francisco");
  assert.equal(vercel.geoSource, "vercel-headers");
  assert.equal(vercel.ipSource, "x-real-ip");
  const cloudfront = extractVisitorMetadata({ headers: { "cloudfront-viewer-country": "FR", "cloudfront-viewer-city": "Paris" } });
  assert.equal(cloudfront.geoSource, "cloudfront-headers");
  assert.equal(cloudfront.city, "Paris");
});

test("IPv6, invalid IPs, missing fields, malformed encoding and zero coordinates are handled", () => {
  const metadata = extractVisitorMetadata({ headers: {
    "cf-connecting-ipv6": "2001:db8::1", "cf-connecting-ip": "240.0.0.1",
    "cf-ipcity": "Bad%ZZ", "cf-ipcountry": "XX", "cf-iplatitude": "0", "cf-iplongitude": "181"
  } });
  assert.equal(metadata.ip, "2001:db8::1");
  assert.equal(metadata.ipSource, "cf-connecting-ipv6");
  assert.equal(metadata.latitude, 0);
  assert.equal(metadata.longitude, null);
  assert.equal(metadata.city, "Bad%ZZ");
  assert.equal(metadata.country, "UNKNOWN");
  assert.equal(extractVisitorMetadata().ip, null);
  const fallback = extractVisitorMetadata({ headers: { "cf-connecting-ip": "invalid", "x-forwarded-for": "198.51.100.2, 198.51.100.3" } });
  assert.equal(fallback.ip, "198.51.100.2");
  assert.equal(fallback.ipIsProxyPeer, true);
});
