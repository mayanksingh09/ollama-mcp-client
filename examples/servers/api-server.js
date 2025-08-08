#!/usr/bin/env node
/**
 * API Integration MCP Server
 * Provides tools for interacting with REST APIs
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const https = require('https');
const http = require('http');

// Create the server
const server = new Server(
  {
    name: 'api-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.url.startsWith('https') ? https : http;
    const url = new URL(options.url);
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = protocol.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body,
          });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

// API tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'http_request',
        description: 'Make an HTTP request to any API',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              description: 'HTTP method',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
            body: {
              type: ['object', 'string'],
              description: 'Request body',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'fetch_json',
        description: 'Fetch and parse JSON from an API',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The API endpoint URL',
            },
            headers: {
              type: 'object',
              description: 'Optional headers',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'test_api_endpoint',
        description: 'Test if an API endpoint is accessible',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The endpoint to test',
            },
            expectedStatus: {
              type: 'number',
              description: 'Expected status code (default: 200)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'mock_api_response',
        description: 'Generate a mock API response for testing',
        inputSchema: {
          type: 'object',
          properties: {
            endpoint: {
              type: 'string',
              description: 'Endpoint pattern to mock',
            },
            status: {
              type: 'number',
              description: 'Response status code',
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
          },
          required: ['endpoint', 'data'],
        },
      },
      {
        name: 'weather_api',
        description: 'Get weather information (mock)',
        inputSchema: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'City name',
            },
          },
          required: ['city'],
        },
      },
      {
        name: 'github_api',
        description: 'Interact with GitHub API',
        inputSchema: {
          type: 'object',
          properties: {
            endpoint: {
              type: 'string',
              description: 'GitHub API endpoint (e.g., /repos/owner/repo)',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
            },
            token: {
              type: 'string',
              description: 'GitHub personal access token (optional)',
            },
          },
          required: ['endpoint'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'http_request': {
      try {
        const response = await makeRequest({
          url: args.url,
          method: args.method || 'GET',
          headers: args.headers || {},
        }, args.body);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: response.status,
                headers: response.headers,
                body: response.body,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Request failed: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case 'fetch_json': {
      try {
        const response = await makeRequest({
          url: args.url,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            ...args.headers,
          },
        });

        const json = JSON.parse(response.body);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(json, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch JSON: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case 'test_api_endpoint': {
      try {
        const response = await makeRequest({
          url: args.url,
          method: 'HEAD',
        });

        const expectedStatus = args.expectedStatus || 200;
        const success = response.status === expectedStatus;

        return {
          content: [
            {
              type: 'text',
              text: `Endpoint ${args.url}:\nStatus: ${response.status}\nExpected: ${expectedStatus}\nResult: ${success ? 'PASS' : 'FAIL'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Endpoint test failed: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case 'mock_api_response': {
      const mockResponse = {
        endpoint: args.endpoint,
        status: args.status || 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Mock-Server': 'true',
        },
        data: args.data,
      };

      return {
        content: [
          {
            type: 'text',
            text: `Mock response for ${args.endpoint}:\n${JSON.stringify(mockResponse, null, 2)}`,
          },
        ],
      };
    }

    case 'weather_api': {
      // Mock weather data
      const weatherData = {
        city: args.city,
        temperature: Math.floor(Math.random() * 30) + 10,
        conditions: ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 60) + 40,
        windSpeed: Math.floor(Math.random() * 20) + 5,
        forecast: [
          { day: 'Tomorrow', high: 25, low: 15, conditions: 'Sunny' },
          { day: 'Day After', high: 22, low: 14, conditions: 'Cloudy' },
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(weatherData, null, 2),
          },
        ],
      };
    }

    case 'github_api': {
      try {
        const headers = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MCP-Server',
        };

        if (args.token) {
          headers['Authorization'] = `token ${args.token}`;
        }

        const response = await makeRequest({
          url: `https://api.github.com${args.endpoint}`,
          method: args.method || 'GET',
          headers: headers,
        });

        const data = JSON.parse(response.body);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `GitHub API request failed: ${error.message}`,
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

// API resources
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [
      {
        uri: 'api://endpoints',
        name: 'API Endpoints',
        description: 'List of available API endpoints',
        mimeType: 'application/json',
      },
      {
        uri: 'api://status',
        name: 'API Status',
        description: 'Current API server status',
        mimeType: 'application/json',
      },
      {
        uri: 'api://examples',
        name: 'API Examples',
        description: 'Example API requests and responses',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reading
server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'api://endpoints':
      return {
        contents: [
          {
            uri: 'api://endpoints',
            mimeType: 'application/json',
            text: JSON.stringify({
              endpoints: [
                {
                  name: 'JSONPlaceholder',
                  url: 'https://jsonplaceholder.typicode.com',
                  description: 'Fake REST API for testing',
                },
                {
                  name: 'GitHub API',
                  url: 'https://api.github.com',
                  description: 'GitHub REST API v3',
                },
                {
                  name: 'OpenWeather',
                  url: 'https://api.openweathermap.org',
                  description: 'Weather data API',
                },
              ],
            }, null, 2),
          },
        ],
      };

    case 'api://status':
      return {
        contents: [
          {
            uri: 'api://status',
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'operational',
              uptime: process.uptime(),
              timestamp: new Date().toISOString(),
              capabilities: ['http', 'https', 'json', 'mock'],
            }, null, 2),
          },
        ],
      };

    case 'api://examples':
      return {
        contents: [
          {
            uri: 'api://examples',
            mimeType: 'application/json',
            text: JSON.stringify({
              examples: [
                {
                  tool: 'fetch_json',
                  args: {
                    url: 'https://jsonplaceholder.typicode.com/posts/1',
                  },
                },
                {
                  tool: 'http_request',
                  args: {
                    url: 'https://api.github.com/users/github',
                    method: 'GET',
                    headers: {
                      'Accept': 'application/json',
                    },
                  },
                },
                {
                  tool: 'weather_api',
                  args: {
                    city: 'London',
                  },
                },
              ],
            }, null, 2),
          },
        ],
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('API Integration MCP server started');
  console.error('Ready to handle API requests');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});