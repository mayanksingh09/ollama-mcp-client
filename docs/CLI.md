# Ollama MCP Client CLI

The Ollama MCP Client provides a comprehensive command-line interface for interacting with MCP servers using Ollama as the LLM backend.

## Installation

```bash
# Install globally
npm install -g ollama-mcp-client

# Or run locally
npm run cli
```

## Quick Start

1. **Initialize configuration:**
```bash
ollama-mcp config init
```

2. **Discover available MCP servers:**
```bash
ollama-mcp discover --save
```

3. **Connect to a server:**
```bash
ollama-mcp connect filesystem
```

4. **Start chatting:**
```bash
ollama-mcp chat
```

## Commands

### Global Options

- `-c, --config <path>` - Path to configuration file
- `-d, --debug` - Enable debug mode with verbose logging
- `-j, --json` - Output in JSON format
- `-y, --yaml` - Output in YAML format
- `--no-colors` - Disable colored output
- `-h, --help` - Display help
- `-V, --version` - Display version

### `connect` - Connect to MCP Servers

Connect to an MCP server for tool and resource access.

```bash
# Connect to a configured server
ollama-mcp connect filesystem

# Connect to a new stdio server
ollama-mcp connect new --type stdio --command mcp-server-filesystem --args "--root /"

# Connect to an HTTP server
ollama-mcp connect api --type http --url https://api.example.com/mcp --auth YOUR_TOKEN

# Save server configuration
ollama-mcp connect myserver --save --auto-connect
```

**Options:**
- `-t, --type <type>` - Server type (stdio, http, sse)
- `-c, --command <cmd>` - Command for stdio server
- `-a, --args <args>` - Arguments for stdio server
- `-u, --url <url>` - URL for http/sse server
- `-H, --headers <headers>` - Headers for http/sse server
- `--auth <token>` - Authentication token
- `--save` - Save server configuration
- `--auto-connect` - Auto-connect on startup

### `chat` - Interactive Chat

Start an interactive chat session with Ollama and MCP tools.

```bash
# Start chat with default model
ollama-mcp chat

# Use specific model
ollama-mcp chat --model codellama

# Custom temperature and system prompt
ollama-mcp chat --temperature 0.8 --system "You are a helpful coding assistant"

# Disable tools or history
ollama-mcp chat --no-tools --no-history
```

**Options:**
- `-m, --model <model>` - Ollama model to use
- `-s, --system <prompt>` - System prompt
- `-t, --temperature <temp>` - Temperature (0.0-1.0)
- `--max-tokens <tokens>` - Maximum tokens to generate
- `--no-tools` - Disable MCP tool usage
- `--no-history` - Disable conversation history
- `--stream` - Enable streaming responses

**Chat Commands:**
- Type any message to chat
- Use `"""` for multi-line input
- Type `exit` to quit
- Type `clear` to clear history

### `list` - List Available Resources

List tools, resources, prompts, servers, or models.

```bash
# List all tools
ollama-mcp list tools

# List resources in table format
ollama-mcp list resources --format table

# List prompts from specific server
ollama-mcp list prompts --server myserver

# List configured servers
ollama-mcp list servers

# List Ollama models
ollama-mcp list models
```

**Options:**
- `-s, --server <id>` - Filter by server ID
- `-f, --format <format>` - Output format (pretty, json, yaml, table)
- `--detailed` - Show detailed information

### `discover` - Discover MCP Servers

Discover available MCP servers on your system.

```bash
# Discover servers with default settings
ollama-mcp discover

# Scan npm packages
ollama-mcp discover --scan-npm

# Scan specific directory
ollama-mcp discover --scan-path /usr/local/bin

# Use server registry
ollama-mcp discover --registry ~/.ollama-mcp/servers.json

# Save discovered servers
ollama-mcp discover --save
```

**Options:**
- `--scan-npm` - Scan for MCP servers in npm packages
- `--scan-path <path>` - Scan specific directory
- `--registry <file>` - Path to server registry file
- `--save` - Save discovered servers to configuration

### `config` - Configuration Management

Manage CLI configuration settings.

```bash
# Show current configuration
ollama-mcp config show

# Show config file path
ollama-mcp config show --path

# Set configuration value
ollama-mcp config set ollama.model llama2
ollama-mcp config set logging.level debug

# Get configuration value
ollama-mcp config get ollama.host

# Initialize new configuration
ollama-mcp config init
ollama-mcp config init --interactive

# Add a server
ollama-mcp config add-server

# Remove a server
ollama-mcp config remove-server myserver
```

## Interactive Mode

When no command is provided, the CLI starts in interactive mode:

```bash
ollama-mcp
```

### Interactive Commands

