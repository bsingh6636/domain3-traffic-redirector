# QuietTab

A standalone browser-tools and privacy-guides site, replacing the previous countdown redirect. The domain remains faphouse3.com until SITE_URL is changed. There is no redirect to the old destination and legacy TARGET_DOMAIN, AUTO_REDIRECT, COUNTDOWN_SECONDS and SLIDES_JSON variables are ignored.

## What is implemented

- Three useful browser tools: selective URL tracking cleaner, crypto-based password generator, and Unicode-aware word/character counter. Tool inputs are never uploaded or saved by the app.
- Three original, source-linked guides on private browsing, tracking links and passwords.
- New QuietTab branding, SVG favicon, responsive design, About, Privacy and Advertise pages.
- Server-rendered HTML with distinct titles/descriptions, canonical URLs, Open Graph/Twitter metadata, JSON-LD, robots.txt and an XML sitemap. Unknown paths return HTTP 404; known pages are crawlable without JavaScript.
- A clearly labelled 300x250 banner directly below the header on every published page, including the homepage and tools. The Adsterra tag runs inline in the page, as the provider's loader requires (a sandboxed srcdoc wrapper blocks its render step). The bundled Adsterra tag loads by default.
- MongoDB connection initialization/reuse, awaited writes, canonical-domain grouping, source-IP/location provenance, bot classification, versioned counters, and protected diagnostics. No tool-input or query-string logging.

## Preview and tests

```sh
npm install
npm run serve
npm test
npm run test:local
```

Open http://127.0.0.1:3000. The preview uses the real Lambda routes with analytics disabled. It reads .env without printing credentials. Set LOCAL_ANALYTICS=true explicitly if you want the preview to write analytics. npm test is offline and mocks MongoDB; test:local checks routes without a database.

## Configuration

Use .env.example as a reference. Lambda does not automatically load a local .env file: configure these in AWS.

| Variable | Purpose |
| --- | --- |
| SITE_URL | Public canonical origin, currently https://faphouse3.com. Drives canonical tags, sitemap and analytics domain. |
| CONTACT_EMAIL | Real operator contact, shown on Privacy and Advertise pages. Set before submitting the site for review. |
| MONGODB_URI | Database connection URI; never included in the browser or deployment archive as .env. |
| MONGODB_DB_NAME | Retains faphouse3_analytics so existing data is preserved. |
| ANALYTICS_ENABLED | true by default in Lambda; false disables visit writes and visitor cookies. |
| LOCAL_ANALYTICS | Set true to opt the local preview into real DB writes. |
| DEBUG_TOKEN | Operator secret for diagnostics; blank disables public diagnostics. |
| AD_TAG_HTML | Optional override for the supplied Adsterra 300x250 tag in public/ad-tag.html. Leave unset to use the bundled tag. Never use an advertiser-account API secret. |
| ADS_TXT | Actual seller lines supplied by your provider, alternatively public/ads.txt. Missing configuration returns 404 instead of inventing a seller ID. |

Add provider ownership-verification markup to public/index.html only as instructed by the provider. Do not put verification account passwords or API keys into HTML.

## Deployment

```sh
npm run lambda:build
```

Upload function.zip to the existing AWS Lambda. Handler: index.handler or lambda/handler.handler. Use Node.js 22.x, a timeout of at least 15 seconds, and configure the environment above. The archive contains index.js, package.json, lambda/, public/, and node_modules/; it excludes .env, analytics exports and tests.

No AWS deployment is performed by the build. After uploading, check /, /tools/url-cleaner, /guides/private-browsing, /favicon.svg, /robots.txt and /sitemap.xml on the public domain. Cloudflare must forward any location headers you want recorded. Missing headers remain UNKNOWN; there is no external IP-enrichment API.

For the deployed Cloudflare → BackendDev/Vercel → Lambda path, set `VISITOR_PROXY_MODE=cloudflare` in Lambda. Existing BackendDev forwarding already preserves the client headers and cookies. See [the header-forwarding and Cloudflare guide](docs/07-cloudflare-vercel-headers.md) for configuration, saved fields, trust limits, and `npm run test:proxy` against the actual sibling proxy.

## Analytics after the redesign

New visits have analyticsVersion: 2 and group under SITE_URL's hostname instead of the Lambda origin. Existing exported visits are unchanged. Stats documents also include analyticsVersion: 2 so old and new counters are separate. totalVisits includes all requests to real pages; botVisits, browserLikeVisits and unknownClientVisits separate heuristics. newBrowserCookies and returningVisits describe browser cookies, not verified unique people. A fh3_vc cookie carries a browser's pageview count; it is reset when cookies are cleared and is not an authoritative DB count.

Robots, sitemap, static assets, HEAD requests, retired tracking beacons, and 404 probes do not create pageviews. Request query strings are not stored. Referrers are reduced to origins. Visitor IP addresses are still personal data; the public privacy page describes their collection. Configure retention in MongoDB to match your own policy.

Protected diagnostics: GET /?debug=true with Authorization: Bearer <DEBUG_TOKEN>. The response includes metadata and save status; keep the operator token private. Debug pages are marked noindex. Browser traffic is heuristic: bots can impersonate a normal user agent.

```javascript
// Current all-time counters in mongosh:
db.stats.find({ domain: "faphouse3.com", period: "TOTAL", analyticsVersion: 2 });
```

The supplied Adsterra banner is bundled in `public/ad-tag.html`. It loads automatically on the homepage and all published pages after deployment; no enable flag is required. Leave `AD_TAG_HTML` unset to use this file; an existing environment value overrides it. Local preview also loads the bundled banner unless `AD_TAG_HTML` overrides it with a test tag. No live ad requests or clicks are performed by the offline tests.

The `/22/` loader requires `atAsyncContainers[bannerKey]` to identify an existing DOM container. The bundled tag registers this before loading the provider script; `atOptions` alone leaves this loader blank without a console error. Tests exercise its rendering contract with a local creative and no tracking requests.

See [the monetization and traffic plan](docs/06-monetization-and-growth.md) for activation steps and a measured acquisition plan. Earlier docs describe the previous redirect architecture and are historical.
