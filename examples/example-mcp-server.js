#!/usr/bin/env node
/**
 * Example MCP server for testing
 * This is a simple MCP server that provides basic tools and resources
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const fs = require('fs').promises;
const path = require('path');

// Create the server
const server = new Server(
  {
    name: 'example-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Add example tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'get_current_time',
        description: 'Get the current date and time',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone (e.g., UTC, America/New_York)',
            },
          },
        },
      },
      {
        name: 'calculate',
        description: 'Perform basic mathematical calculations',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to evaluate',
            },
          },
          required: ['expression'],
        },
      },
      {
        name: 'read_file',
        description: 'Read contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file',
            },
          },
          required: ['path'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'get_current_time': {
      const timezone = args?.timezone || 'UTC';
      const date = new Date();
      const options = {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      };
      const formatted = date.toLocaleString('en-US', options);
      
      return {
        content: [
          {
            type: 'text',
            text: `Current time in ${timezone}: ${formatted}`,
          },
        ],
      };
    }

    case 'calculate': {
      const expression = args?.expression;
      if (!expression) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Expression is required',
            },
          ],
          isError: true,
        };
      }

      try {
        // Simple eval for demo - in production use a proper math parser
        const result = eval(expression);
        return {
          content: [
            {
              type: 'text',
              text: `${expression} = ${result}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error evaluating expression: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case 'read_file': {
      const filePath = args?.path;
      if (!filePath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: File path is required',
            },
          ],
          isError: true,
        };
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading file: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// Add example resources
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [
      {
        uri: 'file:///example/readme.md',
        name: 'README',
        description: 'Project readme file',
        mimeType: 'text/markdown',
      },
      {
        uri: 'file:///example/config.json',
        name: 'Configuration',
        description: 'Server configuration',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reading
server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'file:///example/readme.md':
      return {
        contents: [
          {
            uri: 'file:///example/readme.md',
            mimeType: 'text/markdown',
            text: '# Example MCP Server\n\nThis is an example MCP server for testing.\n\n## Features\n- Tools for calculations and file reading\n- Example resources\n- Sample prompts',
          },
        ],
      };

    case 'file:///example/config.json':
      return {
        contents: [
          {
            uri: 'file:///example/config.json',
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                name: 'example-mcp-server',
                version: '1.0.0',
                debug: true,
              },
              null,
              2
            ),
          },
        ],
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// Add example prompts
server.setRequestHandler('prompts/list', async () => {
  return {
    prompts: [
      {
        name: 'summarize',
        description: 'Summarize content',
        arguments: [
          {
            name: 'content',
            description: 'Content to summarize',
            required: true,
          },
        ],
      },
      {
        name: 'translate',
        description: 'Translate text',
        arguments: [
          {
            name: 'text',
            description: 'Text to translate',
            required: true,
          },
          {
            name: 'target_language',
            description: 'Target language',
            required: true,
          },
        ],
      },
    ],
  };
});

// Handle prompt retrieval
server.setRequestHandler('prompts/get', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'summarize':
      return {
        messages: [
          {
            role: 'user',
            content: `Please summarize the following content:\n\n${args?.content || '[No content provided]'}`,
          },
        ],
      };

    case 'translate':
      return {
        messages: [
          {
            role: 'user',
            content: `Please translate the following text to ${args?.target_language || 'English'}:\n\n${args?.text || '[No text provided]'}`,
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr so it doesn't interfere with protocol communication
  console.error('Example MCP server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});