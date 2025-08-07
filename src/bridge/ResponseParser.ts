import type { MCPTool } from '../types/mcp.types';
import type { ParsedToolCall, ParsingStrategy } from './types';
import { ParsingError } from './types';

export class ResponseParser {
  private strategies: Map<string, ParsingStrategy> = new Map();
  private fallbackStrategy: string = 'natural';

  constructor() {
    this.initializeDefaultStrategies();
  }

  private initializeDefaultStrategies(): void {
    this.strategies.set('json', new JsonParsingStrategy());
    this.strategies.set('xml', new XmlParsingStrategy());
    this.strategies.set('markdown', new MarkdownParsingStrategy());
    this.strategies.set('natural', new NaturalLanguageStrategy());
    this.strategies.set('structured', new StructuredOutputStrategy());
  }

  addStrategy(name: string, strategy: ParsingStrategy): void {
    this.strategies.set(name, strategy);
  }

  setFallbackStrategy(name: string): void {
    if (!this.strategies.has(name)) {
      throw new Error(`Strategy not found: ${name}`);
    }
    this.fallbackStrategy = name;
  }

  parse(content: string, tools: MCPTool[]): ParsedToolCall[] {
    const errors: Array<{ strategy: string; error: Error }> = [];

    for (const [name, strategy] of this.strategies) {
      try {
        if (strategy.canParse(content)) {
          const result = strategy.parse(content, tools);
          if (result.length > 0) {
            return result;
          }
        }
      } catch (error) {
        errors.push({ strategy: name, error: error as Error });
      }
    }

    const fallback = this.strategies.get(this.fallbackStrategy);
    if (fallback) {
      try {
        return fallback.parse(content, tools);
      } catch (error) {
        errors.push({ strategy: this.fallbackStrategy, error: error as Error });
      }
    }

    if (errors.length > 0) {
      throw new ParsingError('Failed to parse tool calls from response', {
        errors,
        content: content.substring(0, 200),
      });
    }

    return [];
  }

  detectStrategy(content: string): string | null {
    for (const [name, strategy] of this.strategies) {
      if (strategy.canParse(content)) {
        return name;
      }
    }
    return null;
  }

  parseWithStrategy(content: string, tools: MCPTool[], strategyName: string): ParsedToolCall[] {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyName}`);
    }

    return strategy.parse(content, tools);
  }
}

class JsonParsingStrategy implements ParsingStrategy {
  name = 'json';

  canParse(content: string): boolean {
    return (
      content.includes('```json') ||
      content.includes('"tool_calls"') ||
      content.includes('"function_call"') ||
      /\{"[^"]+"\s*:\s*{/.test(content)
    );
  }

  parse(content: string, tools: MCPTool[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];

    const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
    let match;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const toolCall = this.extractToolCall(item, tools);
            if (toolCall) {
              toolCalls.push(toolCall);
            }
          }
        } else if (parsed.tool_calls) {
          for (const call of parsed.tool_calls) {
            const toolCall = this.extractToolCall(call, tools);
            if (toolCall) {
              toolCalls.push(toolCall);
            }
          }
        } else {
          const toolCall = this.extractToolCall(parsed, tools);
          if (toolCall) {
            toolCalls.push(toolCall);
          }
        }
      } catch {
        continue;
      }
    }

    const inlineJsonRegex = /\{"(?:tool|function)_name"\s*:\s*"([^"]+)"[^}]*\}/g;
    while ((match = inlineJsonRegex.exec(content)) !== null) {
      try {
        const jsonStr = match[0];
        const parsed = JSON.parse(jsonStr);
        const toolCall = this.extractToolCall(parsed, tools);
        if (toolCall) {
          toolCalls.push(toolCall);
        }
      } catch {
        continue;
      }
    }

    return toolCalls;
  }

  private extractToolCall(obj: Record<string, unknown>, tools: MCPTool[]): ParsedToolCall | null {
    const toolName = obj.tool_name || obj.function_name || obj.name || obj.tool;
    const args = obj.arguments || obj.parameters || obj.args || {};

    if (typeof toolName !== 'string') {
      return null;
    }

    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      return null;
    }

    return {
      toolName: toolName as string,
      arguments: typeof args === 'object' ? (args as Record<string, unknown>) : {},
      confidence: 0.9,
      rawMatch: JSON.stringify(obj),
    };
  }
}

class XmlParsingStrategy implements ParsingStrategy {
  name = 'xml';

  canParse(content: string): boolean {
    return (
      content.includes('<tool_call>') ||
      content.includes('<function>') ||
      content.includes('<invoke>')
    );
  }

  parse(content: string, tools: MCPTool[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];

    const toolCallRegex =
      /<tool_call>\s*<name>([^<]+)<\/name>\s*(?:<arguments>([\s\S]*?)<\/arguments>)?\s*<\/tool_call>/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      const toolName = match[1].trim();
      const argsStr = match[2] || '';

      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        continue;
      }

      const args = this.parseArguments(argsStr);

