import type { OllamaMCPClientConfig } from '../../types/client.types';

export const DEFAULT_CONFIG_FILENAME = 'ollama-mcp.config';
export const DEFAULT_CONFIG_EXTENSIONS = ['.yaml', '.yml', '.json'];
export const DEFAULT_CONFIG_PATHS = [
  process.cwd(),
  process.env.HOME ? `${process.env.HOME}/.ollama-mcp` : '',
  '/etc/ollama-mcp',
].filter(Boolean);

export const DEFAULT_CLIENT_CONFIG: Partial<OllamaMCPClientConfig> = {
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || undefined,
    timeout: 60000,
  },
  mcp: {
    name: 'ollama-mcp-cli',
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
  logging: {
    level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug' | 'verbose') || 'info',
    console: true,
    format: 'simple',
  },
  session: {
    persist: true,
    storagePath: process.env.HOME ? `${process.env.HOME}/.ollama-mcp/sessions` : './sessions',
    maxHistorySize: 100,
  },
};

export const DEFAULT_CLI_CONFIG = {
  interactive: {
    prompt: '> ',
    historyFile: process.env.HOME ? `${process.env.HOME}/.ollama-mcp/history` : './.history',
    maxHistory: 1000,
    autoComplete: true,
    colors: true,
  },
  discovery: {
    enabled: true,
    registryFile: process.env.HOME
      ? `${process.env.HOME}/.ollama-mcp/servers.json`
      : './servers.json',
    scanLocal: true,
    scanTimeout: 5000,
  },
  output: {
    format: 'pretty', // 'pretty' | 'json' | 'yaml'
    colors: true,
    truncate: true,
    maxLength: 1000,
  },
};
