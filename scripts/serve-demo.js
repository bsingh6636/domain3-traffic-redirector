/**
 * Zero-Dependency Local Demonstration Server
 *
 * Reads .env configuration and serves public/ files with dynamic config synchronization
 * and structured console logging.
 *
 * Usage:
 *   npm run serve
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { recordVisit, closeDatabaseConnection } from "../lambda/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.resolve(__dirname, "../public");

// Parse .env manually (zero external dependencies required)
function parseEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  const envConfig = {};
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf-8");
    raw.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        envConfig[key] = val;
      }
    });
  }
  return envConfig;
}

const envVars = parseEnv();
const PORT = process.env.PORT || envVars.PORT || 3000;

// Expose .env values to process.env so lambda/db.js resolves the same MongoDB config
for (const key of ["MONGODB_URI", "MONGODB_DB_NAME", "MONGODB_VISITS_COLLECTION", "MONGODB_STATS_COLLECTION", "TARGET_DOMAIN", "INGRESS_DOMAIN"]) {
  if (!process.env[key] && envVars[key]) process.env[key] = envVars[key];
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";

  // Dynamic config endpoint that merges .env into client config
  if (parsedUrl.pathname === "/config.js") {
    const env = parseEnv();
    let slides = [];
    try {
      if (env.SLIDES_JSON) {
        slides = JSON.parse(env.SLIDES_JSON);
      }
    } catch (e) {
      console.warn("[WARN] Could not parse SLIDES_JSON from .env, using default.");
    }

    console.log(`[HTTP ${req.method}] 200 /config.js - Generated dynamic config with ${slides.length || 3} slides (Client IP: ${clientIp})`);

    const dynamicConfig = `
window.REDIRECT_CONFIG = {
  brandName: "FAPHOUSE 3",
  ingressDomain: "${env.INGRESS_DOMAIN || "faphouse3.com"}",
  targetDomain: "${env.TARGET_DOMAIN || "https://faphouse2.com"}",
  countdownSeconds: ${parseInt(env.COUNTDOWN_SECONDS || "10", 10)},
  autoRedirect: ${env.AUTO_REDIRECT !== "false"},
  preservePathAndQuery: ${env.PRESERVE_PATH_AND_QUERY !== "false"},
  serverTracking: true,
  slides: ${JSON.stringify(slides.length > 0 ? slides : [
    {
      image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1000&auto=format&fit=crop",
      title: "Welcome to <strong>Faphouse 3</strong> Ingress",
      description: "You have reached the new domain <strong>faphouse3.com</strong>. Rerouting to <a href='https://faphouse2.com' style='color:#f4bb2e;'>faphouse2.com</a>.",
      badge: "Mirror 3"
    },
    {
      image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&auto=format&fit=crop",
      title: "High-Speed Edge Gateway",
      description: "Distributed edge routing ensures continuous availability even during regional ISP sinkholing.",
      badge: "High Speed"
    },
    {
      image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&auto=format&fit=crop",
      title: "Full Account & Preference Synchronization",
      description: "Your login credentials, saved favorites, and viewing history remain completely synchronized on <strong>faphouse2.com</strong>.",
      badge: "Synchronized"
    }
  ])}
};
`;
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(dynamicConfig);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        console.error(`[HTTP 500] Error reading ${filePath}:`, readErr.message);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
        return;
      }
      console.log(`[HTTP ${req.method}] 200 ${parsedUrl.pathname} [${contentType.split(";")[0]}] (Client IP: ${clientIp})`);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);

      // Track HTML pageviews in MongoDB (mirrors lambda/handler.js; assets are skipped)
      if (ext === ".html") {
        const targetOrigin = (process.env.TARGET_DOMAIN || "https://faphouse2.com").replace(/\/$/, "");
        recordVisit({
          domain: process.env.INGRESS_DOMAIN || "faphouse3.com",
          ip: String(clientIp).split(",")[0].trim(),
          country: req.headers["cf-ipcountry"] || "UNKNOWN",
          city: req.headers["cf-ipcity"] || "UNKNOWN",
          userAgent: req.headers["user-agent"] || "unknown",
          referer: req.headers["referer"] || "direct",
          path: parsedUrl.pathname,
          queryString: parsedUrl.search || "",
          targetDestination: `${targetOrigin}${parsedUrl.pathname}${parsedUrl.search || ""}`
        }).catch((dbErr) => {
          console.error(`[DB:ERROR] Visit tracking failed for ${parsedUrl.pathname}: ${dbErr.message}`);
        });
      } else {
        console.log(`[FILTER]   Skipping database tracking for static asset request: "${parsedUrl.pathname}"`);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` [FAPHOUSE 3] Traffic Redirector Demo Server Running`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Ingress: faphouse3.com  -->  Target: https://faphouse2.com`);
  console.log(` Countdown: ${envVars.COUNTDOWN_SECONDS || 10} seconds`);
  console.log(` Storage Mode: MongoDB (URI: ${envVars.MONGODB_URI || "mongodb://localhost:27017"})`);
  console.log(` Live request logging enabled. Press Ctrl+C to stop.`);
  console.log(`======================================================\n`);
});

process.on("SIGINT", async () => {
  await closeDatabaseConnection().catch(() => {});
  process.exit(0);
});
