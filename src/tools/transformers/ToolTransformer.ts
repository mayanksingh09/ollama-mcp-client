import type { MCPTool, MCPToolResult } from '../../types/mcp.types';

export interface TransformerContext {
  toolName: string;
  serverId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface TransformResult<T = unknown> {
  transformed: T;
  skip?: boolean;
  error?: Error;
  metadata?: Record<string, unknown>;
}

export abstract class ToolTransformer {
  protected name: string;
  protected priority: number;
  protected enabled: boolean = true;

  constructor(name: string, priority = 0) {
    this.name = name;
    this.priority = priority;
  }

  abstract canTransform(toolName: string, context: TransformerContext): boolean;

  abstract transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>>;

  abstract transformOutput(
    result: MCPToolResult,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>>;

  getName(): string {
    return this.name;
  }

  getPriority(): number {
    return this.priority;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  protected validateInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool
  ): { valid: boolean; errors?: string[] } {
    if (!tool.inputSchema) {
      return { valid: true };
    }

    const errors: string[] = [];
    const required = tool.inputSchema.required || [];
    const properties = tool.inputSchema.properties || {};

    if (required.length > 0 && !args) {
      errors.push('Arguments are required but none provided');
      return { valid: false, errors };
    }

    for (const prop of required) {
      if (!args || !(prop in args)) {
        errors.push(`Required property '${prop}' is missing`);
      }
    }

    if (args) {
      for (const [key, value] of Object.entries(args)) {
        const schema = properties[key] as Record<string, unknown>;
        if (schema) {
          const typeError = this.validateType(value, schema);
          if (typeError) {
            errors.push(`Property '${key}': ${typeError}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validateType(value: unknown, schema: Record<string, unknown>): string | null {
    const type = schema.type as string;

    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Expected string, got ${typeof value}`;
        }
        break;
      case 'number':
      case 'integer':
        if (typeof value !== 'number') {
          return `Expected number, got ${typeof value}`;
        }
        if (type === 'integer' && !Number.isInteger(value)) {
          return 'Expected integer, got decimal';
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Expected boolean, got ${typeof value}`;
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return `Expected array, got ${typeof value}`;
        }
        break;
      case 'object':
        if (typeof value !== 'object' || value === null) {
          return `Expected object, got ${typeof value}`;
        }
        break;
    }

    return null;
  }
}

export class ChainedTransformer extends ToolTransformer {
  private transformers: ToolTransformer[] = [];

  constructor(name = 'ChainedTransformer', transformers: ToolTransformer[] = []) {
    super(name, 0);
    this.transformers = transformers.sort((a, b) => b.getPriority() - a.getPriority());
  }

  addTransformer(transformer: ToolTransformer): void {
    this.transformers.push(transformer);
    this.transformers.sort((a, b) => b.getPriority() - a.getPriority());
  }

  removeTransformer(name: string): boolean {
    const index = this.transformers.findIndex((t) => t.getName() === name);
    if (index !== -1) {
      this.transformers.splice(index, 1);
      return true;
    }
    return false;
  }

  canTransform(toolName: string, context: TransformerContext): boolean {
    return this.transformers.some((t) => t.isEnabled() && t.canTransform(toolName, context));
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    let currentArgs = args;
    const metadata: Record<string, unknown> = {};

    for (const transformer of this.transformers) {
      if (!transformer.isEnabled() || !transformer.canTransform(tool.name, context)) {
        continue;
      }

      try {
        const result = await transformer.transformInput(currentArgs, tool, context);

        if (result.skip) {
          return result;
        }

        if (result.error) {
          return result;
        }

        currentArgs = result.transformed;

        if (result.metadata) {
          Object.assign(metadata, result.metadata);
        }
      } catch (error) {
        return {
          transformed: currentArgs,
          error: error as Error,
          metadata,
        };
      }
    }

    return { transformed: currentArgs, metadata };
  }

  async transformOutput(
    result: MCPToolResult,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>> {
    let currentResult = result;
    const metadata: Record<string, unknown> = {};

    for (const transformer of this.transformers) {
      if (!transformer.isEnabled() || !transformer.canTransform(tool.name, context)) {
        continue;
      }

      try {
        const transformed = await transformer.transformOutput(currentResult, tool, context);

        if (transformed.skip) {
          return transformed;
        }

        if (transformed.error) {
          return transformed;
        }

        currentResult = transformed.transformed;

        if (transformed.metadata) {
          Object.assign(metadata, transformed.metadata);
        }
      } catch (error) {
        return {
          transformed: currentResult,
          error: error as Error,
          metadata,
        };
      }
    }

    return { transformed: currentResult, metadata };
  }
}

export class ConditionalTransformer extends ToolTransformer {
  private condition: (toolName: string, context: TransformerContext) => boolean;
  private transformer: ToolTransformer;

  constructor(
    name: string,
    condition: (toolName: string, context: TransformerContext) => boolean,
    transformer: ToolTransformer
  ) {
    super(name, transformer.getPriority());
    this.condition = condition;
    this.transformer = transformer;
  }

  canTransform(toolName: string, context: TransformerContext): boolean {
    return this.condition(toolName, context) && this.transformer.canTransform(toolName, context);
  }

  async transformInput(
    args: Record<string, unknown> | undefined,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<Record<string, unknown> | undefined>> {
    if (!this.canTransform(tool.name, context)) {
      return { transformed: args };
    }

    return this.transformer.transformInput(args, tool, context);
  }

  async transformOutput(
    result: MCPToolResult,
    tool: MCPTool,
    context: TransformerContext
  ): Promise<TransformResult<MCPToolResult>> {
    if (!this.canTransform(tool.name, context)) {
      return { transformed: result };
    }

    return this.transformer.transformOutput(result, tool, context);
  }
}
