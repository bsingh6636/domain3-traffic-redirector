import assert from "node:assert/strict";
process.env.ANALYTICS_ENABLED = "false";
const { handler } = await import("./handler.js");
for (const [path, status] of [["/", 200], ["/tools/url-cleaner", 200], ["/tools/password-generator", 200], ["/tools/text-counter", 200], ["/guides/private-browsing", 200], ["/sitemap.xml", 200], ["/robots.txt", 200], ["/does-not-exist", 404]]) {
  const result = await handler({ rawPath: path, headers: {}, requestContext: { http: { method: "GET", sourceIp: "127.0.0.1" } } }, {});
  assert.equal(result.statusCode, status, path);
  console.log(`PASS ${path}: ${status}`);
}
console.log("Local route checks passed. No database connection was used.");
