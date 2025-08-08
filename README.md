# Ollama MCP Client

[![npm version](https://img.shields.io/npm/v/ollama-mcp-client.svg)](https://www.npmjs.com/package/ollama-mcp-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

A powerful TypeScript implementation of the Model Context Protocol (MCP) client that uses Ollama as the LLM backend for local, private AI-powered interactions with MCP servers. Run AI tools and access resources without sending data to the cloud.

## 🚀 Status
✅ **Phase 8 Complete** - Full testing suite with comprehensive unit, integration, and end-to-end tests
🔄 **Phase 9 In Progress** - Documentation and examples

## ✨ Features

### Core Capabilities
- 🔒 **Privacy-First**: All LLM processing happens locally via Ollama - your data never leaves your machine
- 🔌 **Full MCP Support**: Connect to any MCP server via stdio, HTTP, or SSE transport
- 🛠️ **Smart Tool Orchestration**: Automatic tool discovery, validation, and execution
- 📚 **Resource Management**: Access and transform MCP resources with caching
- 💬 **Conversation Management**: Persistent sessions with context window optimization
- 🔄 **Multi-Server Support**: Connect to and orchestrate multiple MCP servers simultaneously

### Advanced Features
- 🎯 **TypeScript First**: Fully typed APIs with comprehensive IntelliSense support
- ⚡ **Performance Optimized**: Connection pooling, request queuing, and smart caching
- 🔁 **Resilient**: Circuit breakers, exponential backoff, and automatic retry strategies
- 📝 **Structured Logging**: Winston-based logging with multiple output formats
- 🔧 **Plugin System**: Extend functionality with custom plugins and transformers
- 🎨 **CLI Interface**: Feature-rich command-line interface with interactive mode
- 📊 **Analytics**: Built-in tool usage analytics and performance metrics
- 🔐 **Secure**: Input validation, rate limiting, and secure transport options

## 📋 Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Ollama** - [Installation Guide](https://ollama.ai/download)
  ```bash
  # macOS
  brew install ollama
  
  # Linux
  curl -fsSL https://ollama.ai/install.sh | sh
  
  # Windows
  # Download from https://ollama.ai/download/windows
  ```
- **TypeScript 5.x** (for development)

## 📦 Installation

### As a Library

```bash
npm install ollama-mcp-client
```

### As a Global CLI Tool

```bash
npm install -g ollama-mcp-client
```

### From Source

```bash
git clone https://github.com/mayanksingh09/ollama-mcp-client.git
cd ollama-mcp-client
npm install
npm run build
npm link  # For CLI usage
```

## 🚀 Quick Start

### CLI Usage

```bash
# Initialize configuration
ollama-mcp config init

# Discover and connect to MCP servers
ollama-mcp discover --save
ollama-mcp connect filesystem

# Start interactive chat
ollama-mcp chat
```

### Library Usage

```typescript
import { OllamaMCPClient } from 'ollama-mcp-client';

// Initialize the client
const client = new OllamaMCPClient({
  ollama: {
    host: 'http://localhost:11434',
    // model: 'llama3.2'  // Optional: specify a model, or auto-detect will be used
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

## 📖 Documentation

- [📚 API Documentation](./docs/) - Complete API reference (auto-generated)
- [🎓 Tutorials](./docs/tutorials/) - Step-by-step guides
- [⚙️ Configuration](./docs/configuration.md) - Configuration reference
- [🔧 CLI Reference](./docs/CLI.md) - Command-line interface guide
- [🏗️ Architecture](./docs/architecture.md) - System design and architecture
- [🐛 Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions
- [👥 Contributing](./CONTRIBUTING.md) - Contribution guidelines

## 📊 API Overview

### Client Initialization

```typescript
const client = new OllamaMCPClient({
  ollama: {
    host: string,            // Ollama server URL (default: http://localhost:11434)
    model?: string,          // Optional: specify a model (e.g., 'llama3.2', 'mistral', 'codellama') or auto-detect will be used
    timeout?: number,        // Request timeout in ms (default: 60000)
    headers?: Record<string, string>,  // Custom headers for Ollama requests
  },
  mcp: {
    name: string,            // Client name for identification
    version: string,         // Client version
    capabilities: {          // MCP capabilities to advertise
      tools?: {},
      resources?: {},
      prompts?: {},
    }
  },
  session: {
    persist?: boolean,       // Enable session persistence (default: false)
    storagePath?: string,    // Path for session storage
    maxHistory?: number,     // Max conversation history (default: 100)
  },
  logging: {
    level?: string,          // Log level (error, warn, info, debug)
    file?: string,           // Log file path
    console?: boolean,       // Enable console logging (default: true)
  },
  performance: {
    connectionPoolSize?: number,  // HTTP connection pool size (default: 10)
    cacheSize?: number,          // Cache size in MB (default: 100)
    requestTimeout?: number,     // Global request timeout (default: 30000)
  }
});
```

### Core Methods

#### Connection Management
```typescript
// Connect to servers
await client.connectToServer(options: TransportOptions): Promise<string>
await client.disconnectFromServer(serverId: string): Promise<void>
await client.disconnectAll(): Promise<void>
await client.getConnectedServers(): ServerInfo[]
```

#### Tool Operations
```typescript
// Tool discovery and execution
await client.listTools(serverId?: string): Promise<Tool[]>
await client.callTool(name: string, args: any, serverId?: string): Promise<ToolResult>
await client.validateToolCall(name: string, args: any): Promise<ValidationResult>
```

#### Resource Management
```typescript
// Resource operations
await client.listResources(serverId?: string): Promise<Resource[]>
await client.readResource(uri: string, serverId?: string): Promise<ResourceContent>
await client.subscribeToResource(uri: string, callback: Function): Promise<Subscription>
```

#### Conversation & Chat
```typescript
// Chat with Ollama using MCP tools
await client.chat(message: string, options?: ChatOptions): Promise<ChatResponse>
await client.streamChat(message: string, options?: StreamOptions): AsyncIterator<ChatChunk>
await client.getConversationHistory(): Promise<Message[]>
await client.clearConversation(): Promise<void>
```

#### Session Management
```typescript
// Session operations
client.getSession(): SessionInfo | null
await client.saveSession(path?: string): Promise<void>
await client.loadSession(path: string): Promise<void>
await client.exportSession(): Promise<SessionData>
```

## 🎯 Use Cases

### Local AI Assistant
Build a private AI assistant that can interact with your local files, databases, and APIs without sending data to the cloud.

### Development Tools
Create AI-powered development tools that can analyze code, run tests, and manage projects using local LLMs.

### Data Processing
Process sensitive data with AI while maintaining complete data privacy and compliance requirements.

### Automation
Automate complex workflows by combining multiple MCP servers with Ollama's reasoning capabilities.

## 🏆 Why Choose Ollama MCP Client?

| Feature | Ollama MCP Client | Cloud-based Alternatives |
|---------|------------------|-------------------------|
| **Privacy** | ✅ 100% local processing | ❌ Data sent to cloud |
| **Cost** | ✅ Free after setup | ❌ Per-token pricing |
| **Speed** | ✅ Low latency (local) | ⚠️ Network dependent |
| **Offline** | ✅ Works offline | ❌ Requires internet |
| **Customization** | ✅ Full control | ⚠️ Limited options |
| **Models** | ✅ Any Ollama model | ⚠️ Provider specific |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e         # End-to-end tests
npm run test:coverage    # Generate coverage report

# Watch mode for development
npm run test:watch
```

## 🔧 Troubleshooting

### Common Issues

**Ollama Connection Failed**
```bash
# Ensure Ollama is running
ollama serve

# Check Ollama is accessible
curl http://localhost:11434/api/tags
```

**MCP Server Not Found**
```bash
# Install MCP server packages
npm install -g @modelcontextprotocol/server-filesystem

# Discover available servers
ollama-mcp discover
```

**Performance Issues**
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Check system resources
ollama-mcp config set performance.cacheSize 200
```

For more detailed troubleshooting, see our [Troubleshooting Guide](./docs/troubleshooting.md).

## 🗺️ Roadmap

- [ ] **Phase 10**: Production readiness with Docker support
- [ ] **Phase 11**: Performance optimization and benchmarking
- [ ] **Phase 12**: Security hardening and compliance features
- [ ] Browser extension for web-based MCP interactions
- [ ] Support for more LLM providers (while maintaining local-first approach)
- [ ] Visual workflow builder for complex tool chains
- [ ] Advanced context management with RAG support

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/mayanksingh09/ollama-mcp-client.git
cd ollama-mcp-client

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

## 📝 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai/) for providing local LLM capabilities
- [Anthropic](https://anthropic.com/) for the Model Context Protocol specification
- All contributors and users of this project

## 📬 Support

- 📧 [Report Issues](https://github.com/mayanksingh09/ollama-mcp-client/issues)
- 💬 [Discussions](https://github.com/mayanksingh09/ollama-mcp-client/discussions)
- 📖 [Documentation](https://github.com/mayanksingh09/ollama-mcp-client/wiki)

---

Built with ❤️ for the local-first AI community
