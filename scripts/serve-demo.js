/** Local preview uses the actual Lambda routes; MongoDB is opt-in. */
import http from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
} catch (error) { if (error.code !== "ENOENT") throw error; }
process.env.ANALYTICS_ENABLED = process.env.LOCAL_ANALYTICS === "true" ? "true" : "false";
const { handler } = await import("../lambda/handler.js");
const { closeDatabaseConnection } = await import("../lambda/db.js");
const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const result = await handler({
      version: "2.0", rawPath: url.pathname, rawQueryString: url.search.slice(1),
      headers: request.headers,
      requestContext: { domainName: request.headers.host, requestId: randomUUID(), http: { method: request.method, sourceIp: request.socket.remoteAddress, userAgent: request.headers["user-agent"] } }
    }, { awsRequestId: randomUUID(), callbackWaitsForEmptyEventLoop: false });
    for (const [key, value] of Object.entries(result.headers || {})) if (key.toLowerCase() !== "set-cookie") response.setHeader(key, value);
    if (result.cookies?.length) response.setHeader("Set-Cookie", result.cookies);
    response.statusCode = result.statusCode;
    response.end(result.body);
    console.log(`[HTTP] ${request.method} ${url.pathname} ${result.statusCode}`);
  } catch (error) {
    console.error(`[HTTP:ERROR] ${error.message}`);
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("Unable to load the page.");
  }
});
server.listen(port, host, () => {
  console.log(`QuietTab local preview: http://${host}:${port}`);
  console.log(`MongoDB analytics: ${process.env.ANALYTICS_ENABLED === "true" ? "enabled" : "disabled (set LOCAL_ANALYTICS=true to enable)"}`);
});
async function stop() {
  server.close();
  await closeDatabaseConnection().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
