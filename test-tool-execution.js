#!/usr/bin/env node

const { OllamaMCPClient } = require('./dist/index.js');

async function testToolExecution() {
  console.log('Testing Ollama MCP Client Tool Execution\n');
  
  // Create client with default config
  const client = new OllamaMCPClient({
    ollama: {
      model: 'gpt-oss:20b',
      baseURL: 'http://localhost:11434'
    },
    logging: {
      level: 'debug'
    }
  });

  try {
    // Connect to filesystem MCP server
    console.log('Connecting to filesystem MCP server...');
    await client.connectToServer({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
    });
    
    console.log('Connected successfully!\n');

    // List available tools
    const tools = await client.listTools();
    console.log(`Available tools: ${tools.length}`);
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test chat with a file system query
    console.log('Testing query: "List all files in /tmp directory"\n');
    
    const response = await client.chat('List all files in /tmp directory', {
      temperature: 0.3
    });
    
    console.log('Response:', response.message);
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log('\nTool calls executed:');
      response.toolCalls.forEach(call => {
        console.log(`  - Tool: ${call.toolName}`);
        console.log(`    Arguments:`, call.arguments);
        if (call.result) {
          console.log(`    Result:`, call.result);
        }
      });
    } else {
      console.log('\nNo tool calls were executed.');
    }

    // Test with a different query format
    console.log('\n\nTesting query: "Create a file called test.txt in /tmp with content \'Hello from Ollama MCP\'"\n');
    
    const response2 = await client.chat('Create a file called test.txt in /tmp with content "Hello from Ollama MCP"', {
      temperature: 0.3
    });
    
    console.log('Response:', response2.message);
    
    if (response2.toolCalls && response2.toolCalls.length > 0) {
      console.log('\nTool calls executed:');
      response2.toolCalls.forEach(call => {
        console.log(`  - Tool: ${call.toolName}`);
        console.log(`    Arguments:`, call.arguments);
        if (call.result) {
          console.log(`    Result:`, call.result);
        }
      });
    } else {
      console.log('\nNo tool calls were executed.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testToolExecution().catch(console.error);