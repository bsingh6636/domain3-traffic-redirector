# Architecture Design: Single Domain Traffic Gateway (`faphouse3.com` &rarr; `faphouse2.com`)

This document details the serverless architecture designed specifically for **`faphouse3.com`** as a single dedicated ingress gateway that counts visitors, displays a branded 10-second redirect notice with an image slider, and forwards traffic to **`faphouse2.com`**.

---

## 1. Single-Domain Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Visitor Traffic"]
        User["User navigates to faphouse3.com"]
    end

    subgraph EdgeLayer["DNS & Edge Ingress"]
        CF["Cloudflare DNS (lex.ns / miki.ns)<br>CNAME Record for faphouse3.com"]
        ACM["AWS Certificate Manager (ACM)<br>SSL/TLS for faphouse3.com & *.faphouse3.com"]
    end

    subgraph ServerlessBackend["AWS Serverless Backend"]
        APIGW["Amazon API Gateway (HTTP API v2)<br>Custom Domain: faphouse3.com → $default"]
        LAMBDA["AWS Lambda (Node.js 20.x/22.x)<br>faphouse3 Traffic Controller"]
        DDB[("Amazon DynamoDB (DomainTrafficStats)<br>PK: faphouse3.com | SK: TOTAL / DATE#YYYY-MM-DD")]
    end

    subgraph Presentation["Traffic Redirection & Presentation"]
        HTML["10-Second Countdown Notice Page<br>(with Image Slider & faphouse2.com Theme)"]
        RDIR["HTTP 302 Redirect to faphouse2.com${path}"]
        PROD["Target Platform: https://faphouse2.com"]
    end

    User --> CF
    CF --> APIGW
    ACM -.-> APIGW
    APIGW --> LAMBDA
    LAMBDA <--> DDB
    LAMBDA -->|Notice Mode| HTML
    LAMBDA -->|Instant Mode| RDIR
    HTML -->|After 10s or Button Click| PROD
    RDIR -->|Instant 302| PROD
```

---

## 2. Request Flow Lifecycle for `faphouse3.com`

```mermaid
sequenceDiagram
    autonumber
    actor Visitor as Browser / User
    participant Cloudflare as Cloudflare DNS
    participant APIGW as API Gateway (faphouse3.com)
    participant Lambda as Node.js Lambda Handler
    participant DynamoDB as DynamoDB (DomainTrafficStats)
    participant Target as faphouse2.com

    Visitor->>Cloudflare: GET https://faphouse3.com/watch?id=42
    Cloudflare->>APIGW: Forward request with SNI & Host: faphouse3.com
    Note over APIGW: Terminates SSL with ACM cert.<br>Generates HTTP API v2 Event.
    APIGW->>Lambda: Invokes Handler with event
    
    activate Lambda
    Note over Lambda: 1. Confirm domain is faphouse3.com<br>2. Filter asset noise (.ico, .png)<br>3. Prepare target destination: https://faphouse2.com/watch?id=42
    
    Lambda->>DynamoDB: UpdateItem (ADD visitCount 1, SET lastVisitedAt)
    DynamoDB-->>Lambda: Increment confirmed (Atomic counter)
    
    alt Mode A: Branded 10-Second Redirect Notice (Configured)
        Lambda-->>APIGW: 200 OK (Content-Type: text/html, body: UI with slider)
        APIGW-->>Visitor: Renders FAPHOUSE 3 Notice with 10s countdown & carousel
        Visitor->>Visitor: 10-second timer completes (or user clicks "Redirect Now")
        Visitor->>Target: Navigates to https://faphouse2.com/watch?id=42
    else Mode B: Headless Instant 302
        Lambda-->>APIGW: 302 Found (Location: https://faphouse2.com/watch?id=42)
        APIGW-->>Visitor: Browser automatically navigates to faphouse2.com
    end
    deactivate Lambda
```

---

## 3. Why a Single Domain Gateway Architecture?

Operating `faphouse3.com` as a dedicated edge redirector provides three core advantages:

1. **Anti-Censorship & Link Protection**: When regional ISPs block `faphouse.com`, new links and marketing campaigns point to `faphouse3.com`. The gateway captures this traffic and safely routes users to `faphouse2.com`.
2. **Visitor Intelligence**: Every request hitting `faphouse3.com` is logged in DynamoDB before forwarding, providing exact metrics on how many users are arriving via this new domain.
3. **Zero Maintenance & Minimal Cost**:
   - Zero dedicated servers.
   - API Gateway HTTP API charges $1.00 per 1M requests.
   - DynamoDB On-Demand capacity is free within AWS Free Tier (25 WCU / 25 RCU).
   - ACM SSL certificates are 100% free.

---

## 4. Key Serverless Components

### A. Amazon API Gateway (HTTP API v2)
- Handles SSL/TLS termination for `faphouse3.com`.
- Preserves full incoming path (`event.rawPath`) and query parameters (`event.rawQueryString`).
- Integrates directly with your Lambda function via the `$default` route.

### B. AWS Lambda (Node.js 20.x or 22.x)
- Executes in under 15ms.
- Reads `TARGET_DOMAIN=https://faphouse2.com` and `COUNTDOWN_SECONDS=10` from environment variables.
- Updates visit counts in DynamoDB atomically.

### C. Amazon DynamoDB (`DomainTrafficStats`)
- Single table partitioned by `domain = "faphouse3.com"`.
- Tracks all-time visits (`metric: "TOTAL"`) and daily rollups (`metric: "DATE#YYYY-MM-DD"`).
