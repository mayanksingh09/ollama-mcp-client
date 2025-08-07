# Ollama MCP Client

A TypeScript implementation of the Model Context Protocol (MCP) client that uses Ollama as the LLM backend for local, private AI-powered interactions with MCP servers.

## Status
✅ **Phase 3 Complete** - Core MCP client implementation with full transport support

## Features

- 🔒 **Privacy-First**: All LLM processing happens locally via Ollama
- 🔌 **MCP Compatible**: Connect to any MCP server (stdio, HTTP, or SSE transport)
- 🛠️ **Tool Orchestration**: Seamless tool discovery and execution
- 📚 **Resource Management**: Access and manage MCP resources
- 💬 **Session Management**: Persistent conversation history and state
- 🔄 **Multi-Server Support**: Connect to multiple MCP servers simultaneously
- 🎯 **TypeScript**: Fully typed for better developer experience
- ⚡ **Fast & Efficient**: Optimized for low-latency local interactions
- 🔁 **Retry Logic**: Built-in retry strategies and circuit breakers
- 📝 **Comprehensive Logging**: Winston-based structured logging

## Prerequisites

- Node.js 18+ 
- Ollama installed and running locally
- TypeScript 5.x

## Installation

```bash
npm install ollama-mcp-client
```

## Quick Start

```typescript
import { OllamaMCPClient } from 'ollama-mcp-client';

// Initialize the client
const client = new OllamaMCPClient({
  ollama: {
    host: 'http://localhost:11434',
    model: 'llama2'
  },
  logging: {
    level: 'info'
  }
});

// Connect to a local MCP server via stdio
const serverId = await client.connectToServer({
  type: 'stdio',
  command: 'node',
  args: ['./mcp-server.js']
});

// Or connect to a remote server via HTTP
const remoteId = await client.connectToServer({
  type: 'http',
  url: 'https://api.example.com/mcp',
  headers: {
    'Authorization': 'Bearer token'
  }
});

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Chat with Ollama using MCP tools
const response = await client.chat('Help me calculate 2+2', {
  includeHistory: true,
  temperature: 0.7
});
console.log('Response:', response.message);

// Disconnect when done
await client.disconnectAll();
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Development mode with watch
npm run dev

# Lint and format
npm run lint
npm run format
```

## Project Structure

```
ollama-mcp-client/
├── src/
│   ├── client/       # MCP client implementation
│   ├── ollama/       # Ollama API integration
│   ├── transport/    # Transport layer (stdio, HTTP, SSE)
│   ├── session/      # Session and state management
│   ├── protocol/     # MCP protocol message handlers
│   ├── types/        # TypeScript type definitions
│   └── utils/        # Utility functions
├── tests/            # Test files
├── docs/             # Documentation
└── examples/         # Usage examples
    ├── basic-usage.ts        # Basic client usage
    └── example-mcp-server.js # Example MCP server
```

## API Overview

### Client Initialization
```typescript
const client = new OllamaMCPClient({
  ollama: {
    host: string,      // Ollama server URL
    model: string,     // Default model to use
  },
  mcp: {
    name: string,      // Client name
    version: string,   // Client version
    capabilities: {},  // MCP capabilities
  },
  session: {
    persist: boolean,  // Enable session persistence
    storagePath: string, // Path for session storage
  },
  logging: {
    level: string,     // Log level (error, warn, info, debug)
  }
});
```

### Key Methods
- `connectToServer(options)` - Connect to an MCP server
- `disconnectFromServer(serverId)` - Disconnect from a specific server
- `listTools(serverId?)` - List available tools
- `callTool(name, args, serverId?)` - Execute a tool
- `listResources(serverId?)` - List available resources
- `readResource(uri, serverId?)` - Read a resource
- `chat(message, options?)` - Chat with Ollama using MCP tools
- `getSession()` - Get current session information
- `cleanup()` - Clean up all resources

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
