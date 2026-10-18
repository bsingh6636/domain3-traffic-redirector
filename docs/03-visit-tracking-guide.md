# Domain Visit Tracking Strategy & Storage Guide

Tracking domain traffic accurately requires understanding the difference between raw network hits, actual page views, and distinct human visitors. This guide compares these metrics and presents the recommended storage pattern for the initial version and future growth.

---

## 1. Comparing Tracking Metrics

| Metric | What It Measures | Pros | Cons / Challenges | Best Use Case |
|---|---|---|---|---|
| **Total Requests (Raw Hits)** | Every single HTTP request arriving at API Gateway (HTML, icons, CSS, health checks, crawlers). | • Simplest to implement<br>• Measures raw infrastructure load. | • Highly inflated (one page view can trigger 20+ requests for images/favicon)<br>• Distorts business reality. | Capacity planning and rate limiting. |
| **Page Visits (Pageviews)** | Only requests intended to render an HTML document or trigger a domain redirect. | • Eliminates asset noise (`.ico`, `.css`, `.map`)<br>• Accurate count of navigation events<br>• Zero cookie requirement. | • Does not distinguish between 1 visitor refreshing 50 times vs 50 distinct visitors. | **Recommended starting metric** for lightweight domain routing. |
| **Unique Visitors** | Distinct individuals or devices visiting within a time window (e.g. 24 hours). | • True reflection of audience size<br>• Critical for marketing and conversion rates. | • Requires stateful tracking (cookies, `localStorage`, or daily-hashed `IP + UserAgent`)<br>• Privacy/compliance considerations (GDPR/ePrivacy). | Advanced audience analytics. |

---

## 2. Recommended Storage Option: Amazon DynamoDB

For the initial version, **Amazon DynamoDB** is the ideal storage engine:
1. **Zero Cold Provisioning**: No servers to configure or patch.
2. **Atomic Counter Operations**: DynamoDB provides an `ADD` update expression that increments counters directly on the server with ACID guarantees, eliminating race conditions when multiple users hit the domain simultaneously.
3. **Generous Free Tier**: 25 GB of storage and 25 write/read capacity units permanently free.
4. **Sub-10ms Latency**: Ensures redirect operations remain virtually instantaneous for end users.

---

## 3. Data Model & Schema Design

### Table Name: `DomainTrafficStats`

To keep the system lightweight today while remaining ready for future analytics, use a simple Partition Key (`PK`) and Sort Key (`SK`) design:

#### Initial Version Schema (Total & Daily Counts)

| Partition Key (`domain`) | Sort Key (`metric`) | Attributes | Description |
|---|---|---|---|
| `faphouse3.com` | `TOTAL` | `visitCount: 1542`<br>`lastVisitedAt: "2026-10-19T02:40:00Z"` | All-time cumulative visits for the domain. |
| `faphouse3.com` | `DATE#2026-10-19` | `visitCount: 310`<br>`lastVisitedAt: "2026-10-19T02:40:00Z"` | Daily visit aggregation. |
| `faphouse2.com` | `TOTAL` | `visitCount: 9840`<br>`lastVisitedAt: "2026-10-19T02:38:12Z"` | Cumulative visits for domain 2. |
| `faphouse.com` | `TOTAL` | `visitCount: 420`<br>`lastVisitedAt: "2026-10-19T01:15:00Z"` | Cumulative visits for domain 1. |

### How Atomic Counter Updating Works in DynamoDB
Rather than fetching an item, adding 1 in Node.js, and writing it back (which causes race conditions under concurrent traffic), DynamoDB executes atomic math:

```javascript
// Example DynamoDB update expression
{
  TableName: "DomainTrafficStats",
  Key: {
    domain: "faphouse3.com",
    metric: "TOTAL"
  },
  UpdateExpression: "ADD visitCount :increment SET lastVisitedAt = :now",
  ExpressionAttributeValues: {
    ":increment": 1,
    ":now": new Date().toISOString()
  }
}
```

---

## 4. Expanding to Unique Visitors (Future Roadmap)

When you are ready to expand to unique visitor tracking, you can layer one of two strategies on top of this same DynamoDB table:

### Option A: First-Party Visitor Cookie (Most Accurate)
1. When a user arrives, Lambda checks for a `Set-Cookie` named `_gw_vid`.
2. If absent:
   - Lambda generates a random UUID (e.g. `vid_a83f9...`).
   - Increments `UNIQUE_VISITORS` counter.
   - Sets the cookie in the response: `Set-Cookie: _gw_vid=...; Max-Age=86400; Path=/; Secure; SameSite=Lax`.
3. If present: Lambda treats the visitor as returning and does not increment the unique counter.

### Option B: Privacy-Friendly Daily Salted Hash (Cookie-less)
1. Compute a daily hash: `SHA-256(ClientIP + UserAgent + DateSalt)`.
2. Write a temporary deduplication record into DynamoDB:
   - `PK: DEDUP#faphouse3.com`
   - `SK: HASH#<sha256_result>`
   - `TTL: <epoch timestamp + 24 hours>`
3. Use a Conditional Write (`attribute_not_exists(PK)`).
   - If the write succeeds: Increment unique visitor counter.
   - If the write fails with `ConditionalCheckFailedException`: The user already visited today; skip increment.
   - DynamoDB automatically deletes expired TTL items with zero cost.

---

## 5. Filtering Noise and Bots

To avoid counting background crawlers as real human visits, apply these lightweight filters in your Lambda function before recording:
1. **Filter Non-HTML Extensions**: Ignore paths ending in `.ico`, `.png`, `.jpg`, `.svg`, `.css`, `.js`, `.json`, `.map`.
2. **Filter System Paths**: Ignore `robots.txt`, `sitemap.xml`, `.well-known/*`.
3. **Check User-Agent**: Check for obvious crawlers (e.g., `Googlebot`, `bingbot`, `AhrefsBot`, `curl`) if you only want human visitors.
