# Lambda Developer Implementation Guide: `faphouse3.com` Redirector

This guide provides the exact input event interfaces, SDK patterns, and steps to write your Node.js Lambda function in [`lambda/handler.js`](../lambda/handler.js).

---

## 1. What Your Lambda Does

1. **Receives requests arriving at `faphouse3.com`** via API Gateway HTTP API v2.
2. **Filters out static asset noise** (`/favicon.ico`, `/robots.txt`).
3. **Increments the visit counter** in DynamoDB for `faphouse3.com`.
4. **Constructs the redirect target URL**: `https://faphouse2.com${path}${queryString}`.
5. **Returns the response**: Either an immediate HTTP 302 or renders the branded HTML page with the 10-second countdown and image carousel.

---

## 2. API Gateway HTTP API v2 Event Interface

```typescript
interface APIGatewayHttpApiV2Event {
  rawPath: string;            // e.g. "/watch/video-99"
  rawQueryString: string;     // e.g. "ref=twitter&tag=top"
  headers: {
    host: string;             // "faphouse3.com"
    "user-agent"?: string;
  };
  requestContext: {
    domainName: string;       // "faphouse3.com"
    http: {
      method: "GET" | "POST";
      sourceIp: string;       // Visitor IP
    };
  };
}
```

---

## 3. Step-by-Step Implementation in `lambda/handler.js`

### Step 1: Read the Ingress Domain and Destination
```javascript
const domain = event.requestContext?.domainName || event.headers?.["host"] || "faphouse3.com";
const path = event.rawPath || "/";
const queryString = event.rawQueryString ? `?${event.rawQueryString}` : "";
const targetDestination = `${process.env.TARGET_DOMAIN || "https://faphouse2.com"}${path}${queryString}`;
```

### Step 2: Noise Filtering
```javascript
const isAssetNoise = path.endsWith(".ico") || path.endsWith(".png") || path.startsWith("/.well-known");
```

### Step 3: DynamoDB Atomic Update
```javascript
if (!isAssetNoise) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await docClient.send(new UpdateCommand({
      TableName: process.env.TRACKING_TABLE_NAME || "DomainTrafficStats",
      Key: { domain: "faphouse3.com", metric: `DATE#${today}` },
      UpdateExpression: "ADD visitCount :inc SET lastVisitedAt = :ts",
      ExpressionAttributeValues: { ":inc": 1, ":ts": new Date().toISOString() }
    }));
  } catch (err) {
    console.error("[WARN] Failed to record visit to DynamoDB:", err);
    // Don't throw! Always ensure the redirect response completes for the user.
  }
}
```

### Step 4: Returning Response
#### Option A: Direct 302 Redirect
```javascript
return {
  statusCode: 302,
  headers: {
    "Location": targetDestination,
    "Cache-Control": "no-cache, no-store, must-revalidate"
  }
};
```

#### Option B: Serving the Themed HTML Notice (10-Second Countdown & Image Slider)
```javascript
import { readFileSync } from "fs";
const htmlTemplate = readFileSync("./public/index.html", "utf-8");

return {
  statusCode: 200,
  headers: {
    "Content-Type": "text/html; charset=utf-8"
  },
  body: htmlTemplate
};
```

---

## 4. Local Testing Without AWS
Run the zero-AWS test harness anytime:
```bash
npm run test:local
```
This loads [`contracts/mock-event-domain3-wrong.json`](../contracts/mock-event-domain3-wrong.json), invokes your handler, and displays the status code, headers, and parsed output.
