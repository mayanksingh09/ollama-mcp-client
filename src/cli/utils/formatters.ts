import chalk from 'chalk';
import * as yaml from 'yaml';
import type { MCPTool, MCPResource, MCPPrompt, MCPToolResult } from '../../types/mcp.types';

export interface FormatOptions {
  colors?: boolean;
  truncate?: boolean;
  maxLength?: number;
  format?: 'pretty' | 'json' | 'yaml';
}

export function formatTool(tool: MCPTool, options: FormatOptions = {}): string {
  const { format = 'pretty', colors = true } = options;

  if (format === 'json') {
    return JSON.stringify(tool, null, 2);
  }

  if (format === 'yaml') {
    return yaml.stringify(tool);
  }

  const color = colors
    ? chalk
    : {
        bold: (s: string) => s,
        dim: (s: string) => s,
        cyan: (s: string) => s,
        gray: (s: string) => s,
      };

  let output = `${color.bold(color.cyan(tool.name))}`;
  if (tool.description) {
    output += `\n  ${color.dim(tool.description)}`;
  }
  if (tool.inputSchema?.properties) {
    output += `\n  ${color.gray('Parameters:')}`;
    for (const [param, schema] of Object.entries(tool.inputSchema.properties)) {
      const paramSchema = schema as Record<string, unknown>;
      const required = tool.inputSchema.required?.includes(param) ? '*' : '';
      output += `\n    - ${param}${required}: ${paramSchema.type || 'any'}`;
      if (paramSchema.description) {
        output += ` ${color.dim(`(${paramSchema.description})`)}`;
      }
    }
  }
  return output;
}

export function formatResource(resource: MCPResource, options: FormatOptions = {}): string {
  const { format = 'pretty', colors = true } = options;

  if (format === 'json') {
    return JSON.stringify(resource, null, 2);
  }

  if (format === 'yaml') {
    return yaml.stringify(resource);
  }

  const color = colors
    ? chalk
    : {
        bold: (s: string) => s,
        dim: (s: string) => s,
        green: (s: string) => s,
        gray: (s: string) => s,
      };

  let output = `${color.bold(color.green(resource.uri))}`;
  if (resource.name) {
    output += ` (${resource.name})`;
  }
  if (resource.description) {
    output += `\n  ${color.dim(resource.description)}`;
  }
  if (resource.mimeType) {
    output += `\n  ${color.gray('Type:')} ${resource.mimeType}`;
  }
  return output;
}

export function formatPrompt(prompt: MCPPrompt, options: FormatOptions = {}): string {
  const { format = 'pretty', colors = true } = options;

  if (format === 'json') {
    return JSON.stringify(prompt, null, 2);
  }

  if (format === 'yaml') {
    return yaml.stringify(prompt);
  }

  const color = colors
    ? chalk
    : {
        bold: (s: string) => s,
        dim: (s: string) => s,
        magenta: (s: string) => s,
        gray: (s: string) => s,
      };

  let output = `${color.bold(color.magenta(prompt.name))}`;
  if (prompt.description) {
    output += `\n  ${color.dim(prompt.description)}`;
  }
  if (prompt.arguments && prompt.arguments.length > 0) {
    output += `\n  ${color.gray('Arguments:')}`;
    for (const arg of prompt.arguments) {
      const required = arg.required ? '*' : '';
      output += `\n    - ${arg.name}${required}`;
      if (arg.description) {
        output += `: ${color.dim(arg.description)}`;
      }
    }
  }
  return output;
}

export function formatToolResult(result: MCPToolResult, options: FormatOptions = {}): string {
  const { format = 'pretty', colors = true, truncate = true, maxLength = 500 } = options;

  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (format === 'yaml') {
    return yaml.stringify(result);
  }

  const color = colors
    ? chalk
    : {
        red: (s: string) => s,
        green: (s: string) => s,
        dim: (s: string) => s,
      };

  let output = '';

  if (result.isError) {
    output += color.red('Error: ');
  } else {
    output += color.green('Success: ');
  }

  if (result.content) {
    for (const content of result.content) {
      if (content.type === 'text' && content.text) {
        let text = content.text;
        if (truncate && text.length > maxLength) {
          text = text.substring(0, maxLength) + '...';
        }
        output += text;
      }
    }
  }

  return output;
}

export function formatError(error: Error, options: FormatOptions = {}): string {
  const { colors = true } = options;
  const color = colors ? chalk : { red: (s: string) => s, dim: (s: string) => s };

  let output = color.red(`Error: ${error.message}`);
  if (error.stack) {
    output += `\n${color.dim(error.stack)}`;
  }
  return output;
}

export function formatSuccess(message: string, options: FormatOptions = {}): string {
  const { colors = true } = options;
  const color = colors ? chalk : { green: (s: string) => s };
  return color.green(`✓ ${message}`);
}

export function formatWarning(message: string, options: FormatOptions = {}): string {
  const { colors = true } = options;
  const color = colors ? chalk : { yellow: (s: string) => s };
  return color.yellow(`⚠ ${message}`);
}

export function formatInfo(message: string, options: FormatOptions = {}): string {
  const { colors = true } = options;
  const color = colors ? chalk : { blue: (s: string) => s };
  return color.blue(`ℹ ${message}`);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function formatTable(
  headers: string[],
  rows: string[][],
  options: FormatOptions = {}
): string {
  const { colors = true } = options;
  const color = colors ? chalk : { bold: (s: string) => s, dim: (s: string) => s };

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRowWidth);
  });

  // Format header
  let output = color.bold(headers.map((h, i) => h.padEnd(widths[i])).join('  '));
  output += '\n' + color.dim('─'.repeat(widths.reduce((a, b) => a + b + 2, -2)));

  // Format rows
  for (const row of rows) {
    output += '\n' + row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ');
  }

  return output;
}