- `help` - Show available commands
- `exit` / `quit` - Exit the session
- `clear` - Clear the screen
- `connect [server]` - Connect to a server
- `disconnect [id]` - Disconnect from server(s)
- `list <type>` - List tools/resources/prompts
- `call <tool> [args]` - Call a tool directly
- `read <uri>` - Read a resource
- `model [name]` - Get or set the Ollama model
- `config [action]` - Manage configuration
- `history` - Show command history
- `save [file]` - Save session to file
- `load [file]` - Load session from file

## Configuration

### Configuration File

The CLI looks for configuration in these locations:
1. Command-line specified path (`--config`)
2. `ollama-mcp.config.yaml` in current directory
3. `.ollama-mcprc` in current directory
4. `~/.ollama-mcp/config.yaml`
5. `/etc/ollama-mcp/config.yaml`

### Example Configuration

```yaml
# Ollama settings
ollama:
  host: http://localhost:11434
  model: llama2
  timeout: 60000

# MCP servers
servers:
  - name: filesystem
    type: stdio
    autoConnect: true
    stdio:
      command: mcp-server-filesystem
      args: ["--root", "./"]
  
  - name: github
    type: stdio
    stdio:
      command: mcp-server-github
      env:
        GITHUB_TOKEN: ${GITHUB_TOKEN}

# Logging
logging:
  level: info
  file: ~/.ollama-mcp/logs/client.log

# Output preferences
output:
  format: pretty
  colors: true
```

### Environment Variables

- `OLLAMA_HOST` - Ollama server host
- `OLLAMA_MODEL` - Default Ollama model
- `LOG_LEVEL` - Logging level
- `LOG_FILE` - Log file path
- `SESSION_PATH` - Session storage path

## Examples

### Example 1: File System Operations

```bash
# Connect to filesystem server
ollama-mcp connect filesystem

# Chat about files
ollama-mcp chat
> What files are in the current directory?
> Read the README.md file
> Create a new file called notes.txt with some content
```

### Example 2: Multi-Server Setup

```bash
# Connect to multiple servers
ollama-mcp connect filesystem
ollama-mcp connect github
ollama-mcp connect database

# List all available tools
ollama-mcp list tools

# Use tools from different servers in chat
ollama-mcp chat
> Search GitHub for issues related to authentication
> Read the config.yaml file from the filesystem
> Query the users table in the database
```

### Example 3: Automation Script

```bash
#!/bin/bash

# Initialize and configure
ollama-mcp config init
ollama-mcp config set ollama.model codellama
ollama-mcp config set output.format json

# Discover and connect
ollama-mcp discover --save
ollama-mcp connect filesystem

# List and call tools
TOOLS=$(ollama-mcp list tools --json)
ollama-mcp call read-file '{"path": "package.json"}' | jq .
```

## Troubleshooting

### Common Issues

1. **Cannot connect to Ollama:**
   - Ensure Ollama is running: `ollama serve`
   - Check the host configuration: `ollama-mcp config get ollama.host`

2. **MCP server not found:**
   - Install the server: `npm install -g @modelcontextprotocol/server-filesystem`
   - Use discover to find servers: `ollama-mcp discover`

3. **No tools available:**
   - Connect to a server first: `ollama-mcp connect <server>`
   - Check server capabilities: `ollama-mcp list tools`

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Via command line
ollama-mcp --debug chat

# Via configuration
ollama-mcp config set logging.level debug

# Via environment
LOG_LEVEL=debug ollama-mcp chat
```

## Advanced Usage

### Custom Tool Invocation

```bash
# Direct tool invocation
ollama-mcp call read-file '{"path": "/etc/hosts"}'

# With server specification
ollama-mcp call --server filesystem list-directory '{"path": "/"}'
```

### Session Management

```bash
# Save current session
ollama-mcp save session-backup.json

# Load previous session
ollama-mcp load session-backup.json
```

### Scripting

```javascript
// Use in Node.js scripts
const { OllamaMCPClient } = require('ollama-mcp-client');

const client = new OllamaMCPClient({
  ollama: { host: 'http://localhost:11434' }
});

await client.connectToServer({
  type: 'stdio',
  command: 'mcp-server-filesystem'
});

const response = await client.chat('List all JSON files');
console.log(response.message);
```

## Security Considerations

1. **API Keys:** Store sensitive tokens in environment variables
2. **File Access:** Be cautious with filesystem server permissions
3. **Network Security:** Use HTTPS for remote MCP servers
4. **Audit Logging:** Enable debug logging for security audits

## Contributing

See the main [README.md](../README.md) for contribution guidelines.

## License

MIT License - see [LICENSE](../LICENSE) for details.