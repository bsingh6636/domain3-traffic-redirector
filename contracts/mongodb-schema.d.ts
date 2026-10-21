/**
 * MongoDB Data Contracts & Schema Definitions
 * For faphouse3.com visitor tracking and redirect analytics.
 */

import { ObjectId } from "mongodb";

/**
 * 1. Granular Visit Log Document
 * Inserted into the 'visits' collection on every pageview.
 * Stores full audit details for IP, device, geolocation, and requested path.
 */
export interface VisitLogDocument {
  _id?: ObjectId;
  domain: string;              // "faphouse3.com"
  visitorId?: string;          // Persistent visitor tracking ID (cookie / localStorage)
  isReturning?: boolean;       // True if visitor has visited before, false if new
  visitCount?: number;         // Cumulative visits from this visitor
  ip: string | null;           // Null when the event has no valid source IP
  ipSource?: string;           // Header / request-context provenance
  geoSource?: string;          // Cloudflare, CloudFront or not-provided
  geoProvider?: "cloudflare" | "cloudfront" | "vercel" | "direct" | "not-recorded";
  geoAvailable?: boolean;
  geoIsApproximate?: boolean;  // IP-derived estimate, not GPS
  metadataTrust?: string;     // Forwarded headers remain unverified
  ipIsProxyPeer?: boolean;    // Fallback can be an upstream proxy, not a visitor
  forwardedHost?: string | null;
  cfRay?: string | null;
  requestHost?: string;        // Origin hostname, separate from canonical domain
  requestId?: string | null;
  analyticsVersion?: number;   // New standalone site writes version 2
  isBot?: boolean;             // User-agent heuristic, not identity verification
  trafficType?: "identified-bot" | "browser-like" | "unknown-client" | "unclassified";
  userAgent: string;           // Browser & device user agent
  path: string;                // Requested path (e.g. "/watch/12345")
  queryString: string;         // Query params (e.g. "ref=twitter")
  referer?: string;            // Referring URL (where the user came from)
  country?: string;            // Cloudflare country code (e.g. "US", "IN", "DE")
  city?: string;               // Cloudflare city (if available)
  region?: string | null;
  regionCode?: string | null;
  continent?: string | null;
  timezone?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deviceType?: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  targetRedirect: string;      // "https://faphouse2.com/watch/12345?ref=twitter"
  createdAt: Date;             // Timestamp of the visit
  expiresAt?: Date;            // Optional TTL index field for auto-cleaning old logs (e.g. 30 days)
}

/**
 * 2. Aggregated Domain Stats Document
 * Upserted into the 'stats' collection using atomic $inc operations.
 * Allows instant dashboard queries without scanning millions of visit documents.
 */
export interface DomainStatsDocument {
  _id?: ObjectId;
  domain: string;              // "faphouse3.com"
  period: "TOTAL" | string;    // "TOTAL" or "DAILY#2026-10-19"
  totalVisits: number;         // Incremented via $inc: { totalVisits: 1 }
  uniqueVisitors?: number;     // Unique visitors count via $inc: { uniqueVisitors: 1 }
  returningVisits?: number;    // Returning visitor count via $inc: { returningVisits: 1 }
  uniqueIpCount?: number;      // Estimated unique count
  lastVisitedAt: Date;
  analyticsVersion?: number;
  botVisits?: number;
  browserLikeVisits?: number;
  unknownClientVisits?: number;
  newBrowserCookies?: number;  // Newly issued IDs, not verified unique humans
  topCountries?: Record<string, number>; // e.g. { "US": 45, "IN": 120 }
}
