import type { MCPToolResult } from '../types/mcp.types';
import type { InjectionOptions } from './types';

export class ResultInjector {
  private options: Required<InjectionOptions>;

  constructor(options: InjectionOptions = {}) {
    this.options = {
      format: options.format || 'text',
      includeMetadata: options.includeMetadata !== false,
      truncateLength: options.truncateLength || 1000,
      preserveStructure: options.preserveStructure !== false,
    };
  }

  injectResult(result: MCPToolResult, toolName: string, context?: string): string {
    const formatted = this.formatResult(result, toolName);

    if (context) {
      return this.mergeWithContext(formatted, context);
    }

    return formatted;
  }

  injectBatch(
    results: Array<{ toolName: string; result: MCPToolResult }>,
    context?: string
  ): string {
    const formattedResults = results.map(({ toolName, result }) =>
      this.formatResult(result, toolName)
    );

    const combined = this.combineResults(formattedResults);

    if (context) {
      return this.mergeWithContext(combined, context);
    }

    return combined;
  }

  private formatResult(result: MCPToolResult, toolName: string): string {
    if (result.isError) {
      return this.formatError(result, toolName);
    }

    switch (this.options.format) {
      case 'json':
        return this.formatAsJson(result, toolName);
      case 'xml':
        return this.formatAsXml(result, toolName);
      case 'text':
      default:
        return this.formatAsText(result, toolName);
    }
  }

  private formatAsText(result: MCPToolResult, toolName: string): string {
    const parts: string[] = [];

    if (this.options.includeMetadata) {
      parts.push(`[Tool: ${toolName}]`);
    }

    if (result.content && result.content.length > 0) {
      for (const content of result.content) {
        if (content.type === 'text') {
          let text = content.text;
          if (this.options.truncateLength > 0 && text.length > this.options.truncateLength) {
            text = text.substring(0, this.options.truncateLength) + '...';
          }
          parts.push(text);
        } else if (content.type === 'image') {
          parts.push(`[Image: ${content.mimeType || 'image/png'}]`);
        } else if (content.type === 'resource') {
          const resource = content.resource;
          parts.push(`[Resource: ${resource.uri}]`);
          if (resource.text) {
            let text = resource.text;
            if (this.options.truncateLength > 0 && text.length > this.options.truncateLength) {
              text = text.substring(0, this.options.truncateLength) + '...';
            }
            parts.push(text);
          }
        }
      }
    }

    if (this.options.includeMetadata && result.metadata) {
      parts.push(`[Metadata: ${JSON.stringify(result.metadata)}]`);
    }

    return parts.join('\n');
  }

  private formatAsJson(result: MCPToolResult, toolName: string): string {
    const output: Record<string, unknown> = {
      tool: toolName,
      success: !result.isError,
    };

    if (result.content && result.content.length > 0) {
      output.content = result.content.map((content) => {
        if (content.type === 'text') {
          let text = content.text || '';
          if (this.options.truncateLength > 0 && text.length > this.options.truncateLength) {
            text = text.substring(0, this.options.truncateLength) + '...';
          }
          return { type: 'text', text };
        } else if (content.type === 'image') {
          return {
            type: 'image',
            mimeType: content.mimeType,
            dataLength: content.data?.length,
          };
        } else if (content.type === 'resource') {
          return {
            type: 'resource',
            uri: content.resource.uri,
            text: content.resource.text?.substring(0, this.options.truncateLength),
          };
        }
        return content;
      });
    }

    if (this.options.includeMetadata && result.metadata) {
      output.metadata = result.metadata;
    }

    return JSON.stringify(output, null, 2);
  }

