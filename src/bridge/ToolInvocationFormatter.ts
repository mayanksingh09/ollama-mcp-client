import type { MCPTool, MCPToolCall } from '../types/mcp.types';
import type { ParsedToolCall, FormattedToolCall } from './types';
import { ToolSelectionError } from './types';

export class ToolInvocationFormatter {
  private validationErrors: Map<string, string[]> = new Map();

  formatForMCP(parsedCall: ParsedToolCall, tool: MCPTool): MCPToolCall {
    const validated = this.validateAndFormat(parsedCall, tool);

    if (!validated.validated) {
      throw new ToolSelectionError(`Invalid tool call for ${parsedCall.toolName}`, {
        errors: validated.errors,
      });
    }

    return {
      name: validated.name,
      arguments: validated.arguments,
    };
  }

  formatBatch(parsedCalls: ParsedToolCall[], tools: MCPTool[]): MCPToolCall[] {
    const formatted: MCPToolCall[] = [];
    const errors: Array<{ tool: string; errors: string[] }> = [];

    for (const call of parsedCalls) {
      const tool = tools.find((t) => t.name === call.toolName);
      if (!tool) {
        errors.push({
          tool: call.toolName,
          errors: [`Tool not found: ${call.toolName}`],
        });
        continue;
      }

      try {
        const mcpCall = this.formatForMCP(call, tool);
        formatted.push(mcpCall);
      } catch (error) {
        if (error instanceof ToolSelectionError) {
          errors.push({
            tool: call.toolName,
            errors: (error.details as { errors: string[] }).errors || ['Unknown error'],
          });
        }
      }
    }

    if (errors.length > 0 && formatted.length === 0) {
      throw new ToolSelectionError('All tool calls failed validation', { errors });
    }

    return formatted;
  }

