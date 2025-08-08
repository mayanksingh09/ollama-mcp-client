#!/usr/bin/env node

const { OllamaMCPClient } = require('./dist/index.js');
const { ResponseParser } = require('./dist/bridge/ResponseParser.js');

async function testParsing() {
  console.log('Testing Tool Call Parsing\n');
  
  const parser = new ResponseParser();
  
  // Mock tools similar to what filesystem server provides
  const tools = [
    {
      name: 'read_file',
      description: 'Read file contents',
      inputSchema: {
        properties: {
          path: { type: 'string' }
        },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'Write file contents',
      inputSchema: {
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'query',
      description: 'Run a SQL query',
      inputSchema: {
        properties: {
          sql: { type: 'string' }
        },
        required: ['sql']
      }
    }
  ];

  // Test cases
  const testCases = [
    {
      name: 'Explicit TOOL_CALL format',
      content: 'TOOL_CALL: read_file\nARGUMENTS: {"path": "/tmp/test.txt"}'
    },
    {
      name: 'JSON only (matching schema)',
      content: '{"path": "/tmp/test.txt"}'
    },
    {
      name: 'SQL query JSON',
      content: '{"sql": "SELECT COUNT(*) FROM experts"}'
    },
    {
      name: 'JSON with markdown',
      content: '```json\n{"path": "/tmp/file.txt"}\n```'
    },
    {
      name: 'Natural language with tool',
      content: 'I need to read_file with path /tmp/test.txt to see the contents'
    },
    {
      name: 'XML format',
      content: '<tool_call>\n<name>write_file</name>\n<arguments>{"path": "/tmp/out.txt", "content": "hello"}</arguments>\n</tool_call>'
    }
  ];

  console.log('Testing ResponseParser:\n');
  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log(`Input: ${testCase.content.replace(/\n/g, '\\n')}`);
    
    try {
      const parsed = parser.parse(testCase.content, tools);
      if (parsed.length > 0) {
        console.log('✓ Parsed successfully:');
        parsed.forEach(call => {
          console.log(`  Tool: ${call.toolName}, Args: ${JSON.stringify(call.arguments)}`);
        });
      } else {
        console.log('✗ No tool calls detected');
      }
    } catch (error) {
      console.log(`✗ Error: ${error.message}`);
    }
    console.log();
  }

  // Now test the enhanced parseToolCalls method
  console.log('\nTesting OllamaMCPClient parseToolCalls method:\n');
  
  const client = new OllamaMCPClient({
    logging: { level: 'error' }
  });
  
  // Connect to filesystem server to get real tools
  await client.connectToServer({
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
  });
  
  // Access the private method through reflection (for testing only)
  const parseToolCalls = client['parseToolCalls'].bind(client);
  
  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log(`Input: ${testCase.content.replace(/\n/g, '\\n')}`);
    
    try {
      const parsed = await parseToolCalls(testCase.content);
      if (parsed.length > 0) {
        console.log('✓ Parsed successfully:');
        parsed.forEach(call => {
          console.log(`  Tool: ${call.name}, Args: ${JSON.stringify(call.arguments)}`);
        });
      } else {
        console.log('✗ No tool calls detected');
      }
    } catch (error) {
      console.log(`✗ Error: ${error.message}`);
    }
    console.log();
  }
}

testParsing().catch(console.error);