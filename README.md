# Ollama MCP Client

A TypeScript implementation of the Model Context Protocol (MCP) client that uses Ollama as the LLM backend for local, private AI-powered interactions with MCP servers.

## Features

- 🔒 **Privacy-First**: All LLM processing happens locally via Ollama
- 🔌 **MCP Compatible**: Connect to any MCP server (stdio or HTTP transport)
- 🛠️ **Tool Orchestration**: Seamless tool discovery and execution
- 📚 **Resource Management**: Access and manage MCP resources
- 🎯 **TypeScript**: Fully typed for better developer experience
- ⚡ **Fast & Efficient**: Optimized for low-latency local interactions

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
  }
});

// Connect to an MCP server
await client.connectToServer({
  command: 'path/to/mcp-server',
  args: ['--option', 'value']
});

// Start interacting
const response = await client.chat('What tools are available?');
console.log(response);
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
│   ├── transport/    # Transport layer (stdio, HTTP)
│   └── utils/        # Utility functions
├── tests/            # Test files
├── docs/             # Documentation
└── examples/         # Usage examples
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
