# Configuration Guide

## Configuration Files

The Ollama MCP Client looks for configuration files in the following order (first found wins):

1. `ollama-mcp.config.local.yaml` - Local config with API keys (gitignored)
2. `ollama-mcp.config.local.json` - Local config in JSON format (gitignored)
3. `ollama-mcp.config.yaml` - Main config file (gitignored)
4. `ollama-mcp.config.json` - Main config in JSON format
5. `.ollama-mcprc` - RC file format
6. `package.json` - Under `ollama-mcp` key

## Setting Up API Keys

### Method 1: Local Config File (Recommended)

1. Copy the example configuration:
   ```bash
   cp ollama-mcp.config.example.yaml ollama-mcp.config.local.yaml
   ```

2. Edit `ollama-mcp.config.local.yaml` and add your API keys:
   ```yaml
   servers:
     - name: linear
       type: sse
       sse:
         url: 'https://mcp.linear.app/sse'
         headers:
           Authorization: 'Bearer lin_api_YOUR_KEY_HERE'
   ```

### Method 2: Environment Variables

You can also use environment variables in your config:

```yaml
servers:
  - name: linear
    type: sse
    sse:
      url: 'https://mcp.linear.app/sse'
      headers:
        Authorization: 'Bearer ${LINEAR_API_KEY}'
```

Then set the environment variable:
```bash
export LINEAR_API_KEY="lin_api_YOUR_KEY_HERE"
```

## Server Configuration Examples

### Apollo.io (Local MCP Server)

```yaml
- name: apollo
  type: stdio
  autoConnect: true
  stdio:
    command: node
    args:
      - '/path/to/apollo-io-mcp-server/dist/index.js'
```

Make sure to build your Apollo.io MCP server first:
```bash
cd /path/to/apollo-io-mcp-server
npm run build
```

### Supabase (PostgreSQL)

```yaml
- name: supabase
  type: stdio
  autoConnect: true
  stdio:
    command: npx
    args:
      - '-y'
      - '@modelcontextprotocol/server-postgres'
      - 'postgresql://user:password@host:port/database'
```

### GitHub (with Token)

```yaml
- name: github
  type: stdio
  autoConnect: false
  stdio:
    command: npx
    args:
      - '-y'
      - '@modelcontextprotocol/server-github'
    env:
      GITHUB_TOKEN: 'ghp_YOUR_TOKEN_HERE'
```

### Custom HTTP API

```yaml
- name: custom-api
  type: http
  autoConnect: false
  http:
    url: 'https://api.example.com/mcp'
    headers:
      'X-API-Key': 'YOUR_API_KEY'
    authToken: 'Bearer YOUR_TOKEN'  # Alternative auth method
```

## Security Notes

- **NEVER** commit files containing API keys to git
- Use `ollama-mcp.config.local.yaml` for sensitive configuration
- The `.gitignore` file is configured to exclude:
  - `ollama-mcp.config.yaml`
  - `ollama-mcp.config.local.yaml`
  - Any `*.local.yaml` or `*.local.json` files
- Consider using environment variables for CI/CD environments