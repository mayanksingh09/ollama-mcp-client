/**
 * Tool management type definitions
 */

import type { MCPTool, MCPToolResult } from './mcp.types';

/**
 * Extended tool definition with metadata and validation
 */
export interface ExtendedTool extends MCPTool {
  /** Server ID that provides this tool */
  serverId: string;
  /** Tool category for organization */
  category?: string;
  /** Tool tags for filtering */
  tags?: string[];
  /** Tool version */
  version?: string;
  /** Last updated timestamp */
  lastUpdated?: Date;
  /** Usage count */
  usageCount?: number;
  /** Average execution time in ms */
  avgExecutionTime?: number;
  /** Success rate percentage */
  successRate?: number;
  /** Whether the tool is currently available */
  isAvailable?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  /** Server ID to use for execution */
  serverId?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Whether to validate parameters */
  validateParams?: boolean;
  /** Whether to cache the result */
  cache?: boolean;
  /** Cache TTL in seconds */
  cacheTTL?: number;
  /** Priority level for execution queue */
  priority?: 'low' | 'normal' | 'high';
  /** Callback for progress updates */
  onProgress?: (progress: ToolProgress) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Tool execution progress
 */
export interface ToolProgress {
  /** Current status */
  status: 'pending' | 'validating' | 'executing' | 'completed' | 'failed';
  /** Progress percentage (0-100) */
  percentage?: number;
  /** Status message */
  message?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult extends MCPToolResult {
  /** Tool name */
  toolName: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Whether result was cached */
  fromCache?: boolean;
  /** Server that executed the tool */
  serverId: string;
  /** Execution timestamp */
  timestamp: Date;
  /** Retry count if retried */
  retryCount?: number;
}

/**
 * Tool validation error
 */
export interface ToolValidationError {
  /** Parameter name that failed validation */
  parameter: string;
  /** Error message */
  message: string;
  /** Expected type or format */
  expected?: string;
  /** Actual value received */
  received?: unknown;
  /** JSON Schema path */
  schemaPath?: string;
}

/**
 * Tool validation result
 */
export interface ToolValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors if any */
  errors?: ToolValidationError[];
  /** Coerced/sanitized parameters */
  sanitizedParams?: Record<string, unknown>;
  /** Warnings that don't prevent execution */
  warnings?: string[];
}

/**
 * Tool filter options for searching
 */
export interface ToolFilterOptions {
  /** Filter by server ID */
  serverId?: string;
  /** Filter by category */
  category?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by name pattern */
  namePattern?: string | RegExp;
  /** Filter by availability */
  isAvailable?: boolean;
  /** Minimum success rate */
  minSuccessRate?: number;
  /** Maximum average execution time */
  maxAvgExecutionTime?: number;
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
  /** Enable usage statistics tracking */
  trackUsageStats?: boolean;
  /** Enable performance metrics */
  trackPerformance?: boolean;
  /** Auto-refresh interval in seconds */
  autoRefreshInterval?: number;
  /** Maximum tools to cache */
  maxCachedTools?: number;
  /** Enable tool categorization */
  enableCategorization?: boolean;
  /** Custom categorization function */
  categorizer?: (tool: MCPTool) => string | undefined;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  /** Session ID */
  sessionId: string;
  /** User ID if applicable */
  userId?: string;
  /** Conversation context */
  conversationId?: string;
  /** Parent tool execution if chained */
  parentExecutionId?: string;
  /** Custom context data */
  metadata?: Record<string, unknown>;
}

/**
 * Tool chain definition
 */
export interface ToolChain {
  /** Chain ID */
  id: string;
  /** Chain name */
  name: string;
  /** Chain description */
  description?: string;
  /** Tools in the chain */
  tools: ToolChainStep[];
  /** Whether to stop on first error */
  stopOnError?: boolean;
  /** Maximum parallel executions */
  maxParallel?: number;
}

/**
 * Tool chain step
 */
export interface ToolChainStep {
  /** Step ID */
  id: string;
  /** Tool name */
  toolName: string;
  /** Tool parameters (can reference previous results) */
  parameters: Record<string, unknown> | ParameterReference;
  /** Condition for execution */
  condition?: ToolChainCondition;
  /** Transform function for result */
  transform?: (result: MCPToolResult) => unknown;
  /** Dependencies on other steps */
  dependsOn?: string[];
}

/**
 * Parameter reference for chaining
 */
export interface ParameterReference {
  /** Reference to previous step result */
  $ref: string;
  /** JSONPath to extract value */
  path?: string;
  /** Default value if reference fails */
  default?: unknown;
}

/**
 * Tool chain execution condition
 */
export interface ToolChainCondition {
  /** Condition type */
  type: 'always' | 'success' | 'failure' | 'custom';
  /** Custom condition function */
  evaluate?: (context: ToolChainContext) => boolean;
}

/**
 * Tool chain execution context
 */
export interface ToolChainContext {
  /** Results from previous steps */
  results: Map<string, MCPToolResult>;
  /** Current step index */
  currentStep: number;
  /** Total steps */
  totalSteps: number;
  /** Execution errors */
  errors: Map<string, Error>;
}

/**
 * Tool manager configuration
 */
export interface ToolManagerConfig {
  /** Tool registry configuration */
  registry?: ToolRegistryConfig;
  /** Default execution options */
  defaultExecutionOptions?: ToolExecutionOptions;
  /** Enable tool chaining */
  enableChaining?: boolean;
  /** Maximum chain depth */
  maxChainDepth?: number;
  /** Enable parallel execution */
  enableParallelExecution?: boolean;
  /** Maximum parallel executions */
  maxParallelExecutions?: number;
  /** Tool execution queue size */
  queueSize?: number;
  /** Enable caching */
  enableCaching?: boolean;
  /** Cache configuration */
  cacheConfig?: {
    maxSize?: number;
    ttl?: number;
    strategy?: 'lru' | 'lfu' | 'fifo';
  };
}

/**
 * Tool discovery event
 */
export interface ToolDiscoveryEvent {
  /** Event type */
  type: 'discovered' | 'updated' | 'removed';
  /** Server ID */
  serverId: string;
  /** Affected tools */
  tools: MCPTool[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * Tool execution event
 */
export interface ToolExecutionEvent {
  /** Event type */
  type: 'started' | 'progress' | 'completed' | 'failed';
  /** Execution ID */
  executionId: string;
  /** Tool name */
  toolName: string;
  /** Server ID */
  serverId: string;
  /** Progress information */
  progress?: ToolProgress;
  /** Result if completed */
  result?: ToolExecutionResult;
  /** Error if failed */
  error?: Error;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Batch tool execution request
 */
export interface BatchToolRequest {
  /** Batch ID */
  id: string;
  /** Tools to execute */
  tools: Array<{
    name: string;
    parameters?: Record<string, unknown>;
    options?: ToolExecutionOptions;
  }>;
  /** Batch execution mode */
  mode: 'sequential' | 'parallel';
  /** Stop on first error */
  stopOnError?: boolean;
  /** Maximum parallel executions */
  maxParallel?: number;
}

/**
 * Batch tool execution result
 */
export interface BatchToolResult {
  /** Batch ID */
  batchId: string;
  /** Individual results */
  results: ToolExecutionResult[];
  /** Execution summary */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    totalTime: number;
    averageTime: number;
  };
  /** Errors if any */
  errors?: Array<{
    toolName: string;
    error: Error;
  }>;
}
