# Cloudflare → BackendDev on Vercel → Lambda → MongoDB

`BackendDev/lib/domain3.js` reverse-proxies `faphouse3.com` and `www.faphouse3.com` to this Lambda. It forwards incoming request headers (except HTTP hop-by-hop headers, Host, and content length), sets `x-forwarded-host` to the original public domain, preserves paths/query strings, and returns each Set-Cookie separately. It does not need to copy this site's source or look up visitor locations.

The current proxy already forwards the headers below. No BackendDev code change was required for this update. The optional integration check in this repository imports that exact proxy and tests it against this Lambda handler with a mocked database.

## Production configuration

1. Keep the apex and www DNS records pointing to the intended Vercel origin, with Cloudflare proxying enabled.
2. In Cloudflare, turn on **Add visitor location headers** under the Managed Transforms HTTP request-header settings. Cloudflare's navigation can change; use its dashboard search if necessary. This sends the country/city/region fields that Lambda can save. Having only the DNS proxy enabled does not guarantee city headers are enabled.
3. Use **Full (strict)** for the origin's TLS connection after confirming the Vercel custom domain has a valid certificate. Do not change to Flexible to resolve an origin certificate error; check the origin configuration instead.
4. Set `VISITOR_PROXY_MODE=cloudflare` in this Lambda's environment. This explicitly prevents missing Cloudflare fields from being replaced with geolocation for a Vercel edge connection.
5. Upload the rebuilt `function.zip` to Lambda. An environment-variable change is separate from uploading a ZIP. BackendDev needs redeployment only if its own source/configuration has changed.
6. In Cloudflare caching rules, do not force-cache HTML or protected debug/API responses. Lambda sends `Cache-Control: no-store` on HTML because requests create analytics and visitor cookies. Static assets have their own cache policy. Serving a cached HTML response before Lambda runs means it cannot record that pageview.

These instructions do not mean the live Cloudflare settings have been changed. Confirm the actual switch and SSL mode in the dashboard.

References: [Cloudflare visitor location headers](https://developers.cloudflare.com/rules/transform/managed-transforms/reference/#add-visitor-location-headers), [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [Vercel request headers](https://vercel.com/docs/headers/request-headers).

## Fields stored in new visits

| Input | MongoDB field |
| --- | --- |
| `cf-connecting-ipv6` or `cf-connecting-ip` | `ip`, `ipSource` |
| `cf-ipcountry`, `cf-ipcity` | `country`, `city` |
| `cf-region`, `cf-region-code`, `cf-ipcontinent` | `region`, `regionCode`, `continent` |
| `cf-timezone`, `cf-postal-code` | `timezone`, `postalCode` |
| `cf-iplatitude`, `cf-iplongitude` | `latitude`, `longitude` (numbers or null) |
| `x-forwarded-host` | `forwardedHost` (original public hostname) |
| `cf-ray` | `cfRay` (request correlation only) |
| Provider/provenance | `geoProvider`, `geoSource`, `geoAvailable`, `geoIsApproximate`, `metadataTrust`, `ipIsProxyPeer` |

Percent-encoded text is decoded; empty fields remain UNKNOWN or null. Country and city are kept compatible with the old records. Coordinates are validated and approximate IP-derived values, never GPS or a verified home location. Missing location is not filled by another provider's edge location when Cloudflare is selected. Existing exported records are unchanged.

`auto` mode detects a Cloudflare marker first, then CloudFront, then Vercel. Explicit `vercel` or `cloudfront` modes are available if the topology changes. Use `cloudflare` for the topology above; auto-detection cannot identify a proxy whose headers have all been stripped.

IP fallback uses valid forwarded-IP headers, then the Lambda request-context peer IP. When Cloudflare is selected but no valid Cloudflare client IP arrives, `ipIsProxyPeer=true` marks the fallback as potentially identifying an upstream proxy. Do not treat that value as a confirmed visitor IP.

## Verify the full path

```sh
npm test
npm run test:proxy
```

The second command expects the sibling checkout at `../BackendDev`; set `BACKEND_PROXY_MODULE` to the absolute path of another checkout's `lib/domain3.js` if needed. It starts loopback HTTP servers, imports the actual proxy, mocks MongoDB, and checks the stored Cloudflare location, conflicting Vercel location, original hostname, returning cookie, missing city, and HEAD behavior. It never calls the public site or external IP APIs. The normal npm test suite is independent of the sibling checkout.

For a live check, set a private `DEBUG_TOKEN` in Lambda. Request `https://faphouse3.com/?debug=true` with an `Authorization: Bearer <DEBUG_TOKEN>` header, for example from an API client. Check `trackingDetailsExtracted.geoProvider`, `geoSource`, `ipSource`, and `forwardedHost`. Never place the operator token in a URL, public screenshot, browser script, or report. The debug request itself is a pageview; the response is no-store and noindex. A normal browser request without the operator token cannot read diagnostics.

No public temporary header-echo route is needed. No automatic deployment, Cloudflare account modification, or database backfill is performed by the test command.

## Trust and optional enrichment

Forwarded values are labelled `metadataTrust: "forwarded-unverified"` because a direct call to an origin can supply custom headers. They are analytics inputs, not authentication or authorization. `cf-ray` is also not proof that a request passed through Cloudflare. Authenticating BackendDev's hop to Lambda alone would not prove the previous hop came through Cloudflare; secure each hop separately if you later rely on these headers for access control.

No external geolocation API is integrated. Cloudflare provides the required approximate location without a per-visit lookup, and missing values remain explicit. A fallback API could add latency, quotas, and disclosure of visitor IPs to another processor; it would also be wrong to enrich a proxy peer IP as if it were a visitor. Revisit only if a measured need remains after header forwarding is enabled.
