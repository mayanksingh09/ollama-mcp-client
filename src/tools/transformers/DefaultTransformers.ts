import type { TransformerContext, TransformResult } from './ToolTransformer';
import { ToolTransformer } from './ToolTransformer';
import type { MCPTool, MCPToolResult } from '../../types/mcp.types';

export class ValidationTransformer extends ToolTransformer {
  constructor() {
    super('ValidationTransformer', 100);
  }

  canTransform(): boolean {
    return true;
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    const validation = this.validateInput(args, tool);

    if (!validation.valid) {
      return {
        transformed: args,
        error: new Error(`Validation failed: ${validation.errors?.join(', ')}`),
        metadata: { validationErrors: validation.errors },
      };
    }

    return { transformed: args };
  }

  async transformOutput(
    result: MCPToolResult,
    _tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>> {
    return { transformed: result };
  }
}

export class LoggingTransformer extends ToolTransformer {
  private logFunction: (message: string, data?: unknown) => void;

  constructor(logFunction?: (message: string, data?: unknown) => void) {
    super('LoggingTransformer', 90);
    this.logFunction = logFunction || console.log;
  }

  canTransform(): boolean {
    return true;
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    this.logFunction(`[${new Date().toISOString()}] Tool input: ${tool.name}`, {
      serverId: context.serverId,
      args,
      metadata: context.metadata,
    });

    return { transformed: args };
  }

  async transformOutput(
    result: MCPToolResult,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>> {
    this.logFunction(`[${new Date().toISOString()}] Tool output: ${tool.name}`, {
      serverId: context.serverId,
      isError: result.isError,
      contentLength: JSON.stringify(result.content).length,
      metadata: context.metadata,
    });

    return { transformed: result };
  }
}

export class SanitizationTransformer extends ToolTransformer {
  private sanitizePatterns: RegExp[] = [
    /password\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
    /api[_-]?key\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
    /token\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
    /secret\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  ];

  constructor() {
    super('SanitizationTransformer', 80);
  }

  canTransform(): boolean {
    return true;
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    _tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    if (!args) {
      return { transformed: args };
    }

    const sanitized = this.sanitizeObject(args);

    return {
      transformed: sanitized,
      metadata: { sanitized: true },
    };
  }

  async transformOutput(
    result: MCPToolResult,
    _tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>> {
    if (!result.content) {
      return { transformed: result };
    }

    const sanitizedContent = result.content.map((item) => {
      if (item.type === 'text' && (item as { text?: string }).text) {
        return {
          ...item,
          text: this.sanitizeString((item as { text?: string }).text || ''),
        };
      }
      return item;
    });

    return {
      transformed: {
        ...result,
        content: sanitizedContent,
      },
      metadata: { sanitized: true },
    };
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          result[key] = value.map((item) =>
            typeof item === 'string' ? this.sanitizeString(item) : item
          );
        } else {
          result[key] = this.sanitizeObject(value as Record<string, unknown>);
        }
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private sanitizeString(str: string): string {
    let sanitized = str;

    for (const pattern of this.sanitizePatterns) {
      sanitized = sanitized.replace(pattern, (match, _value) => {
        const key = match.split(/[:=]/)[0];
        return `${key}: [REDACTED]`;
      });
    }

    return sanitized;
  }
}

export class RetryTransformer extends ToolTransformer {
  private maxRetries: number;
  private retryDelay: number;
  private retryableErrors: string[];

  constructor(
    maxRetries = 3,
    retryDelay = 1000,
    retryableErrors = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND']
  ) {
    super('RetryTransformer', 70);
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.retryableErrors = retryableErrors;
  }

  canTransform(): boolean {
    return true;
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    _tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    return {
      transformed: args,
      metadata: {
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
      },
    };
  }

  async transformOutput(
    result: MCPToolResult,
    _tool: MCPTool,
    context: TransformerContext & { retryCount?: number }
  ): Promise<TransformResult<MCPToolResult>> {
    if (!result.isError) {
      return { transformed: result };
    }

    const errorMessage = (result.content?.[0] as { text?: string })?.text || '';
    const isRetryable = this.retryableErrors.some((err) => errorMessage.includes(err));

    if (!isRetryable) {
      return { transformed: result };
    }

    const retryCount = context.retryCount || 0;

    if (retryCount >= this.maxRetries) {
      return {
        transformed: result,
        metadata: { retriesExhausted: true, retryCount },
      };
    }

    return {
      transformed: result,
      metadata: {
        shouldRetry: true,
        retryCount: retryCount + 1,
        retryDelay: this.retryDelay * Math.pow(2, retryCount),
      },
    };
  }
}

export class CachingTransformer extends ToolTransformer {
  private cache: Map<string, { result: MCPToolResult; timestamp: number }> = new Map();
  private ttl: number;
  private maxCacheSize: number;

  constructor(ttl = 60000, maxCacheSize = 100) {
    super('CachingTransformer', 60);
    this.ttl = ttl;
    this.maxCacheSize = maxCacheSize;
  }

  canTransform(toolName: string, _context: TransformerContext): boolean {
    const cacheableTools = ['read_file', 'list_files', 'get_config'];
    return cacheableTools.includes(toolName.toLowerCase());
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    const cacheKey = this.generateCacheKey(tool.name, args);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return {
        transformed: args,
        skip: true,
        metadata: {
          cached: true,
          cachedResult: cached.result,
          cacheAge: Date.now() - cached.timestamp,
        },
      };
    }

    return { transformed: args };
  }

  async transformOutput(
    result: MCPToolResult,
    tool: MCPTool,
    context: TransformerContext & { args?: Record<string, unknown> }
  ): Promise<TransformResult<MCPToolResult>> {
    if (!result.isError) {
      const cacheKey = this.generateCacheKey(tool.name, context.args);

      if (this.cache.size >= this.maxCacheSize) {
        const oldestKey = Array.from(this.cache.entries()).sort(
          (a, b) => a[1].timestamp - b[1].timestamp
        )[0]?.[0];

        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }

      this.cache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });
    }

    return { transformed: result };
  }

  private generateCacheKey(toolName: string, args?: Record<string, unknown>): string {
    const argsStr = args ? JSON.stringify(args, Object.keys(args).sort()) : '';
    return `${toolName}:${argsStr}`;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export class RateLimitingTransformer extends ToolTransformer {
  private lastExecution: Map<string, number> = new Map();
  private minInterval: number;

  constructor(minInterval = 100) {
    super('RateLimitingTransformer', 50);
    this.minInterval = minInterval;
  }

  canTransform(): boolean {
    return true;
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    const lastTime = this.lastExecution.get(tool.name) || 0;
    const timeSinceLastExecution = Date.now() - lastTime;

    if (timeSinceLastExecution < this.minInterval) {
      const delay = this.minInterval - timeSinceLastExecution;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastExecution.set(tool.name, Date.now());

    return { transformed: args };
  }

  async transformOutput(
    result: MCPToolResult,
    _tool: MCPTool,
    _context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>> {
    return { transformed: result };
  }
}
