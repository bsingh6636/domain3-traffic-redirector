# Domain 3 Traffic Redirector (`faphouse3.com` &rarr; `faphouse2.com`)

A lightweight, serverless traffic gateway and visitor tracking service for **`faphouse3.com`** that displays an intermediate branded redirect notice with an **image slider carousel** and forwards visitors to **`faphouse2.com`** after a **10-second countdown**.

---

## 🎨 UI & Theme Alignment

The user interface has been modeled directly after `faphouse2.com`:
- **Dark Aesthetic**: Background `#000000`, card backgrounds `#121620`, borders `#202634`.
- **Authentic Amber Accent**: `#f4bb2e` gold/amber CTA buttons with hover `#e3a200` and dark `#222222` text.
- **FAPHOUSE 3 Branding**: "FAP" in crisp white, "HOUSE" in amber, and an amber "3" badge.
- **10-Second Countdown**: Visual progress bar and pill display counting down from 10s to 0s.
- **Image Slider Carousel**:
  - Accepts an array of image links.
  - Supports title, subtitle, and rich HTML descriptions / links.
  - Previous / Next navigation arrows and dot indicators.
  - Auto-rotates every 3.5 seconds.
  - Configurable via `.env` (`SLIDES_JSON`) or `public/config.js`.

---

## 📁 Repository Structure

```
domain3-traffic-redirector/
├── .env                              # Environment variables (countdown, target domain, image slides)
├── .env.example                      # Template environment variables
├── package.json                      # Node.js project configuration (v1.1.0)
├── contracts/
│   ├── lambda-types.d.ts             # TypeScript definitions for HTTP API v2 & tracking records
│   ├── mock-event-domain1.json       # Simulated payload from faphouse.com
│   ├── mock-event-domain2.json       # Simulated payload from faphouse2.com
│   └── mock-event-domain3-wrong.json # Simulated payload from faphouse3.com (target event)
├── docs/
│   ├── 01-domain-research.md         # Live DNS, NS, & live probe findings for faphouse domains
│   ├── 02-architecture-design.md     # Single-backend architecture & request flow
│   ├── 03-visit-tracking-guide.md    # DynamoDB atomic counter guide and metric comparison
│   ├── 04-lambda-developer-guide.md  # Step-by-step developer handbook for writing the handler
│   └── 05-aws-setup-and-dns.md       # AWS setup & Cloudflare DNS guide (no deploy yet)
├── lambda/
│   ├── handler.js                    # Lambda skeleton with structured TODOs for your implementation
│   └── local-runner.js               # Zero-AWS local test harness
├── public/
│   ├── index.html                    # Themed 10-second redirect page with image carousel
│   ├── config.js                     # Client-side configuration fallback
│   └── style.css                     # Dark & amber CSS modeled after faphouse2.com
└── scripts/
    └── serve-demo.js                 # Zero-dependency local web server syncing .env to UI
```

---

## 🚀 Quick Start

### 1. Preview the Themed 10-Second Redirect & Image Slider UI
Start the local demonstration server:
```bash
npm run serve
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser:
- You will see the **FAPHOUSE 3** header bar.
- The notice: *"You've reached the wrong domain. Redirecting you to faphouse2.com in 10 seconds."*
- The animated 10s progress bar and interactive countdown pill.
- The responsive image carousel rendering slides from your `.env` with full HTML support.
- "Redirect Now" and "Pause Auto-Redirect" buttons.

### 2. Configure Image Slides and Text
Open `.env` in the root folder to update slides, timer, or destination:
```env
TARGET_DOMAIN=https://faphouse2.com
INGRESS_DOMAIN=faphouse3.com
COUNTDOWN_SECONDS=10
AUTO_REDIRECT=true
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=faphouse3_analytics
SLIDES_JSON=[{"image":"https://example.com/banner1.jpg","title":"Promo Title","description":"Description with <b>HTML</b> support","badge":"Notice"}]
```

### 3. Test Your Lambda Handler Locally
```bash
npm run test:local
```
This runs `lambda/local-runner.js`, feeding mock event `contracts/mock-event-domain3-wrong.json` directly into your handler. It tests IP extraction, Cloudflare headers, and destination construction.

---

## 🛠️ Implementing the Backend Yourself (MongoDB Edition)

Open [`lambda/handler.js`](lambda/handler.js) where step-by-step TODO guidance is provided:
1. **Extract IP & Metadata**: Extract true client IP (`cf-connecting-ip`, `x-forwarded-for`, `sourceIp`), country, city, and User-Agent.
2. **Filter Noise**: Check `event.rawPath` to ignore favicon/assets.
3. **Record to MongoDB**:
   - Insert granular log into `visits` collection (`ip`, `country`, `userAgent`, `path`, `createdAt`).
   - Atomically increment aggregated counter in `stats` collection (`$inc: { totalVisits: 1 }`).
4. **Target Destination**: Reconstruct `https://faphouse2.com${path}${queryString}`.
5. **Return Response**: Serve the HTML page with image carousel or return an HTTP 302 redirect.

---

## 📖 Documentation Index

- [01. Empirical Domain Research](docs/01-domain-research.md)
- [02. Architecture Design (`faphouse3.com` &rarr; `faphouse2.com`)](docs/02-architecture-design.md)
- [03. MongoDB Visitor & IP Tracking Guide](docs/03-mongodb-tracking-guide.md)
- [04. Lambda Developer Guide](docs/04-lambda-developer-guide.md)
- [05. AWS Setup & DNS Routing](docs/05-aws-setup-and-dns.md)

