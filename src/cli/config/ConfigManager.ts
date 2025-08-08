import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { cosmiconfigSync, CosmiconfigResult } from 'cosmiconfig';
import type { CLIConfig, ServerConfig } from './ConfigSchema';
import { validateConfig } from './ConfigSchema';
import { DEFAULT_CLIENT_CONFIG, DEFAULT_CLI_CONFIG } from './defaults';

export class ConfigManager {
  private config: CLIConfig;
  public configPath?: string;
  private explorer: ReturnType<typeof cosmiconfigSync>;

  constructor() {
    this.config = this.mergeConfigs(
      DEFAULT_CLIENT_CONFIG as Partial<CLIConfig>,
      DEFAULT_CLI_CONFIG as Partial<CLIConfig>
    );
    this.explorer = cosmiconfigSync('ollama-mcp', {
      searchPlaces: [
        'package.json',
        '.ollama-mcprc',
        '.ollama-mcprc.json',
        '.ollama-mcprc.yaml',
        '.ollama-mcprc.yml',
        'ollama-mcp.config.local.json', // Local config takes priority
        'ollama-mcp.config.local.yaml',
        'ollama-mcp.config.local.yml',
        'ollama-mcp.config.json',
        'ollama-mcp.config.yaml',
        'ollama-mcp.config.yml',
        'config/ollama-mcp.json',
        'config/ollama-mcp.yaml',
        'config/ollama-mcp.yml',
      ],
      loaders: {
        '.yaml': (_filepath: string, content: string) => yaml.parse(content),
        '.yml': (_filepath: string, content: string) => yaml.parse(content),
      },
    });
  }

  async load(configPath?: string): Promise<CLIConfig> {
    try {
      let result: CosmiconfigResult = null;

      if (configPath) {
        // Load specific config file
        result = this.explorer.load(configPath);
      } else {
        // Search for config file
        result = this.explorer.search();
      }

      if (result && result.config) {
        if (!validateConfig(result.config)) {
          throw new Error('Invalid configuration format');
        }
        this.config = this.mergeConfigs(this.config, result.config);
        this.configPath = result.filepath;
      }

      // Load environment variables
      this.loadEnvironmentVariables();

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${(error as Error).message}`);
    }
  }

  async save(configPath?: string): Promise<void> {
    const savePath =
      configPath || this.configPath || path.join(process.cwd(), 'ollama-mcp.config.yaml');

    try {
      const dir = path.dirname(savePath);
      await fs.mkdir(dir, { recursive: true });

      const ext = path.extname(savePath);
      let content: string;

      if (ext === '.json') {
        content = JSON.stringify(this.config, null, 2);
      } else {
        content = yaml.stringify(this.config);
      }

      await fs.writeFile(savePath, content, 'utf-8');
      this.configPath = savePath;
    } catch (error) {
      throw new Error(`Failed to save configuration: ${(error as Error).message}`);
    }
  }

  get(): CLIConfig {
    return { ...this.config };
  }

  set(config: Partial<CLIConfig>): void {
    this.config = this.mergeConfigs(this.config, config);
  }

  update(path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = this.config as Record<string, unknown>;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  getServer(name: string): ServerConfig | undefined {
    return this.config.servers?.find((s) => s.name === name);
  }

  addServer(server: ServerConfig): void {
    if (!this.config.servers) {
      this.config.servers = [];
    }

    const existing = this.config.servers.findIndex((s) => s.name === server.name);
    if (existing >= 0) {
      this.config.servers[existing] = server;
    } else {
      this.config.servers.push(server);
    }
  }

  removeServer(name: string): boolean {
    if (!this.config.servers) return false;

    const index = this.config.servers.findIndex((s) => s.name === name);
    if (index >= 0) {
      this.config.servers.splice(index, 1);
      return true;
    }
    return false;
  }

  listServers(): ServerConfig[] {
    return this.config.servers || [];
  }

  private loadEnvironmentVariables(): void {
    // Ollama configuration from environment
    if (process.env.OLLAMA_HOST) {
      this.update('ollama.host', process.env.OLLAMA_HOST);
    }
    if (process.env.OLLAMA_MODEL) {
      this.update('ollama.model', process.env.OLLAMA_MODEL);
    }
    if (process.env.OLLAMA_TIMEOUT) {
      this.update('ollama.timeout', parseInt(process.env.OLLAMA_TIMEOUT, 10));
    }

    // Logging configuration from environment
    if (process.env.LOG_LEVEL) {
      this.update('logging.level', process.env.LOG_LEVEL);
    }
    if (process.env.LOG_FILE) {
      this.update('logging.file', process.env.LOG_FILE);
    }

    // Session configuration from environment
    if (process.env.SESSION_PATH) {
      this.update('session.storagePath', process.env.SESSION_PATH);
    }
  }

  private mergeConfigs(...configs: Array<Partial<CLIConfig>>): CLIConfig {
    const result: CLIConfig = {};

    for (const config of configs) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
          if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
            (result as Record<string, unknown>)[key] = {
              ...(((result as Record<string, unknown>)[key] as object) || {}),
              ...value,
            };
          } else {
            (result as Record<string, unknown>)[key] = value;
          }
        }
      }
    }

    return result;
  }

  async exportConfig(format: 'json' | 'yaml' = 'yaml'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(this.config, null, 2);
    } else {
      return yaml.stringify(this.config);
    }
  }

  async importConfig(content: string, format?: 'json' | 'yaml'): Promise<void> {
    let config: unknown;

    try {
      if (format === 'json' || content.trim().startsWith('{')) {
        config = JSON.parse(content);
      } else {
        config = yaml.parse(content);
      }

      if (!validateConfig(config)) {
        throw new Error('Invalid configuration format');
      }

      this.config = config;
    } catch (error) {
      throw new Error(`Failed to import configuration: ${(error as Error).message}`);
    }
  }
}
