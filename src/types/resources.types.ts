/**
 * Resource management type definitions
 */

import type { MCPResource, MCPResourceContent } from './mcp.types';

/**
 * Extended resource definition with metadata
 */
export interface ExtendedResource extends MCPResource {
  /** Server ID that provides this resource */
  serverId: string;
  /** Resource size in bytes */
  size?: number;
  /** Last modified timestamp */
  lastModified?: Date;
  /** Resource checksum/hash */
  checksum?: string;
  /** Access count */
  accessCount?: number;
  /** Whether the resource is currently available */
  isAvailable?: boolean;
  /** Whether the resource supports subscriptions */
  supportsSubscription?: boolean;
  /** Resource tags for categorization */
  tags?: string[];
  /** Access permissions */
  permissions?: ResourcePermissions;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resource permissions
 */
export interface ResourcePermissions {
  /** Can read the resource */
  read?: boolean;
  /** Can write to the resource */
  write?: boolean;
  /** Can delete the resource */
  delete?: boolean;
  /** Can subscribe to changes */
  subscribe?: boolean;
  /** Custom permissions */
  custom?: Record<string, boolean>;
}

/**
 * Resource access options
 */
export interface ResourceAccessOptions {
  /** Use cached version if available */
  useCache?: boolean;
  /** Force refresh even if cached */
  forceRefresh?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Response format preference */
  format?: 'text' | 'json' | 'base64' | 'hex';
  /** Cache TTL in seconds */
  cacheTTL?: number;
  /** Encoding for text resources */
  encoding?: 'utf8' | 'ascii' | 'base64' | 'hex' | 'binary' | 'utf16le' | 'ucs2' | 'latin1';
  /** Range request for partial content */
  range?: {
    start: number;
    end?: number;
  };
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Resource subscription options
 */
export interface ResourceSubscriptionOptions {
  /** Events to subscribe to */
  events?: ResourceEventType[];
  /** Throttle updates (ms) */
  throttle?: number;
  /** Filter for specific changes */
  filter?: (event: ResourceEvent) => boolean;
  /** Initial value request */
  includeInitialValue?: boolean;
  /** Reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
}

/**
 * Resource event types
 */
export type ResourceEventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'moved'
  | 'renamed'
  | 'content-changed'
  | 'metadata-changed';

/**
 * Resource event
 */
export interface ResourceEvent {
  /** Event type */
  type: ResourceEventType;
  /** Resource URI */
  uri: string;
  /** Server ID */
  serverId: string;
  /** Old value (for updates) */
  oldValue?: unknown;
  /** New value */
  newValue?: unknown;
  /** Change delta */
  delta?: unknown;
  /** Event timestamp */
  timestamp: Date;
  /** Additional event data */
  metadata?: Record<string, unknown>;
}

/**
 * Resource subscription
 */
export interface ResourceSubscription {
  /** Subscription ID */
  id: string;
  /** Resource URI */
  uri: string;
  /** Server ID */
  serverId: string;
  /** Subscription options */
  options: ResourceSubscriptionOptions;
  /** Subscription status */
  status: 'active' | 'paused' | 'disconnected' | 'error';
  /** Created timestamp */
  createdAt: Date;
  /** Last event timestamp */
  lastEventAt?: Date;
  /** Event count */
  eventCount: number;
  /** Unsubscribe function */
  unsubscribe: () => Promise<void>;
}

/**
 * Resource cache entry
 */
export interface ResourceCacheEntry {
  /** Resource URI */
  uri: string;
  /** Server ID */
  serverId: string;
  /** Cached content */
  content: MCPResourceContent;
  /** Cache timestamp */
  cachedAt: Date;
  /** Expiry timestamp */
  expiresAt?: Date;
  /** Access count since cached */
  accessCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: Date;
  /** Content size in bytes */
  size: number;
  /** Content checksum */
  checksum?: string;
  /** Cache metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resource cache configuration
 */
export interface ResourceCacheConfig {
  /** Maximum cache size in bytes */
  maxSize?: number;
  /** Maximum entries */
  maxEntries?: number;
  /** Default TTL in seconds */
  defaultTTL?: number;
  /** Cache strategy */
  strategy?: 'lru' | 'lfu' | 'fifo' | 'ttl';
  /** Enable persistent cache */
  persistent?: boolean;
  /** Persistent cache path */
  persistentPath?: string;
  /** Compression for cached content */
  compression?: boolean;
  /** Cache key generator */
  keyGenerator?: (uri: string, serverId: string) => string;
}

/**
 * Resource filter options
 */
export interface ResourceFilterOptions {
  /** Filter by server ID */
  serverId?: string;
  /** Filter by MIME type */
  mimeType?: string | string[];
  /** Filter by URI pattern */
  uriPattern?: string | RegExp;
  /** Filter by tags */
  tags?: string[];
  /** Filter by availability */
  isAvailable?: boolean;
  /** Filter by subscription support */
  supportsSubscription?: boolean;
  /** Minimum size in bytes */
  minSize?: number;
  /** Maximum size in bytes */
  maxSize?: number;
  /** Modified after date */
  modifiedAfter?: Date;
  /** Modified before date */
  modifiedBefore?: Date;
}

/**
 * Resource list options
 */
export interface ResourceListOptions {
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
  /** Sort field */
  sortBy?: 'name' | 'uri' | 'size' | 'lastModified' | 'accessCount';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Include metadata */
  includeMetadata?: boolean;
  /** Include permissions */
  includePermissions?: boolean;
  /** Filter options */
  filter?: ResourceFilterOptions;
}

/**
 * Resource list result
 */
export interface ResourceListResult {
  /** Resources */
  resources: ExtendedResource[];
  /** Total count (for pagination) */
  total: number;
  /** Current offset */
  offset: number;
  /** Current limit */
  limit: number;
  /** Has more results */
  hasMore: boolean;
}

/**
 * Resource transformation options
 */
export interface ResourceTransformOptions {
  /** Target format */
  targetFormat?: 'text' | 'json' | 'base64' | 'hex';
  /** Target encoding */
  targetEncoding?: 'utf8' | 'ascii' | 'base64' | 'hex' | 'binary' | 'utf16le' | 'ucs2' | 'latin1';
  /** Compression */
  compress?: boolean;
  /** Minify JSON/XML */
  minify?: boolean;
  /** Pretty print JSON/XML */
  pretty?: boolean;
  /** Custom transformer function */
  transformer?: (content: unknown) => unknown;
}

/**
 * Resource aggregation request
 */
export interface ResourceAggregationRequest {
  /** Resources to aggregate */
  resources: Array<{
    uri: string;
    serverId?: string;
    transform?: ResourceTransformOptions;
  }>;
  /** Aggregation mode */
  mode: 'concat' | 'merge' | 'zip' | 'custom';
  /** Separator for concatenation */
  separator?: string;
  /** Merge strategy */
  mergeStrategy?: 'shallow' | 'deep' | 'replace';
  /** Custom aggregation function */
  aggregator?: (contents: unknown[]) => unknown;
}

/**
 * Resource manager configuration
 */
export interface ResourceManagerConfig {
  /** Cache configuration */
  cache?: ResourceCacheConfig;
  /** Default access options */
  defaultAccessOptions?: ResourceAccessOptions;
  /** Enable subscriptions */
  enableSubscriptions?: boolean;
  /** Maximum concurrent subscriptions */
  maxSubscriptions?: number;
  /** Enable aggregation */
  enableAggregation?: boolean;
  /** Maximum aggregation size */
  maxAggregationSize?: number;
  /** Auto-refresh interval for resource list */
  autoRefreshInterval?: number;
  /** Resource validation */
  validateResources?: boolean;
  /** Custom validators */
  validators?: ResourceValidator[];
}

/**
 * Resource validator
 */
export interface ResourceValidator {
  /** Validator name */
  name: string;
  /** Resource types to validate */
  mimeTypes?: string[];
  /** Validation function */
  validate: (resource: MCPResourceContent) => ResourceValidationResult;
}

/**
 * Resource validation result
 */
export interface ResourceValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors */
  errors?: string[];
  /** Validation warnings */
  warnings?: string[];
  /** Sanitized content */
  sanitizedContent?: unknown;
}

/**
 * Resource discovery event
 */
export interface ResourceDiscoveryEvent {
  /** Event type */
  type: 'discovered' | 'updated' | 'removed';
  /** Server ID */
  serverId: string;
  /** Affected resources */
  resources: MCPResource[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * Resource access event
 */
export interface ResourceAccessEvent {
  /** Event type */
  type: 'read' | 'cached' | 'subscribed' | 'unsubscribed' | 'error';
  /** Resource URI */
  uri: string;
  /** Server ID */
  serverId: string;
  /** Access options used */
  options?: ResourceAccessOptions;
  /** Result size in bytes */
  size?: number;
  /** From cache */
  fromCache?: boolean;
  /** Error if failed */
  error?: Error;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Batch resource request
 */
export interface BatchResourceRequest {
  /** Batch ID */
  id: string;
  /** Resources to access */
  resources: Array<{
    uri: string;
    serverId?: string;
    options?: ResourceAccessOptions;
  }>;
  /** Batch mode */
  mode: 'sequential' | 'parallel';
  /** Stop on first error */
  stopOnError?: boolean;
  /** Maximum parallel requests */
  maxParallel?: number;
}

/**
 * Batch resource result
 */
export interface BatchResourceResult {
  /** Batch ID */
  batchId: string;
  /** Individual results */
  results: Array<{
    uri: string;
    content?: MCPResourceContent;
    error?: Error;
    fromCache?: boolean;
  }>;
  /** Execution summary */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    cached: number;
    totalSize: number;
    totalTime: number;
  };
}
