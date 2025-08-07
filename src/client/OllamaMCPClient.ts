/**
 * Main MCP Client implementation
 */

export interface OllamaMCPClientConfig {
  ollama?: {
    host?: string;
    model?: string;
  };
}

export interface ServerConnectionOptions {
  command?: string;
  args?: string[];
  url?: string;
}

export class OllamaMCPClient {
  constructor(_config: OllamaMCPClientConfig) {
    // Implementation will be added in Phase 3
  }

  async connectToServer(_options: ServerConnectionOptions): Promise<void> {
    // Implementation will be added in Phase 3
  }

  async chat(_message: string): Promise<string> {
    // Implementation will be added in Phase 5
    return '';
  }
}
