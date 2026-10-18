# Lambda Developer Implementation Guide

Welcome! Since your goal is to write the AWS Lambda backend yourself to master serverless development, this guide gives you the mental model, event interfaces, SDK patterns, and step-by-step instructions needed to implement `lambda/handler.js`.

---

## 1. The Anatomy of an API Gateway HTTP API v2 Event

When a visitor hits your domain, API Gateway wraps the HTTP request into a JSON event payload and passes it to your Lambda handler function:

```javascript
export async function handler(event, context) {
  // `event` contains all incoming request details
  // `context` contains AWS runtime metadata (timeout, memory, etc.)
}
```

### Key Event Fields You Need to Extract

| What You Need | Where to Find It in `event` | Example Value |
|---|---|---|
| **Requested Domain** | `event.requestContext.domainName` | `"faphouse3.com"` |
| **HTTP Host Header** (fallback) | `event.headers['host']` | `"faphouse3.com"` |
| **Request URI Path** | `event.rawPath` | `"/watch/sample-video"` |
| **Query Parameters** | `event.rawQueryString` | `"source=ref_campaign&tag=trending"` |
| **Visitor IP Address** | `event.requestContext.http.sourceIp` | `"198.51.100.42"` |
| **User-Agent** | `event.headers['user-agent']` | `"Mozilla/5.0..."` |
| **HTTP Method** | `event.requestContext.http.method` | `"GET"` |

---

## 2. Step-by-Step Implementation Roadmap

Open [`lambda/handler.js`](../lambda/handler.js) in your editor. Follow these 5 steps to build your handler:

### Step 1: Domain Normalization
Extract the domain name from `event.requestContext.domainName` (or `event.headers.host`).
- Convert to lowercase: `.toLowerCase()`
- Strip `www.` prefixes if you want unified statistics: `.replace(/^www\./, "")`
- Ensure you have a fallback string (e.g. `"unknown"`) in case neither is present.

### Step 2: Noise & Asset Filtering
Decide if the request should increment the visit counter.
- Check if `path.endsWith('.ico')` or includes `.well-known`.
- If it is static asset noise, you may choose to skip the DynamoDB increment or record it under a separate `ASSETS` metric.

### Step 3: Incrementing the Visit Count in DynamoDB
To write to DynamoDB from Node.js, install and use the official AWS SDK v3:
```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

#### The Recommended AWS SDK v3 Pattern:
```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// Instantiate client outside the handler to reuse connection across warm invocations
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Inside your handler:
const updateParams = {
  TableName: process.env.TRACKING_TABLE_NAME || "DomainTrafficStats",
  Key: {
    domain: domain,
    metric: "TOTAL"
  },
  UpdateExpression: "ADD visitCount :inc SET lastVisitedAt = :ts",
  ExpressionAttributeValues: {
    ":inc": 1,
    ":ts": new Date().toISOString()
  }
};

await docClient.send(new UpdateCommand(updateParams));
```

> **Crucial Tip (Resilience):** Always wrap the database call in a `try...catch` block. If DynamoDB is temporarily throttled or unavailable, you still want to execute the redirect so the visitor is not stuck on an error screen!

### Step 4: Routing & URL Reconstruction
Rebuild the target URL:
- Target origin: `https://faphouse2.com`
- Preserve the incoming path: `path`
- Preserve the query string: `queryString ? `?${queryString}` : ""`
- Combine: `const target = `https://faphouse2.com${path}${queryString}`;`

### Step 5: Returning the API Gateway Response
API Gateway expects a JSON object matching `APIGatewayHttpApiV2Result`:

#### Direct HTTP 302 Redirect:
```javascript
return {
  statusCode: 302,
  headers: {
    "Location": target,
    "Cache-Control": "no-cache, no-store, must-revalidate"
  }
};
```

#### Serving the HTML Warning Page:
If you want to render the intermediate demonstration notice:
```javascript
import { readFileSync } from "fs";
const htmlContent = readFileSync("./public/index.html", "utf-8");

return {
  statusCode: 200,
  headers: {
    "Content-Type": "text/html; charset=utf-8"
  },
  body: htmlContent
};
```

---

## 3. Testing Locally Before Deploying

You do **not** need an active AWS account to test your logic:
1. Run:
   ```bash
   npm run test:local
   ```
2. This invokes `lambda/local-runner.js`, which passes `contracts/mock-event-domain3-wrong.json` directly into your handler and inspects the return code, headers, and body.
3. Edit `lambda/handler.js`, run `npm run test:local`, and verify your output!
