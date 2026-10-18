/**
 * AWS Lambda & API Gateway HTTP API v2 Type Definitions
 * Designed to provide IDE autocomplete and type safety when building the handler.
 */

export interface APIGatewayHttpApiV2Event {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
  headers: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  requestContext: {
    accountId: string;
    apiId: string;
    domainName: string; // The primary field to detect incoming domain (e.g. "faphouse3.com")
    domainPrefix: string;
    http: {
      method: 'GET' | 'POST' | 'HEAD' | 'OPTIONS' | string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    requestId: string;
    routeKey: string;
    stage: string;
    time: string;
    timeEpoch: number;
  };
  body?: string;
  isBase64Encoded?: boolean;
}

export interface APIGatewayHttpApiV2Result {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
}

/**
 * Domain tracking record schema in DynamoDB
 */
export interface DomainMetricRecord {
  domain: string;           // Partition Key: e.g. "faphouse3.com"
  metric: string;           // Sort Key: e.g. "TOTAL_VISITS" or "DATE#2026-10-19"
  visitCount: number;       // Counter incremented atomically
  lastVisitedAt: string;    // ISO timestamp
  lastIp?: string;
  userAgentSnippet?: string;
}

/**
 * Interface for routing rules
 */
export interface DomainRoutingRule {
  domain: string;
  action: 'REDIRECT' | 'SERVE_HTML' | 'PASSTHROUGH';
  targetUrl?: string;
  statusCode?: 301 | 302 | 307 | 308;
}
