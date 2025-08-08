import type { OllamaConfig } from './types';
import { OllamaValidationError } from './errors';
import * as fs from 'fs';
import * as path from 'path';

export interface ConfigProfile {
  name: string;
  config: OllamaConfig;
  isDefault?: boolean;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: OllamaConfig;
  private profiles: Map<string, ConfigProfile> = new Map();
  private activeProfile: string = 'default';

  private constructor() {
    this.config = this.loadDefaultConfig();
    this.loadProfiles();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadDefaultConfig(): OllamaConfig {
    return {
      host: process.env.OLLAMA_HOST || 'localhost',
      port: parseInt(process.env.OLLAMA_PORT || '11434', 10),
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '300000', 10),
      retryAttempts: parseInt(process.env.OLLAMA_RETRY_ATTEMPTS || '3', 10),
      retryDelay: parseInt(process.env.OLLAMA_RETRY_DELAY || '1000', 10),
      headers: this.parseHeaders(process.env.OLLAMA_HEADERS),
    };
  }

  private parseHeaders(headersString?: string): Record<string, string> | undefined {
    if (!headersString) return undefined;

    try {
      return JSON.parse(headersString);
    } catch {
      const headers: Record<string, string> = {};
      const pairs = headersString.split(',');

      for (const pair of pairs) {
        const [key, value] = pair.split(':').map((s) => s.trim());
        if (key && value) {
          headers[key] = value;
        }
      }

      return Object.keys(headers).length > 0 ? headers : undefined;
    }
  }

  private loadProfiles(): void {
    const configPaths = [
      path.join(process.cwd(), '.ollama-mcp.json'),
      path.join(process.cwd(), '.ollama-mcp.config.json'),
      path.join(process.env.HOME || '', '.config', 'ollama-mcp', 'config.json'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

          if (configData.profiles) {
            for (const profile of configData.profiles) {
              this.addProfile(profile);
            }
          }

          if (configData.defaultProfile) {
            this.activeProfile = configData.defaultProfile;
          }

          break;
        } catch (error) {
          console.warn(`Failed to load config from ${configPath}:`, error);
        }
      }
    }

    if (!this.profiles.has('default')) {
      this.profiles.set('default', {
        name: 'default',
        config: this.config,
        isDefault: true,
      });
    }
  }

  addProfile(profile: ConfigProfile): void {
    this.validateConfig(profile.config);
    this.profiles.set(profile.name, profile);
  }

  switchProfile(profileName: string): void {
    if (!this.profiles.has(profileName)) {
      throw new OllamaValidationError(`Profile '${profileName}' not found`);
    }

    this.activeProfile = profileName;
    const profile = this.profiles.get(profileName);
    if (profile) {
      this.config = { ...profile.config };
    }
  }

  getConfig(): OllamaConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<OllamaConfig>): void {
    const newConfig = { ...this.config, ...updates };
    this.validateConfig(newConfig);
    this.config = newConfig;
  }

  private validateConfig(config: OllamaConfig): void {
    if (config.port && (config.port < 1 || config.port > 65535)) {
      throw new OllamaValidationError('Port must be between 1 and 65535', 'port');
    }

    if (config.timeout && config.timeout < 0) {
      throw new OllamaValidationError('Timeout must be non-negative', 'timeout');
    }

    if (config.retryAttempts && config.retryAttempts < 0) {
      throw new OllamaValidationError('Retry attempts must be non-negative', 'retryAttempts');
    }

    if (config.retryDelay && config.retryDelay < 0) {
      throw new OllamaValidationError('Retry delay must be non-negative', 'retryDelay');
    }
  }

  getBaseUrl(): string {
    const host = this.config.host || 'localhost';

    // If host already contains protocol (http:// or https://), return it as-is
    if (host.startsWith('http://') || host.startsWith('https://')) {
      return host;
    }

    // Otherwise, construct the URL
    const protocol = 'http';
    const port = this.config.port || 11434;
    return `${protocol}://${host}:${port}`;
  }

  getModel(): string {
    return this.config.model || 'llama3.2';
  }

  getTimeout(): number {
    return this.config.timeout || 300000;
  }

  getRetryOptions(): { attempts: number; delay: number } {
    return {
      attempts: this.config.retryAttempts || 3,
      delay: this.config.retryDelay || 1000,
    };
  }

  getHeaders(): Record<string, string> {
    return this.config.headers || {};
  }

  listProfiles(): string[] {
    return Array.from(this.profiles.keys());
  }

  getActiveProfile(): string {
    return this.activeProfile;
  }

  saveConfig(filePath?: string): void {
    const configPath = filePath || path.join(process.cwd(), '.ollama-mcp.json');

    const configData = {
      defaultProfile: this.activeProfile,
      profiles: Array.from(this.profiles.values()),
    };

    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  }

  reset(): void {
    this.config = this.loadDefaultConfig();
    this.activeProfile = 'default';
  }
}
