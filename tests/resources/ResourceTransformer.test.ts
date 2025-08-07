/**
 * ResourceTransformer unit tests
 */

import { ResourceTransformer } from '../../src/resources/ResourceTransformer';
import type { MCPResourceContent } from '../../src/types/mcp.types';

describe('ResourceTransformer', () => {
  let transformer: ResourceTransformer;

  beforeEach(() => {
    transformer = new ResourceTransformer();
  });

  describe('transform', () => {
    it('should transform text resources to uppercase', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'hello world',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        format: 'uppercase',
      });

      expect(transformed.text).toBe('HELLO WORLD');
    });

    it('should transform text resources to lowercase', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'HELLO WORLD',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        format: 'lowercase',
      });

      expect(transformed.text).toBe('hello world');
    });

    it('should transform JSON resources to formatted string', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///data.json',
        text: '{"name":"John","age":30,"city":"New York"}',
        mimeType: 'application/json',
      };

      const transformed = await transformer.transform(resource, {
        format: 'json',
        jsonIndent: 2,
      });

      const expected = JSON.stringify({ name: 'John', age: 30, city: 'New York' }, null, 2);
      expect(transformed.text).toBe(expected);
    });

    it('should minify JSON when requested', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///data.json',
        text: '{\n  "name": "John",\n  "age": 30\n}',
        mimeType: 'application/json',
      };

      const transformed = await transformer.transform(resource, {
        format: 'json-minify',
      });

      expect(transformed.text).toBe('{"name":"John","age":30}');
    });

    it('should encode resources to base64', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Hello World',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        format: 'base64',
      });

      const expected = Buffer.from('Hello World').toString('base64');
      expect(transformed.blob).toBe(expected);
      expect(transformed.text).toBeUndefined();
    });

    it('should decode base64 resources', async () => {
      const encoded = Buffer.from('Hello World').toString('base64');
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        blob: encoded,
        mimeType: 'application/octet-stream',
      };

      const transformed = await transformer.transform(resource, {
        format: 'base64-decode',
      });

      expect(transformed.text).toBe('Hello World');
      expect(transformed.blob).toBeUndefined();
    });

    it('should extract text from HTML', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///page.html',
        text: '<html><body><h1>Title</h1><p>Content</p></body></html>',
        mimeType: 'text/html',
      };

      const transformed = await transformer.transform(resource, {
        format: 'text',
      });

      expect(transformed.text).toContain('Title');
      expect(transformed.text).toContain('Content');
      expect(transformed.text).not.toContain('<h1>');
      expect(transformed.text).not.toContain('<p>');
    });

    it('should handle markdown transformation', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///doc.md',
        text: '# Header\n\nParagraph with **bold** text.',
        mimeType: 'text/markdown',
      };

      const transformed = await transformer.transform(resource, {
        format: 'text',
      });

      expect(transformed.text).toContain('Header');
      expect(transformed.text).toContain('Paragraph with bold text');
    });

    it('should truncate text when max length is specified', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'This is a very long text that should be truncated',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        maxLength: 20,
      });

      expect(transformed.text?.length).toBeLessThanOrEqual(23); // 20 + '...'
      expect(transformed.text).toContain('...');
    });

    it('should extract lines from text', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        extractLines: { start: 2, end: 4 },
      });

      expect(transformed.text).toBe('Line 2\nLine 3\nLine 4');
    });

    it('should apply regex replacements', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'The phone number is 123-456-7890',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        regex: {
          pattern: '\\d{3}-\\d{3}-\\d{4}',
          replacement: 'XXX-XXX-XXXX',
        },
      });

      expect(transformed.text).toBe('The phone number is XXX-XXX-XXXX');
    });

    it('should compress text using gzip', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'This is some text that will be compressed',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        compress: 'gzip',
      });

      expect(transformed.blob).toBeDefined();
      expect(transformed.text).toBeUndefined();
      expect(transformed.metadata?.compressed).toBe(true);
      expect(transformed.metadata?.compressionType).toBe('gzip');
    });

    it('should decompress gzipped content', async () => {
      const originalText = 'This is the original text';
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: originalText,
        mimeType: 'text/plain',
      };

      // First compress
      const compressed = await transformer.transform(resource, {
        compress: 'gzip',
      });

      // Then decompress
      const decompressed = await transformer.transform(compressed, {
        decompress: 'gzip',
      });

      expect(decompressed.text).toBe(originalText);
    });

    it('should handle CSV to JSON transformation', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///data.csv',
        text: 'name,age,city\nJohn,30,NYC\nJane,25,LA',
        mimeType: 'text/csv',
      };

      const transformed = await transformer.transform(resource, {
        format: 'json',
      });

      const parsed = JSON.parse(transformed.text || '[]');
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ name: 'John', age: '30', city: 'NYC' });
      expect(parsed[1]).toEqual({ name: 'Jane', age: '25', city: 'LA' });
    });

    it('should handle XML to JSON transformation', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///data.xml',
        text: '<root><item><name>John</name><age>30</age></item></root>',
        mimeType: 'application/xml',
      };

      const transformed = await transformer.transform(resource, {
        format: 'json',
      });

      const parsed = JSON.parse(transformed.text || '{}');
      expect(parsed.root).toBeDefined();
      expect(parsed.root.item).toBeDefined();
      expect(parsed.root.item.name).toBe('John');
      expect(parsed.root.item.age).toBe('30');
    });

    it('should return original resource when no options provided', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'Original content',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource);

      expect(transformed).toEqual(resource);
    });

    it('should handle transformation errors gracefully', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///bad.json',
        text: 'not valid json',
        mimeType: 'application/json',
      };

      const transformed = await transformer.transform(resource, {
        format: 'json',
      });

      // Should return original on error
      expect(transformed.text).toBe('not valid json');
      expect(transformed.metadata?.transformError).toBeDefined();
    });
  });

  describe('chain', () => {
    it('should chain multiple transformations', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'hello world',
        mimeType: 'text/plain',
      };

      const transformations = [
        { format: 'uppercase' as const },
        { regex: { pattern: 'WORLD', replacement: 'UNIVERSE' } },
      ];

      const transformed = await transformer.chain(resource, transformations);

      expect(transformed.text).toBe('HELLO UNIVERSE');
    });

    it('should stop chain on error when configured', async () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'test',
        mimeType: 'text/plain',
      };

      const transformations = [
        { format: 'json' as const }, // This will fail
        { format: 'uppercase' as const },
      ];

      const transformed = await transformer.chain(
        resource,
        transformations,
        true // stopOnError
      );

      // Should return after first error
      expect(transformed.text).toBe('test');
      expect(transformed.metadata?.transformError).toBeDefined();
    });
  });

  describe('registerCustomTransform', () => {
    it('should register and use custom transformation', async () => {
      transformer.registerCustomTransform('reverse', async (resource) => {
        return {
          ...resource,
          text: resource.text?.split('').reverse().join(''),
        };
      });

      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'hello',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        custom: 'reverse',
      });

      expect(transformed.text).toBe('olleh');
    });

    it('should override existing custom transforms', async () => {
      transformer.registerCustomTransform('double', async (resource) => {
        return {
          ...resource,
          text: resource.text ? resource.text + resource.text : undefined,
        };
      });

      transformer.registerCustomTransform('double', async (resource) => {
        return {
          ...resource,
          text: resource.text ? resource.text + '!' : undefined,
        };
      });

      const resource: MCPResourceContent = {
        uri: 'file:///test.txt',
        text: 'test',
        mimeType: 'text/plain',
      };

      const transformed = await transformer.transform(resource, {
        custom: 'double',
      });

      expect(transformed.text).toBe('test!');
    });
  });

  describe('batch', () => {
    it('should transform multiple resources in batch', async () => {
      const resources: MCPResourceContent[] = [
        { uri: 'file:///1.txt', text: 'hello' },
        { uri: 'file:///2.txt', text: 'world' },
      ];

      const results = await transformer.batch(resources, {
        format: 'uppercase',
      });

      expect(results).toHaveLength(2);
      expect(results[0].text).toBe('HELLO');
      expect(results[1].text).toBe('WORLD');
    });

    it('should handle batch errors gracefully', async () => {
      const resources: MCPResourceContent[] = [
        { uri: 'file:///1.txt', text: 'valid' },
        { uri: 'file:///2.json', text: 'invalid json', mimeType: 'application/json' },
      ];

      const results = await transformer.batch(resources, {
        format: 'json',
      });

      expect(results).toHaveLength(2);
      expect(results[0].text).toBeDefined();
      expect(results[1].metadata?.transformError).toBeDefined();
    });
  });

  describe('getSupportedFormats', () => {
    it('should return list of supported formats', () => {
      const formats = transformer.getSupportedFormats();

      expect(formats).toContain('uppercase');
      expect(formats).toContain('lowercase');
      expect(formats).toContain('json');
      expect(formats).toContain('base64');
      expect(formats).toContain('text');
      expect(Array.isArray(formats)).toBe(true);
    });
  });

  describe('canTransform', () => {
    it('should check if transformation is possible', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.json',
        text: '{"valid": "json"}',
        mimeType: 'application/json',
      };

      expect(transformer.canTransform(resource, { format: 'json' })).toBe(true);
      expect(transformer.canTransform(resource, { format: 'uppercase' })).toBe(true);
    });

    it('should detect invalid transformations', () => {
      const resource: MCPResourceContent = {
        uri: 'file:///test.bin',
        blob: 'binarydata',
        mimeType: 'application/octet-stream',
      };

      expect(transformer.canTransform(resource, { format: 'uppercase' })).toBe(false);
    });
  });
});