  validateAndFormat(parsedCall: ParsedToolCall, tool: MCPTool): FormattedToolCall {
    const errors: string[] = [];
    const formattedArgs: Record<string, unknown> = {};

    if (!tool.inputSchema) {
      return {
        name: parsedCall.toolName,
        arguments: parsedCall.arguments,
        validated: true,
      };
    }

    const schema = tool.inputSchema;
    const properties = (schema.properties || {}) as Record<
      string,
      {
        type: string;
        description?: string;
        enum?: unknown[];
        minimum?: number;
        maximum?: number;
        minLength?: number;
        maxLength?: number;
        pattern?: string;
        items?: { type: string };
      }
    >;
    const required = (schema.required || []) as string[];

    for (const propName of required) {
      if (!(propName in parsedCall.arguments)) {
        errors.push(`Missing required parameter: ${propName}`);
      }
    }

    for (const [propName, value] of Object.entries(parsedCall.arguments)) {
      const propSchema = properties[propName];

      if (!propSchema) {
        if (schema.additionalProperties === false) {
          errors.push(`Unknown parameter: ${propName}`);
          continue;
        }
        formattedArgs[propName] = value;
        continue;
      }

      const validatedValue = this.validateValue(propName, value, propSchema, errors);

      if (validatedValue !== undefined) {
        formattedArgs[propName] = validatedValue;
      }
    }

    for (const [propName, propSchema] of Object.entries(properties)) {
      if (!(propName in formattedArgs) && 'default' in propSchema) {
        formattedArgs[propName] = propSchema.default;
      }
    }

    this.validationErrors.set(parsedCall.toolName, errors);

    return {
      name: parsedCall.toolName,
      arguments: formattedArgs,
      validated: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateValue(
    propName: string,
    value: unknown,
    schema: {
      type: string;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      items?: { type: string };
    },
    errors: string[]
  ): unknown {
    const actualType = this.getActualType(value);

    if (actualType !== schema.type && schema.type !== 'any') {
      const coerced = this.coerceType(value, schema.type);
      if (coerced === undefined) {
        errors.push(`Parameter ${propName}: expected ${schema.type}, got ${actualType}`);
        return undefined;
      }
      value = coerced;
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Parameter ${propName}: must be one of ${JSON.stringify(schema.enum)}`);
      return undefined;
    }

    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`Parameter ${propName}: minimum length is ${schema.minLength}`);
        return undefined;
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`Parameter ${propName}: maximum length is ${schema.maxLength}`);
        return undefined;
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push(`Parameter ${propName}: must match pattern ${schema.pattern}`);
          return undefined;
        }
      }
    }

    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`Parameter ${propName}: minimum value is ${schema.minimum}`);
        return undefined;
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`Parameter ${propName}: maximum value is ${schema.maximum}`);
        return undefined;
      }
    }

    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.items) {
        const itemType = schema.items.type;
        for (let i = 0; i < value.length; i++) {
          const itemActualType = this.getActualType(value[i]);
          if (itemActualType !== itemType) {
            errors.push(`Parameter ${propName}[${i}]: expected ${itemType}, got ${itemActualType}`);
          }
        }
      }
    }

    return value;
  }

  private getActualType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';

    const type = typeof value;
    if (type === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }

    return type;
  }

  private coerceType(value: unknown, targetType: string): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }

    const sourceType = this.getActualType(value);

    if (targetType === 'string') {
      return String(value);
    }

    if (targetType === 'number' || targetType === 'integer') {
      if (sourceType === 'string') {
        const num = Number(value);
        if (!isNaN(num)) {
          return targetType === 'integer' ? Math.floor(num) : num;
        }
      }
      if (sourceType === 'boolean') {
        return value ? 1 : 0;
      }
    }

    if (targetType === 'boolean') {
      if (sourceType === 'string') {
        const str = (value as string).toLowerCase();
        if (str === 'true' || str === '1' || str === 'yes') return true;
        if (str === 'false' || str === '0' || str === 'no') return false;
      }
      if (sourceType === 'number' || sourceType === 'integer') {
        return value !== 0;
      }
    }

    if (targetType === 'array') {
      if (sourceType === 'string') {
        try {
          const parsed = JSON.parse(value as string);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          const str = value as string;
          if (str.includes(',')) {
            return str.split(',').map((s) => s.trim());
          }
          return [value];
        }
      }
      return [value];
    }

    if (targetType === 'object') {
      if (sourceType === 'string') {
        try {
          const parsed = JSON.parse(value as string);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          return { value };
        }
      }
      if (sourceType === 'array') {
        const arr = value as unknown[];
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < arr.length; i++) {
          obj[i.toString()] = arr[i];
        }
        return obj;
      }
    }

    return undefined;
  }

  getValidationErrors(toolName: string): string[] | undefined {
    return this.validationErrors.get(toolName);
  }

  clearValidationErrors(): void {
    this.validationErrors.clear();
  }

  suggestCorrections(parsedCall: ParsedToolCall, tool: MCPTool): Record<string, unknown> {
    const suggestions: Record<string, unknown> = { ...parsedCall.arguments };

    if (!tool.inputSchema?.properties) {
      return suggestions;
    }

    const properties = tool.inputSchema.properties as Record<
      string,
      {
        type: string;
        default?: unknown;
        enum?: unknown[];
        minimum?: number;
        maximum?: number;
      }
    >;

    for (const [propName, propSchema] of Object.entries(properties)) {
      const value = suggestions[propName];

      if (value === undefined && propSchema.default !== undefined) {
        suggestions[propName] = propSchema.default;
        continue;
      }

      if (propSchema.enum && value !== undefined) {
        const valueStr = String(value).toLowerCase();
        const match = propSchema.enum.find((e) => String(e).toLowerCase() === valueStr);
        if (match) {
          suggestions[propName] = match;
        } else if (propSchema.enum.length > 0) {
          suggestions[propName] = propSchema.enum[0];
        }
      }

      if (propSchema.type === 'number' && typeof value === 'number') {
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
          suggestions[propName] = propSchema.minimum;
        }
        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
          suggestions[propName] = propSchema.maximum;
        }
      }
    }

    return suggestions;
  }
}
