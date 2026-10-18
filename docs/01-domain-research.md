# Empirical Domain Research & Analysis

This document details the live, publicly observable behavior of `faphouse.com`, `faphouse2.com`, and the new domain `faphouse3.com`.

---

## 1. Summary of Publicly Observable Behavior

| Domain | Cloudflare Nameservers | Observed IPs | HTTP Status | Role & Observation |
|---|---|---|---|---|
| **`faphouse.com`** | `jake.ns.cloudflare.com`<br>`nia.ns.cloudflare.com` | `104.18.36.19`<br>`172.64.151.237`<br>*(ISP sinkhole: 49.44.79.236)* | Connection Reset / Sinkhole in certain regions | Primary legacy domain. Subject to regional ISP DNS tampering and SNI-based filtering. |
| **`faphouse2.com`** | `jake.ns.cloudflare.com`<br>`nia.ns.cloudflare.com` | `104.21.59.243`<br>`172.67.185.212` | `HTTP 200 OK` | Active operational site. Serves full application, session cookies (`PHPSESSID`, `guid`, `affiliate`), Cloudflare proxy. |
| **`faphouse3.com`** | `lex.ns.cloudflare.com`<br>`miki.ns.cloudflare.com` | `108.165.121.224` | Timeout (Unconfigured / Origin offline) | New domain. Has dedicated Cloudflare NS pair; ready to point to AWS API Gateway or custom CloudFront distribution. |

---

## 2. Technical Findings

### A. Nameserver & Account Association
- `faphouse.com` and `faphouse2.com` share the exact same Cloudflare nameservers (`jake.ns.cloudflare.com` & `nia.ns.cloudflare.com`), confirming they reside within the same Cloudflare organization/account.
- `faphouse3.com` is configured with `lex.ns.cloudflare.com` & `miki.ns.cloudflare.com`. It currently resolves via an unproxied A record (`108.165.121.224`), indicating it has been registered and provisioned but does not yet have an active backend application.

### B. ISP-Level Censorship and Sinkholing
- Direct DNS resolution through local ISPs (such as Reliance Jio in India) returned `49.44.79.236` for `faphouse.com`. This is an ISP regulatory sinkhole IP address.
- Even when querying global DNS (1.1.1.1) to obtain the true Cloudflare IPs, attempting a TLS handshake directly results in `TCP Connection Reset (curl error 35)` caused by ISP Deep Packet Inspection (DPI) inspecting the TLS Server Name Indication (SNI).
- **Key Insight**: Mirror domains (e.g., `faphouse2.com`, `faphouse3.com`) are deployed to bypass ISP-level domain blocks, maintain organic search/bookmark traffic, and preserve affiliate/referral revenue streams.

### C. Application Stack on `faphouse2.com`
Inspecting headers from `faphouse2.com`:
- **Server**: Cloudflare Edge with HTTP/2 and HTTP/3 support (`alt-svc: h3=":443"`).
- **Backend**: Dynamic PHP application (`PHPSESSID` session cookies, `cf-cache-status: DYNAMIC`).
- **Visitor Tracking**: Sets 1-year persistent cookies (`guid`, `affiliate`, `lastActivityAt`, `cookie-settings`).
- **Strict Headers**: HSTS (`max-age=31536000`), CSP whitelisting Google Analytics, Hotjar, Amplitude, and payment gateways.

---

## 3. How `faphouse3.com` Fits Into the Architecture

Since `faphouse3.com` is the new domain:
1. **Traffic Funneling**: Visitors landing on `faphouse3.com` (from outdated links, typos, direct typing, or referral links) must be cleanly tracked before reaching the operational service (`faphouse2.com`).
2. **Intermediate Notice vs. Instant Redirect**:
   - **Instant HTTP 301/302 Redirect**: Fastest user experience and best for preserving SEO link juice.
   - **Intermediate HTML Page (Demonstration)**: Useful when alerting users about a permanent domain migration or displaying promotional notices before redirecting.
3. **Single Backend Unification**:
   - Rather than deploying separate servers for each domain, all three domains (`faphouse.com`, `faphouse2.com`, `faphouse3.com`) can route to a single AWS API Gateway + Lambda backend that inspects the incoming domain header, updates DynamoDB visit counters, and executes the designated routing action.