  private formatAsXml(result: MCPToolResult, toolName: string): string {
    const parts: string[] = ['<tool_result>'];

    parts.push(`  <tool>${this.escapeXml(toolName)}</tool>`);
    parts.push(`  <success>${!result.isError}</success>`);

    if (result.content && result.content.length > 0) {
      parts.push('  <content>');
      for (const content of result.content) {
        if (content.type === 'text') {
          let text = content.text;
          if (this.options.truncateLength > 0 && text.length > this.options.truncateLength) {
            text = text.substring(0, this.options.truncateLength) + '...';
          }
          parts.push(`    <text>${this.escapeXml(text)}</text>`);
        } else if (content.type === 'image') {
          parts.push(`    <image mimeType="${content.mimeType || 'image/png'}" />`);
        } else if (content.type === 'resource') {
          parts.push(`    <resource uri="${this.escapeXml(content.resource.uri)}">`);
          if (content.resource.text) {
            let text = content.resource.text;
            if (this.options.truncateLength > 0 && text.length > this.options.truncateLength) {
              text = text.substring(0, this.options.truncateLength) + '...';
            }
            parts.push(`      <text>${this.escapeXml(text)}</text>`);
          }
          parts.push('    </resource>');
        }
      }
      parts.push('  </content>');
    }

    if (this.options.includeMetadata && result.metadata) {
      parts.push('  <metadata>');
      for (const [key, value] of Object.entries(result.metadata)) {
        parts.push(`    <${key}>${this.escapeXml(String(value))}</${key}>`);
      }
      parts.push('  </metadata>');
    }

    parts.push('</tool_result>');
    return parts.join('\n');
  }

  private formatError(result: MCPToolResult, toolName: string): string {
    const errorContent = result.content?.[0];
    const errorText =
      errorContent && errorContent.type === 'text' ? errorContent.text : 'Unknown error';

    switch (this.options.format) {
      case 'json':
        return JSON.stringify(
          {
            tool: toolName,
            success: false,
            error: errorText,
            metadata: this.options.includeMetadata ? result.metadata : undefined,
          },
          null,
          2
        );

      case 'xml':
        return `<tool_result>
  <tool>${this.escapeXml(toolName)}</tool>
  <success>false</success>
  <error>${this.escapeXml(errorText || '')}</error>
</tool_result>`;

      case 'text':
      default:
        return `[Tool Error: ${toolName}]\n${errorText}`;
    }
  }

  private mergeWithContext(result: string, context: string): string {
    if (this.options.preserveStructure) {
      return `${context}\n\nTool Results:\n${result}`;
    }

    const contextLines = context.split('\n');
    const resultLines = result.split('\n');

    const insertIndex = this.findBestInsertionPoint(contextLines);

    const merged = [
      ...contextLines.slice(0, insertIndex),
      '',
      '--- Tool Results ---',
      ...resultLines,
      '--- End Results ---',
      '',
      ...contextLines.slice(insertIndex),
    ];

    return merged.join('\n');
  }

  private findBestInsertionPoint(lines: string[]): number {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].toLowerCase();
      if (
        line.includes('thinking') ||
        line.includes('analyzing') ||
        line.includes('let me') ||
        line.includes('i will') ||
        line.includes('i need to')
      ) {
        return i + 1;
      }
    }

    return lines.length;
  }

  private combineResults(results: string[]): string {
    if (results.length === 0) {
      return '';
    }

    if (results.length === 1) {
      return results[0];
    }

    switch (this.options.format) {
      case 'json':
        return this.combineJsonResults(results);
      case 'xml':
        return this.combineXmlResults(results);
      case 'text':
      default:
        return results.join('\n\n');
    }
  }

  private combineJsonResults(results: string[]): string {
    const parsed = results.map((r) => {
      try {
        return JSON.parse(r);
      } catch {
        return { raw: r };
      }
    });

    return JSON.stringify({ results: parsed }, null, 2);
  }

  private combineXmlResults(results: string[]): string {
    return `<tool_results>\n${results.map((r) => '  ' + r.replace(/\n/g, '\n  ')).join('\n')}\n</tool_results>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  setOptions(options: Partial<InjectionOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  createStreamingInjector(): StreamingResultInjector {
    return new StreamingResultInjector(this.options);
  }
}

export class StreamingResultInjector {
  private buffer: string[] = [];
  private currentTool: string | null = null;

  constructor(private options: Required<InjectionOptions>) {}

  addChunk(chunk: string, toolName?: string): void {
    if (toolName && toolName !== this.currentTool) {
      if (this.currentTool) {
        this.buffer.push('\n');
      }
      if (this.options.includeMetadata) {
        this.buffer.push(`[Streaming from: ${toolName}]\n`);
      }
      this.currentTool = toolName;
    }

    this.buffer.push(chunk);
  }

  getPartialResult(): string {
    return this.buffer.join('');
  }

  finalize(): string {
    const result = this.buffer.join('');
    this.buffer = [];
    this.currentTool = null;
    return result;
  }

  reset(): void {
    this.buffer = [];
    this.currentTool = null;
  }
}
