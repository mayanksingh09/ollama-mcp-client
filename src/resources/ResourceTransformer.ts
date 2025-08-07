/**
 * Resource Transformer - Content transformation and encoding
 */

import type { ResourceTransformOptions } from '../types/resources.types';
import type { MCPResourceContent } from '../types/mcp.types';

export class ResourceTransformer {
  /**
   * Transform resource content
   */
  async transform(
    content: MCPResourceContent,
    options: ResourceTransformOptions
  ): Promise<unknown> {
    let result: unknown = content.text || content.blob;

    // Apply target format transformation
    if (options.targetFormat) {
      result = await this.convertFormat(result, options.targetFormat);
    }

    // Apply custom transformer
    if (options.transformer) {
      result = options.transformer(result);
    }

    // Apply JSON formatting
    if (options.pretty && typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        result = JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON, skip formatting
      }
    }

    if (options.minify && typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        result = JSON.stringify(parsed);
      } catch {
        // Not JSON, skip minification
      }
    }

    return result;
  }

  /**
   * Convert to target format
   */
  private async convertFormat(
    content: unknown,
    format: 'text' | 'json' | 'base64' | 'hex'
  ): Promise<unknown> {
    switch (format) {
      case 'text':
        return String(content);

      case 'json':
        if (typeof content === 'string') {
          try {
            return JSON.parse(content);
          } catch {
            return content;
          }
        }
        return content;

      case 'base64':
        if (typeof content === 'string') {
          return Buffer.from(content).toString('base64');
        }
        return content;

      case 'hex':
        if (typeof content === 'string') {
          return Buffer.from(content).toString('hex');
        }
        return content;

      default:
        return content;
    }
  }

  /**
   * Aggregate multiple resources
   */
  async aggregate(
    contents: unknown[],
    mode: 'concat' | 'merge' | 'zip',
    options?: { separator?: string; mergeStrategy?: 'shallow' | 'deep' }
  ): Promise<unknown> {
    switch (mode) {
      case 'concat':
        return contents.join(options?.separator || '\n');

      case 'merge':
        if (options?.mergeStrategy === 'deep') {
          return this.deepMerge(...contents);
        }
        return Object.assign({}, ...contents);

      case 'zip':
        return contents.map((content, index) => ({ index, content }));

      default:
        return contents;
    }
  }

  /**
   * Deep merge objects
   */
  private deepMerge(...objects: unknown[]): unknown {
    const result: Record<string, unknown> = {};

    for (const obj of objects) {
      if (typeof obj !== 'object' || obj === null) continue;

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          result[key] = this.deepMerge(result[key] || {}, value);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }
}
