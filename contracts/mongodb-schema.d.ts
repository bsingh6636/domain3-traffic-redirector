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
  ip: string;                  // Client IP address (from CF-Connecting-IP or sourceIp)
  userAgent: string;           // Browser & device user agent
  path: string;                // Requested path (e.g. "/watch/12345")
  queryString: string;         // Query params (e.g. "ref=twitter")
  referer?: string;            // Referring URL (where the user came from)
  country?: string;            // Cloudflare country code (e.g. "US", "IN", "DE")
  city?: string;               // Cloudflare city (if available)
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
  uniqueIpCount?: number;      // Estimated unique count
  lastVisitedAt: Date;
  topCountries?: Record<string, number>; // e.g. { "US": 45, "IN": 120 }
}
