/**
 * Basic usage example for OllamaMCPClient
 */

import { OllamaMCPClient } from '../src';

async function main() {
  // Initialize the client with configuration
  const client = new OllamaMCPClient({
    ollama: {
      host: 'http://localhost:11434',
      model: 'llama2',
    },
    mcp: {
      name: 'example-client',
      version: '1.0.0',
      capabilities: {
        tools: {
          listTools: true,
          callTool: true,
        },
        resources: {
          listResources: true,
          readResource: true,
        },
        prompts: {
          listPrompts: true,
          getPrompt: true,
        },
      },
    },
    session: {
      persist: true,
      storagePath: './sessions',
    },
    logging: {
      level: 'info',
    },
  });

  try {
    // Example 1: Connect to a local MCP server via stdio
    console.log('Connecting to local MCP server...');
    const serverId = await client.connectToServer({
      type: 'stdio',
      command: 'node',
      args: ['./example-mcp-server.js'],
    });
    console.log(`Connected to server: ${serverId}`);

    // Example 2: List available tools
    console.log('\nListing available tools...');
    const tools = await client.listTools();
    console.log(
      'Available tools:',
      tools.map((t) => t.name)
    );

    // Example 3: Call a tool directly
    if (tools.length > 0) {
      console.log(`\nCalling tool: ${tools[0].name}`);
      const result = await client.callTool(tools[0].name, {
        /* tool arguments */
      });
      console.log('Tool result:', result);
    }

    // Example 4: List and read resources
    console.log('\nListing resources...');
    const resources = await client.listResources();
    console.log(
      'Available resources:',
      resources.map((r) => r.uri)
    );

    if (resources.length > 0) {
      console.log(`\nReading resource: ${resources[0].uri}`);
      const content = await client.readResource(resources[0].uri);
      console.log('Resource content:', content.substring(0, 200) + '...');
    }

    // Example 5: Chat with Ollama using MCP tools
    console.log('\n\nStarting chat with Ollama + MCP tools...');

    const response1 = await client.chat('What tools are available to help me?', {
      includeHistory: false,
      temperature: 0.7,
    });
    console.log('Assistant:', response1.message);

    // Example 6: Chat with tool usage
    const response2 = await client.chat(
      'Please use one of the available tools to help me with a task.',
      {
        includeHistory: true,
        temperature: 0.7,
      }
    );
    console.log('\nAssistant:', response2.message);

    if (response2.toolCalls && response2.toolCalls.length > 0) {
      console.log('Tools used:', response2.toolCalls);
    }

    // Example 7: Get session information
    const session = client.getSession();
    if (session) {
      console.log('\n\nSession information:');
      console.log('Session ID:', session.id);
      console.log('Connected servers:', session.connections.size);
      console.log('Conversation history:', session.conversationHistory.length, 'messages');
    }

    // Example 8: Connect to a remote MCP server via HTTP
    console.log('\n\nConnecting to remote MCP server...');
    try {
      const remoteServerId = await client.connectToServer({
        type: 'http',
        url: 'https://example-mcp-server.com',
        headers: {
          Authorization: 'Bearer your-api-key',
        },
      });
      console.log(`Connected to remote server: ${remoteServerId}`);

      // List tools from remote server
      const remoteTools = await client.listTools(remoteServerId);
      console.log(
        'Remote server tools:',
        remoteTools.map((t) => t.name)
      );
    } catch (error) {
      console.log('Could not connect to remote server:', error.message);
    }

    // Example 9: Get connected servers
    const servers = client.getConnectedServers();
    console.log('\n\nConnected servers:');
    for (const server of servers) {
      console.log(`- ${server.serverId}: ${server.serverName} (${server.state})`);
    }

    // Example 10: Disconnect from servers
    console.log('\n\nDisconnecting from all servers...');
    await client.disconnectAll();
    console.log('Disconnected from all servers');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    await client.cleanup();
    console.log('\nClient cleaned up');
  }
}

// Run the example
main().catch(console.error);
