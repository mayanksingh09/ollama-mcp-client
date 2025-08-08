import type { MCPTool } from '../../src/types/mcp.types';

export const calculatorTool: MCPTool = {
  name: 'calculator',
  description: 'Perform arithmetic calculations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
        description: 'The arithmetic operation to perform',
      },
      a: {
        type: 'number',
        description: 'First operand',
      },
      b: {
        type: 'number',
        description: 'Second operand',
      },
    },
    required: ['operation', 'a', 'b'],
  },
};

export const searchTool: MCPTool = {
  name: 'search',
  description: 'Search for information in a database',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results',
        default: 10,
      },
      filters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' },
        },
      },
    },
    required: ['query'],
  },
};

export const weatherTool: MCPTool = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or coordinates',
      },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit', 'kelvin'],
        default: 'celsius',
      },
      detailed: {
        type: 'boolean',
        description: 'Include detailed forecast',
        default: false,
      },
    },
    required: ['location'],
  },
};

export const fileTool: MCPTool = {
  name: 'file_operations',
  description: 'Perform file system operations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['read', 'write', 'delete', 'list'],
      },
      path: {
        type: 'string',
        description: 'File or directory path',
      },
      content: {
        type: 'string',
        description: 'Content for write operations',
      },
      encoding: {
        type: 'string',
        default: 'utf-8',
      },
    },
    required: ['operation', 'path'],
  },
};

export const emailTool: MCPTool = {
  name: 'send_email',
  description: 'Send an email message',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'Recipient email addresses',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      body: {
        type: 'string',
        description: 'Email body content',
      },
      cc: {
        type: 'array',
        items: { type: 'string', format: 'email' },
        description: 'CC recipients',
      },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
            contentType: { type: 'string' },
          },
          required: ['filename', 'content'],
        },
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

export const databaseTool: MCPTool = {
  name: 'database_query',
  description: 'Execute database queries',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL query to execute',
      },
      params: {
        type: 'array',
        items: {
          oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
        },
        description: 'Query parameters',
      },
      database: {
        type: 'string',
        description: 'Database name',
        default: 'default',
      },
    },
    required: ['query'],
  },
};

export const httpRequestTool: MCPTool = {
  name: 'http_request',
  description: 'Make HTTP requests',
  inputSchema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      url: {
        type: 'string',
        format: 'uri',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
      body: {
        type: 'string',
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 30000,
      },
    },
    required: ['method', 'url'],
  },
};

export const complexNestedTool: MCPTool = {
  name: 'complex_operation',
  description: 'A tool with complex nested schema',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['simple', 'advanced', 'expert'],
          },
          options: {
            type: 'object',
            properties: {
              verbose: { type: 'boolean' },
              retryCount: { type: 'number', minimum: 0, maximum: 10 },
              timeout: { type: 'number' },
            },
            required: ['verbose'],
          },
        },
        required: ['mode', 'options'],
      },
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            value: {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                {
                  type: 'object',
                  properties: {
                    nested: { type: 'string' },
                  },
                },
              ],
            },
          },
          required: ['id', 'value'],
        },
        minItems: 1,
      },
    },
    required: ['config', 'data'],
  },
};

export const allTools: MCPTool[] = [
  calculatorTool,
  searchTool,
  weatherTool,
  fileTool,
  emailTool,
  databaseTool,
  httpRequestTool,
  complexNestedTool,
];

export function getToolByName(name: string): MCPTool | undefined {
  return allTools.find((tool) => tool.name === name);
}

export function getToolsByCategory(category: string): MCPTool[] {
  const categories: Record<string, string[]> = {
    math: ['calculator'],
    data: ['search', 'database_query'],
    communication: ['send_email', 'http_request'],
    filesystem: ['file_operations'],
    utility: ['get_weather', 'complex_operation'],
  };

  const toolNames = categories[category] || [];
  return allTools.filter((tool) => toolNames.includes(tool.name));
}
