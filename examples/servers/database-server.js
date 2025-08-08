#!/usr/bin/env node
/**
 * Database MCP Server
 * Provides database query and management tools via MCP
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// Mock database for demonstration
const mockDatabase = {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
    { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' }
  ],
  products: [
    { id: 1, name: 'Laptop', price: 999.99, stock: 15 },
    { id: 2, name: 'Mouse', price: 29.99, stock: 50 },
    { id: 3, name: 'Keyboard', price: 79.99, stock: 30 }
  ],
  orders: [
    { id: 1, userId: 1, productId: 1, quantity: 1, date: '2024-01-01' },
    { id: 2, userId: 2, productId: 2, quantity: 2, date: '2024-01-02' }
  ]
};

// Create the server
const server = new Server(
  {
    name: 'database-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Database tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'query_database',
        description: 'Execute a database query',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['users', 'products', 'orders'],
              description: 'Table to query',
            },
            operation: {
              type: 'string',
              enum: ['select', 'count', 'filter'],
              description: 'Query operation',
            },
            conditions: {
              type: 'object',
              description: 'Filter conditions',
            },
            limit: {
              type: 'number',
              description: 'Maximum results',
            },
          },
          required: ['table', 'operation'],
        },
      },
      {
        name: 'insert_record',
        description: 'Insert a new record into database',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['users', 'products', 'orders'],
            },
            data: {
              type: 'object',
              description: 'Record data',
            },
          },
          required: ['table', 'data'],
        },
      },
      {
        name: 'update_record',
        description: 'Update existing record',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['users', 'products', 'orders'],
            },
            id: {
              type: 'number',
              description: 'Record ID',
            },
            data: {
              type: 'object',
              description: 'Fields to update',
            },
          },
          required: ['table', 'id', 'data'],
        },
      },
      {
        name: 'delete_record',
        description: 'Delete a record from database',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['users', 'products', 'orders'],
            },
            id: {
              type: 'number',
              description: 'Record ID',
            },
          },
          required: ['table', 'id'],
        },
      },
      {
        name: 'get_schema',
        description: 'Get database schema information',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name (optional)',
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'query_database': {
      const { table, operation, conditions, limit } = args;
      let results = mockDatabase[table] || [];

      // Apply operation
      switch (operation) {
        case 'select':
          if (conditions) {
            results = results.filter(record => {
              return Object.entries(conditions).every(
                ([key, value]) => record[key] === value
              );
            });
          }
          if (limit) {
            results = results.slice(0, limit);
          }
          break;

        case 'count':
          results = { count: results.length };
          break;

        case 'filter':
          if (conditions) {
            results = results.filter(record => {
              return Object.entries(conditions).some(
                ([key, value]) => {
                  if (typeof value === 'string' && value.includes('*')) {
                    const pattern = value.replace(/\*/g, '.*');
                    return new RegExp(pattern).test(record[key]);
                  }
                  return record[key] === value;
                }
              );
            });
          }
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }

    case 'insert_record': {
      const { table, data } = args;
      const records = mockDatabase[table];
      
      if (!records) {
        return {
          content: [{ type: 'text', text: `Table ${table} not found` }],
          isError: true,
        };
      }

      const newRecord = {
        id: records.length + 1,
        ...data,
      };
      records.push(newRecord);

      return {
        content: [
          {
            type: 'text',
            text: `Inserted record with ID ${newRecord.id}:\n${JSON.stringify(newRecord, null, 2)}`,
          },
        ],
      };
    }

    case 'update_record': {
      const { table, id, data } = args;
      const records = mockDatabase[table];
      
      if (!records) {
        return {
          content: [{ type: 'text', text: `Table ${table} not found` }],
          isError: true,
        };
      }

      const record = records.find(r => r.id === id);
      if (!record) {
        return {
          content: [{ type: 'text', text: `Record with ID ${id} not found` }],
          isError: true,
        };
      }

      Object.assign(record, data);

      return {
        content: [
          {
            type: 'text',
            text: `Updated record:\n${JSON.stringify(record, null, 2)}`,
          },
        ],
      };
    }

    case 'delete_record': {
      const { table, id } = args;
      const records = mockDatabase[table];
      
      if (!records) {
        return {
          content: [{ type: 'text', text: `Table ${table} not found` }],
          isError: true,
        };
      }

      const index = records.findIndex(r => r.id === id);
      if (index === -1) {
        return {
          content: [{ type: 'text', text: `Record with ID ${id} not found` }],
          isError: true,
        };
      }

      records.splice(index, 1);

      return {
        content: [
          {
            type: 'text',
            text: `Deleted record with ID ${id}`,
          },
        ],
      };
    }

    case 'get_schema': {
      const { table } = args || {};
      
      if (table) {
        const records = mockDatabase[table];
        if (!records || records.length === 0) {
          return {
            content: [{ type: 'text', text: `Table ${table} is empty or not found` }],
          };
        }

        const schema = Object.keys(records[0]);
        return {
          content: [
            {
              type: 'text',
              text: `Schema for ${table}:\n${schema.join(', ')}`,
            },
          ],
        };
      }

      // Return all tables
      const tables = Object.keys(mockDatabase);
      return {
        content: [
          {
            type: 'text',
            text: `Available tables:\n${tables.join('\n')}`,
          },
        ],
      };
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

// Database resources
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [
      {
        uri: 'db://schema',
        name: 'Database Schema',
        description: 'Complete database schema',
        mimeType: 'application/json',
      },
      {
        uri: 'db://stats',
        name: 'Database Statistics',
        description: 'Database usage statistics',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reading
server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'db://schema':
      const schema = {};
      for (const [table, records] of Object.entries(mockDatabase)) {
        if (records.length > 0) {
          schema[table] = Object.keys(records[0]);
        }
      }
      
      return {
        contents: [
          {
            uri: 'db://schema',
            mimeType: 'application/json',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };

    case 'db://stats':
      const stats = {};
      for (const [table, records] of Object.entries(mockDatabase)) {
        stats[table] = {
          count: records.length,
          lastId: records.length > 0 ? Math.max(...records.map(r => r.id)) : 0,
        };
      }
      
      return {
        contents: [
          {
            uri: 'db://stats',
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
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
  
  console.error('Database MCP server started');
  console.error(`Tables: ${Object.keys(mockDatabase).join(', ')}`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});