# Domain Visit Tracking Strategy for `faphouse3.com`

This guide explains how visitor traffic is tracked on **`faphouse3.com`** using atomic DynamoDB counters before redirecting to `faphouse2.com`.

---

## 1. Metric Breakdown for `faphouse3.com`

| Metric | What It Measures | Pros | Cons / Challenges | Recommendation |
|---|---|---|---|---|
| **Total Requests (Raw Hits)** | Every network ping reaching `faphouse3.com` (HTML, `.ico`, robots.txt, crawlers). | Simplest to track. | Heavily inflated by asset fetches and crawlers. | Use only for infrastructure monitoring. |
| **Page Visits (Pageviews)** | Only requests intended to view the gateway or trigger the redirect. | Eliminates asset noise, provides accurate visitor count, no cookies required. | Cannot differentiate 5 visits from 1 person vs 5 unique people. | **Recommended for initial deployment.** |
| **Unique Visitors** | Distinct users/devices hitting `faphouse3.com` in a 24-hour window. | True audience size. | Requires stateful tracking (cookie or daily-salted IP/UA hash). | Future expansion. |

---

## 2. DynamoDB Data Model (`DomainTrafficStats`)

Because this gateway serves **`faphouse3.com` only**, the DynamoDB schema is streamlined:

### Partition & Sort Key Structure

| Partition Key (`domain`) | Sort Key (`metric`) | Attributes | Purpose |
|---|---|---|---|
| `faphouse3.com` | `TOTAL` | `visitCount: 1542`<br>`lastVisitedAt: "2026-10-19T03:30:00Z"` | Cumulative total visits to `faphouse3.com`. |
| `faphouse3.com` | `DATE#2026-10-19` | `visitCount: 310`<br>`lastVisitedAt: "2026-10-19T03:30:00Z"` | Daily visitor breakdown. |
| `faphouse3.com` | `DATE#2026-10-20` | `visitCount: 450`<br>`lastVisitedAt: "2026-10-20T01:10:00Z"` | Next day breakdown. |

---

## 3. Atomic Counter Implementation Pattern

To avoid concurrency bugs (race conditions) when multiple users navigate to `faphouse3.com` simultaneously, use DynamoDB's native atomic `ADD` expression:

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function trackVisit(domain = "faphouse3.com") {
  const today = new Date().toISOString().slice(0, 10); // "2026-10-19"
  const now = new Date().toISOString();

  // 1. Update Daily Metric
  await docClient.send(new UpdateCommand({
    TableName: process.env.TRACKING_TABLE_NAME || "DomainTrafficStats",
    Key: {
      domain: domain,
      metric: `DATE#${today}`
    },
    UpdateExpression: "ADD visitCount :inc SET lastVisitedAt = :ts",
    ExpressionAttributeValues: {
      ":inc": 1,
      ":ts": now
    }
  }));

  // 2. Update Total Metric
  await docClient.send(new UpdateCommand({
    TableName: process.env.TRACKING_TABLE_NAME || "DomainTrafficStats",
    Key: {
      domain: domain,
      metric: "TOTAL"
    },
    UpdateExpression: "ADD visitCount :inc SET lastVisitedAt = :ts",
    ExpressionAttributeValues: {
      ":inc": 1,
      ":ts": now
    }
  }));
}
```

---

## 4. Asset Noise Filtering

Before invoking DynamoDB, ensure the request is a real visit rather than an asset probe:
```javascript
function shouldCountVisit(rawPath) {
  const assetExtensions = [".ico", ".png", ".jpg", ".jpeg", ".svg", ".css", ".js", ".map", ".txt"];
  const lowerPath = rawPath.toLowerCase();
  
  if (lowerPath === "/favicon.ico" || lowerPath === "/robots.txt") return false;
  return !assetExtensions.some(ext => lowerPath.endsWith(ext));
}
```
