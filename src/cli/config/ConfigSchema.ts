import type { ServerConnectionOptions } from '../../types/client.types';

export interface CLIConfig {
  ollama?: {
    host?: string;
    model?: string;
    timeout?: number;
    models?: string[];
  };
  servers?: ServerConfig[];
  logging?: {
    level?: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    file?: string;
    console?: boolean;
    format?: 'json' | 'simple' | 'pretty';
  };
  session?: {
    persist?: boolean;
    storagePath?: string;
    timeout?: number;
    maxHistorySize?: number;
  };
  interactive?: {
    prompt?: string;
    historyFile?: string;
    maxHistory?: number;
    autoComplete?: boolean;
    colors?: boolean;
  };
  discovery?: {
    enabled?: boolean;
    registryFile?: string;
    scanLocal?: boolean;
    scanTimeout?: number;
  };
  output?: {
    format?: 'pretty' | 'json' | 'yaml';
    colors?: boolean;
    truncate?: boolean;
    maxLength?: number;
  };
}

export interface ServerConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  autoConnect?: boolean;
  stdio?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  };
  http?: {
    url: string;
    headers?: Record<string, string>;
    authToken?: string;
  };
  sse?: {
    url: string;
    headers?: Record<string, string>;
    reconnectDelay?: number;
  };
}

export function validateConfig(config: unknown): config is CLIConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const cfg = config as CLIConfig;

  // Validate Ollama config
  if (cfg.ollama) {
    if (cfg.ollama.host && typeof cfg.ollama.host !== 'string') return false;
    if (cfg.ollama.model && typeof cfg.ollama.model !== 'string') return false;
    if (cfg.ollama.timeout && typeof cfg.ollama.timeout !== 'number') return false;
  }

  // Validate server configs
  if (cfg.servers) {
    if (!Array.isArray(cfg.servers)) return false;
    for (const server of cfg.servers) {
      if (!server.name || typeof server.name !== 'string') return false;
      if (!['stdio', 'http', 'sse'].includes(server.type)) return false;

      if (server.type === 'stdio' && !server.stdio?.command) return false;
      if (server.type === 'http' && !server.http?.url) return false;
      if (server.type === 'sse' && !server.sse?.url) return false;
    }
  }

  return true;
}

export function serverConfigToConnectionOptions(server: ServerConfig): ServerConnectionOptions {
  switch (server.type) {
    case 'stdio':
      return {
        type: 'stdio',
        command: server.stdio!.command,
        args: server.stdio!.args,
        env: server.stdio!.env,
        cwd: server.stdio!.cwd,
      };
    case 'http':
      return {
        type: 'http',
        url: server.http!.url,
        headers: server.http!.headers,
        authToken: server.http!.authToken,
      };
    case 'sse':
      return {
        type: 'sse',
        url: server.sse!.url,
        headers: server.sse!.headers,
        reconnectDelay: server.sse!.reconnectDelay,
      };
  }
}
