/**
 * Prompt management type definitions
 */

import type { MCPPrompt } from './mcp.types';

/**
 * Extended prompt definition with metadata
 */
export interface ExtendedPrompt extends MCPPrompt {
  /** Server ID that provides this prompt */
  serverId: string;
  /** Prompt category */
  category?: string;
  /** Prompt tags */
  tags?: string[];
  /** Prompt version */
  version?: string;
  /** Supported models */
  supportedModels?: string[];
  /** Token count estimate */
  estimatedTokens?: number;
  /** Usage count */
  usageCount?: number;
  /** Success rate */
  successRate?: number;
  /** Last used timestamp */
  lastUsed?: Date;
  /** Whether the prompt is currently available */
  isAvailable?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Prompt parameter definition
 */
export interface PromptParameter {
  /** Parameter name */
  name: string;
  /** Parameter description */
  description?: string;
  /** Parameter type */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Whether required */
  required?: boolean;
  /** Default value */
  default?: unknown;
  /** Validation pattern */
  pattern?: string;
  /** Minimum value/length */
  min?: number;
  /** Maximum value/length */
  max?: number;
  /** Enum values */
  enum?: unknown[];
  /** Example value */
  example?: unknown;
}

/**
 * Prompt template
 */
export interface PromptTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Template content */
  content: string;
  /** Template parameters */
  parameters?: PromptParameter[];
  /** Parent template for inheritance */
  extends?: string;
  /** Template sections */
  sections?: PromptSection[];
  /** Conditional blocks */
  conditionals?: PromptConditional[];
  /** Template metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Prompt section for composition
 */
export interface PromptSection {
  /** Section ID */
  id: string;
  /** Section name */
  name: string;
  /** Section content */
  content: string;
  /** Whether section is optional */
  optional?: boolean;
  /** Section order */
  order?: number;
  /** Section conditions */
  condition?: PromptCondition;
}

/**
 * Prompt conditional block
 */
export interface PromptConditional {
  /** Conditional ID */
  id: string;
  /** Condition to evaluate */
  condition: PromptCondition;
  /** Content if true */
  ifTrue: string;
  /** Content if false */
  ifFalse?: string;
}

/**
 * Prompt condition
 */
export interface PromptCondition {
  /** Condition type */
  type: 'equals' | 'contains' | 'regex' | 'exists' | 'custom';
  /** Parameter to check */
  parameter?: string;
  /** Value to compare */
  value?: unknown;
  /** Custom evaluation function */
  evaluate?: (params: Record<string, unknown>) => boolean;
}

/**
 * Prompt execution options
 */
export interface PromptExecutionOptions {
  /** Parameters to fill */
  parameters?: Record<string, unknown>;
  /** Model to use */
  model?: string;
  /** Temperature setting */
  temperature?: number;
  /** Maximum tokens */
  maxTokens?: number;
  /** Top P sampling */
  topP?: number;
  /** Top K sampling */
  topK?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** System prompt override */
  systemPrompt?: string;
  /** Response format */
  format?: 'text' | 'json' | 'markdown';
  /** Streaming response */
  stream?: boolean;
  /** Cache the result */
  cache?: boolean;
  /** Cache TTL in seconds */
  cacheTTL?: number;
}

/**
 * Prompt sampling configuration
 */
export interface PromptSamplingConfig {
  /** Sampling strategy */
  strategy?: 'greedy' | 'random' | 'top-k' | 'top-p' | 'beam';
  /** Temperature */
  temperature?: number;
  /** Top K value */
  topK?: number;
  /** Top P value */
  topP?: number;
  /** Repetition penalty */
  repetitionPenalty?: number;
  /** Length penalty */
  lengthPenalty?: number;
  /** Beam width for beam search */
  beamWidth?: number;
  /** Number of samples to generate */
  numSamples?: number;
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Prompt composition request
 */
export interface PromptCompositionRequest {
  /** Base prompt name or template */
  base: string;
  /** Additional sections to include */
  sections?: string[];
  /** Parameters for all prompts */
  parameters?: Record<string, unknown>;
  /** Composition mode */
  mode?: 'append' | 'prepend' | 'replace' | 'merge';
  /** Separator between sections */
  separator?: string;
  /** Whether to resolve references */
  resolveReferences?: boolean;
}

/**
 * Prompt execution result
 */
export interface PromptExecutionResult {
  /** Prompt name */
  promptName: string;
  /** Generated messages */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  /** Parameters used */
  parameters?: Record<string, unknown>;
  /** Token count */
  tokenCount?: number;
  /** Execution time */
  executionTime?: number;
  /** From cache */
  fromCache?: boolean;
  /** Server ID */
  serverId: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Prompt cache entry
 */
export interface PromptCacheEntry {
  /** Cache key */
  key: string;
  /** Prompt name */
  promptName: string;
  /** Parameters hash */
  parametersHash: string;
  /** Cached result */
  result: PromptExecutionResult;
  /** Cache timestamp */
  cachedAt: Date;
  /** Expiry timestamp */
  expiresAt?: Date;
  /** Access count */
  accessCount: number;
  /** Last accessed */
  lastAccessedAt: Date;
}

/**
 * Prompt cache configuration
 */
export interface PromptCacheConfig {
  /** Maximum cache size */
  maxSize?: number;
  /** Maximum entries */
  maxEntries?: number;
  /** Default TTL in seconds */
  defaultTTL?: number;
  /** Cache strategy */
  strategy?: 'lru' | 'lfu' | 'ttl';
  /** Enable persistent cache */
  persistent?: boolean;
  /** Persistent cache path */
  persistentPath?: string;
  /** Cache key generator */
  keyGenerator?: (name: string, params: Record<string, unknown>) => string;
}

/**
 * Prompt filter options
 */
export interface PromptFilterOptions {
  /** Filter by server ID */
  serverId?: string;
  /** Filter by category */
  category?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by name pattern */
  namePattern?: string | RegExp;
  /** Filter by supported models */
  supportedModels?: string[];
  /** Filter by availability */
  isAvailable?: boolean;
  /** Maximum token count */
  maxTokens?: number;
  /** Minimum success rate */
  minSuccessRate?: number;
}

/**
 * Prompt manager configuration
 */
export interface PromptManagerConfig {
  /** Cache configuration */
  cache?: PromptCacheConfig;
  /** Default execution options */
  defaultExecutionOptions?: PromptExecutionOptions;
  /** Enable composition */
  enableComposition?: boolean;
  /** Enable template inheritance */
  enableInheritance?: boolean;
  /** Maximum composition depth */
  maxCompositionDepth?: number;
  /** Auto-refresh interval */
  autoRefreshInterval?: number;
  /** Validate parameters */
  validateParameters?: boolean;
  /** Custom validators */
  validators?: PromptValidator[];
}

/**
 * Prompt validator
 */
export interface PromptValidator {
  /** Validator name */
  name: string;
  /** Validation function */
  validate: (prompt: ExtendedPrompt, params: Record<string, unknown>) => PromptValidationResult;
}

/**
 * Prompt validation result
 */
export interface PromptValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors */
  errors?: Array<{
    parameter: string;
    message: string;
    expected?: unknown;
    received?: unknown;
  }>;
  /** Validation warnings */
  warnings?: string[];
  /** Sanitized parameters */
  sanitizedParams?: Record<string, unknown>;
}

/**
 * Prompt discovery event
 */
export interface PromptDiscoveryEvent {
  /** Event type */
  type: 'discovered' | 'updated' | 'removed';
  /** Server ID */
  serverId: string;
  /** Affected prompts */
  prompts: MCPPrompt[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * Prompt execution event
 */
export interface PromptExecutionEvent {
  /** Event type */
  type: 'started' | 'completed' | 'failed' | 'cached';
  /** Prompt name */
  promptName: string;
  /** Server ID */
  serverId: string;
  /** Parameters used */
  parameters?: Record<string, unknown>;
  /** Result if completed */
  result?: PromptExecutionResult;
  /** Error if failed */
  error?: Error;
  /** From cache */
  fromCache?: boolean;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Prompt chain definition
 */
export interface PromptChain {
  /** Chain ID */
  id: string;
  /** Chain name */
  name: string;
  /** Chain description */
  description?: string;
  /** Prompts in the chain */
  prompts: PromptChainStep[];
  /** Chain execution mode */
  mode?: 'sequential' | 'parallel' | 'conditional';
  /** Stop on error */
  stopOnError?: boolean;
}

/**
 * Prompt chain step
 */
export interface PromptChainStep {
  /** Step ID */
  id: string;
  /** Prompt name */
  promptName: string;
  /** Parameters (can reference previous results) */
  parameters?: Record<string, unknown> | PromptParameterReference;
  /** Execution condition */
  condition?: PromptCondition;
  /** Result transformer */
  transform?: (result: PromptExecutionResult) => unknown;
  /** Dependencies */
  dependsOn?: string[];
}

/**
 * Prompt parameter reference
 */
export interface PromptParameterReference {
  /** Reference to previous step */
  $ref: string;
  /** Path to extract */
  path?: string;
  /** Default value */
  default?: unknown;
}

/**
 * Batch prompt request
 */
export interface BatchPromptRequest {
  /** Batch ID */
  id: string;
  /** Prompts to execute */
  prompts: Array<{
    name: string;
    parameters?: Record<string, unknown>;
    options?: PromptExecutionOptions;
  }>;
  /** Execution mode */
  mode: 'sequential' | 'parallel';
  /** Stop on error */
  stopOnError?: boolean;
  /** Maximum parallel executions */
  maxParallel?: number;
}

/**
 * Batch prompt result
 */
export interface BatchPromptResult {
  /** Batch ID */
  batchId: string;
  /** Individual results */
  results: PromptExecutionResult[];
  /** Execution summary */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    cached: number;
    totalTokens: number;
    totalTime: number;
    averageTime: number;
  };
  /** Errors if any */
  errors?: Array<{
    promptName: string;
    error: Error;
  }>;
}