      toolCalls.push({
        toolName,
        arguments: args,
        confidence: 0.85,
        rawMatch: match[0],
      });
    }

    const functionRegex = /<function\s+name="([^"]+)"(?:\s+args="([^"]*)")?\s*\/>/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const toolName = match[1];
      const argsStr = match[2] || '{}';

      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        continue;
      }

      try {
        const args = JSON.parse(argsStr);
        toolCalls.push({
          toolName,
          arguments: args,
          confidence: 0.8,
          rawMatch: match[0],
        });
      } catch {
        continue;
      }
    }

    return toolCalls;
  }

  private parseArguments(argsStr: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    const paramRegex = /<param\s+name="([^"]+)">([^<]*)<\/param>/g;
    let match;

    while ((match = paramRegex.exec(argsStr)) !== null) {
      const name = match[1];
      const value = match[2];

      try {
        args[name] = JSON.parse(value);
      } catch {
        args[name] = value;
      }
    }

    if (Object.keys(args).length === 0) {
      try {
        return JSON.parse(argsStr);
      } catch {
        return {};
      }
    }

    return args;
  }
}

class MarkdownParsingStrategy implements ParsingStrategy {
  name = 'markdown';

  canParse(content: string): boolean {
    return (
      content.includes('TOOL_CALL:') ||
      content.includes('**Tool:**') ||
      content.includes('### Tool:')
    );
  }

  parse(content: string, tools: MCPTool[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];

    const simplePattern = /TOOL_CALL:\s*([\w-]+)\s*\nARGUMENTS:\s*({[^}]+})/g;
    let match;

    while ((match = simplePattern.exec(content)) !== null) {
      const toolName = match[1];
      const argsStr = match[2];

      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        continue;
      }

      try {
        const args = JSON.parse(argsStr);
        toolCalls.push({
          toolName,
          arguments: args,
          confidence: 0.9,
          rawMatch: match[0],
        });
      } catch {
        continue;
      }
    }

    const markdownPattern =
      /\*\*Tool:\*\*\s*([\w-]+)\s*\n\*\*Arguments:\*\*\s*```(?:json)?\s*([\s\S]*?)```/g;
    while ((match = markdownPattern.exec(content)) !== null) {
      const toolName = match[1];
      const argsStr = match[2];

      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        continue;
      }

      try {
        const args = JSON.parse(argsStr);
        toolCalls.push({
          toolName,
          arguments: args,
          confidence: 0.85,
          rawMatch: match[0],
        });
      } catch {
        continue;
      }
    }

    return toolCalls;
  }
}

class NaturalLanguageStrategy implements ParsingStrategy {
  name = 'natural';

  canParse(_content: string): boolean {
    return true;
  }

  parse(content: string, tools: MCPTool[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];
    const contentLower = content.toLowerCase();

    for (const tool of tools) {
      const toolNameLower = tool.name.toLowerCase();
      const patterns = [
        `use ${toolNameLower}`,
        `call ${toolNameLower}`,
        `invoke ${toolNameLower}`,
        `execute ${toolNameLower}`,
        `run ${toolNameLower}`,
        `i need to ${toolNameLower}`,
        `let me ${toolNameLower}`,
        `i'll ${toolNameLower}`,
        `i will ${toolNameLower}`,
      ];

      for (const pattern of patterns) {
        if (contentLower.includes(pattern)) {
          const args = this.extractArguments(content, tool);
          toolCalls.push({
            toolName: tool.name,
            arguments: args,
            confidence: 0.6,
            rawMatch: pattern,
          });
          break;
        }
      }
    }

    return toolCalls;
  }

  private extractArguments(content: string, tool: MCPTool): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (!tool.inputSchema?.properties) {
      return args;
    }

    const properties = tool.inputSchema.properties as Record<string, { type: string }>;

    for (const [propName, propSchema] of Object.entries(properties)) {
      const patterns = [
        new RegExp(`${propName}[:\\s]+([^,\\n]+)`, 'i'),
        new RegExp(`with ${propName} ([^,\\n]+)`, 'i'),
        new RegExp(`"${propName}"[:\\s]*"([^"]+)"`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const value = match[1].trim();
          args[propName] = this.parseValue(value, propSchema.type);
          break;
        }
      }
    }

    return args;
  }

  private parseValue(value: string, type: string): unknown {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'array':
        try {
          return JSON.parse(value);
        } catch {
          return value.split(',').map((s) => s.trim());
        }
      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }
}

class StructuredOutputStrategy implements ParsingStrategy {
  name = 'structured';

  canParse(content: string): boolean {
    return content.includes('Action:') || content.includes('Thought:') || content.includes('Tool:');
  }

  parse(content: string, tools: MCPTool[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];

    const actionPattern = /Action:\s*([\w-]+)\s*\nAction Input:\s*({[^}]+}|\[[^\]]+\]|[^\n]+)/g;
    let match;

    while ((match = actionPattern.exec(content)) !== null) {
      const toolName = match[1];
      const inputStr = match[2];

      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        continue;
      }

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(inputStr);
      } catch {
        if (inputStr.includes(':')) {
          const pairs = inputStr.split(',');
          for (const pair of pairs) {
            const [key, value] = pair.split(':').map((s) => s.trim());
            if (key && value) {
              args[key] = value;
            }
          }
        } else {
          args = { input: inputStr };
        }
      }

      toolCalls.push({
        toolName,
        arguments: args,
        confidence: 0.75,
        rawMatch: match[0],
      });
    }

    const toolPattern = /Tool:\s*([\w-]+)\s*\nInput:\s*([^\n]+)/g;
    while ((match = toolPattern.exec(content)) !== null) {
      const toolName = match[1];
      const inputStr = match[2];

      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        continue;
      }

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(inputStr);
      } catch {
        args = { input: inputStr };
      }

      toolCalls.push({
        toolName,
        arguments: args,
        confidence: 0.7,
        rawMatch: match[0],
      });
    }

    return toolCalls;
  }
}
