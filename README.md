# Multi-Domain Traffic Gateway & Visit Tracker

A lightweight, serverless architecture for tracking domain visits and managing redirects across multiple domains (`faphouse.com`, `faphouse2.com`, and `faphouse3.com`) using a single unified backend.

---

## 📌 Repository Overview

This repository is structured so that **you build the AWS Lambda backend yourself**, using detailed architecture specifications, type contracts, and local simulation tools.

### Directory Structure

```
multi-domain-traffic-gateway/
├── contracts/
│   ├── lambda-types.d.ts             # TypeScript definitions for HTTP API v2 & tracking records
│   ├── mock-event-domain1.json       # Simulated payload from faphouse.com
│   ├── mock-event-domain2.json       # Simulated payload from faphouse2.com
│   └── mock-event-domain3-wrong.json # Simulated payload from faphouse3.com (wrong domain)
├── docs/
│   ├── 01-domain-research.md         # Empirical DNS, NS, & live probe findings
│   ├── 02-architecture-design.md     # Single-backend multi-domain architecture & request flow
│   ├── 03-visit-tracking-guide.md    # Requests vs page views vs uniques, DynamoDB atomic schema
│   ├── 04-lambda-developer-guide.md  # Step-by-step handbook to implement the Node.js Lambda
│   └── 05-aws-setup-and-dns.md       # AWS provisioning & DNS routing instructions (no deploy yet)
├── lambda/
│   ├── handler.js                    # Lambda handler skeleton with structured TODOs
│   └── local-runner.js               # Zero-AWS local test harness
├── public/
│   ├── index.html                    # Responsive wrong-domain demonstration page
│   ├── config.js                     # Configurable redirect settings (target URL, countdown)
│   └── style.css                     # Modern UI styling
├── scripts/
│   └── serve-demo.js                 # Zero-dependency local web server for the demo page
├── package.json
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Test the Lambda Handler Locally
You do not need an AWS account or deployment to start developing:
```bash
npm run test:local
```
This runs `lambda/local-runner.js`, which passes `contracts/mock-event-domain3-wrong.json` into `lambda/handler.js` and outputs the result.

### 2. Preview the HTML Redirect Demonstration
To test the user-facing redirect page:
```bash
npm run serve
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
- Displays: *"You've reached the wrong domain. Redirecting you to faphouse2.com."*
- Includes an interactive countdown timer, manual redirect button, and auto-redirect pause option.
- Configurable via `public/config.js`.

---

## 🧠 Key Design Decisions

1. **Single Backend for 3 Domains**:
   Instead of 3 servers or 3 Lambdas, Amazon API Gateway (HTTP API v2) uses **Custom Domain Names** to map `faphouse.com`, `faphouse2.com`, and `faphouse3.com` to the **same stage** (`$default`).
   Your Lambda inspects `event.requestContext.domainName` to immediately identify which domain was requested.

2. **Atomic Visit Counting in DynamoDB**:
   Visits are recorded using DynamoDB `UpdateItem` with `ADD visitCount :inc`. This guarantees accurate counts even during traffic spikes without race conditions.

3. **Total Requests vs. Page Visits vs. Unique Visitors**:
   - *Total Requests*: Counts all network hits (noisy, includes `.ico`, `.css`).
   - *Page Visits*: Filters asset paths and counts user navigation events (**recommended v1 metric**).
   - *Unique Visitors*: Differentiates distinct devices via client cookie or daily salted IP/UA hash.

4. **Zero AWS Deployment Yet**:
   All AWS provisioning commands and configurations are documented in `docs/05-aws-setup-and-dns.md`, ready for deployment when backend code is completed.

---

## 📖 Documentation Index

- [01. Domain Research & Empirical Probing](docs/01-domain-research.md)
- [02. Architecture Design & Request Flow](docs/02-architecture-design.md)
- [03. Visit Tracking Strategy & Storage Model](docs/03-visit-tracking-guide.md)
- [04. Lambda Developer Guide](docs/04-lambda-developer-guide.md)
- [05. AWS Setup & DNS Routing](docs/05-aws-setup-and-dns.md)
