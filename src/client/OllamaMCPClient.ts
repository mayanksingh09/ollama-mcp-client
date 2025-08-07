/**
 * Main MCP Client implementation
 */

import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { OllamaClient } from '../ollama/OllamaClient';
import { TransportManager } from '../transport/TransportManager';
import { SessionManager } from '../session/SessionManager';
import { MessageHandler } from '../protocol/MessageHandler';
import type { ITransport } from '../types/transport.types';
import type {
  OllamaMCPClientConfig,
  ServerConnectionOptions,
  ConnectionInfo,
  ChatOptions,
  ChatResponse,
  ClientSession,
} from '../types/client.types';
import { ConnectionState } from '../types/client.types';
import type {
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPToolCall,
  MCPToolResult,
} from '../types/mcp.types';
import type { ChatCompletionResponse } from '../ollama/types';
import type { Logger } from 'winston';
import winston from 'winston';

export class OllamaMCPClient extends EventEmitter {
  private ollamaClient: OllamaClient;
  private transportManager: TransportManager;
  private sessionManager: SessionManager;
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private mcpClients: Map<string, Client> = new Map();
  private config: OllamaMCPClientConfig;
  private logger: Logger;

  constructor(config: OllamaMCPClientConfig = {}) {
    super();
    this.config = config;

    // Initialize Ollama client
    this.ollamaClient = new OllamaClient(config.ollama);

    // Initialize managers
    this.transportManager = TransportManager.getInstance();
    this.sessionManager = new SessionManager({
      persist: config.session?.persist,
      storagePath: config.session?.storagePath,
    });

    // Initialize logger
    this.logger = winston.createLogger({
      level: config.logging?.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'OllamaMCPClient' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });

    // Setup event forwarding from session manager
    this.setupEventForwarding();

    this.logger.info('OllamaMCPClient initialized');
  }

  /**
   * Connect to an MCP server
   */
  async connectToServer(options: ServerConnectionOptions): Promise<string> {
    const session = await this.sessionManager.getOrCreateSession();
    const serverId = this.generateServerId(options);

    try {
      this.logger.info('Connecting to MCP server', { serverId, type: options.type });

      // Create transport based on connection type
      let transport: unknown;

      if (options.type === 'stdio') {
        // Use MCP SDK's StdioClientTransport
        transport = new StdioClientTransport({
          command: options.command,
          args: options.args,
          env: options.env,
        });
      } else {
        // Use our custom HTTP/SSE transport
        const customTransport = this.transportManager.createTransport(
          options,
          this.config.logging?.level === 'debug'
        );

        // We need to adapt our transport to MCP SDK's interface
        transport = this.adaptTransport(customTransport, serverId);
      }

      // Create MCP client
      const client = new Client(
        {
          name: this.config.mcp?.name || 'ollama-mcp-client',
          version: this.config.mcp?.version || '1.0.0',
        },
        {
          capabilities: (this.config.mcp?.capabilities || {}) as Record<string, unknown>,
        }
      );

      // Connect client to transport
      await client.connect(transport as Parameters<typeof client.connect>[0]);

      // Store client and setup handlers
      this.mcpClients.set(serverId, client);
      this.setupClientHandlers(serverId, client, session);

      // Update connection info
      const connectionInfo: ConnectionInfo = {
        serverId,
        serverName: options.type === 'stdio' ? options.command : options.url,
        connectionType: options.type,
        state: ConnectionState.CONNECTED,
        connectedAt: new Date(),
      };

      this.sessionManager.updateConnection(session.id, serverId, connectionInfo);

      // Get server capabilities
      await this.discoverServerCapabilities(serverId, client, session);

      this.logger.info('Successfully connected to MCP server', { serverId });
      this.emit('serverConnected', serverId, connectionInfo);

      return serverId;
    } catch (error) {
      this.logger.error('Failed to connect to MCP server', { serverId, error });

      const connectionInfo: ConnectionInfo = {
        serverId,
        serverName: options.type === 'stdio' ? options.command : options.url,
        connectionType: options.type,
        state: ConnectionState.ERROR,
        lastError: (error as Error).message,
      };

      this.sessionManager.updateConnection(session.id, serverId, connectionInfo);
      this.emit('connectionError', serverId, error);

      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectFromServer(serverId: string): Promise<void> {
    const client = this.mcpClients.get(serverId);
    if (!client) {
      this.logger.warn('Server not connected', { serverId });
      return;
    }

    try {
      await client.close();
      this.mcpClients.delete(serverId);
      this.messageHandlers.delete(serverId);

      const session = this.sessionManager.getActiveSession();
      if (session) {
        this.sessionManager.removeConnection(session.id, serverId);
      }

      this.logger.info('Disconnected from MCP server', { serverId });
      this.emit('serverDisconnected', serverId);
    } catch (error) {
      this.logger.error('Error disconnecting from server', { serverId, error });
      throw error;
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.mcpClients.keys());

    await Promise.all(
      serverIds.map((serverId) =>
        this.disconnectFromServer(serverId).catch((err) =>
          this.logger.error('Error disconnecting', { serverId, error: err })
        )
      )
    );
  }

  /**
   * List available tools from connected servers
   */
  async listTools(serverId?: string): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];
    const clients = serverId
      ? [this.mcpClients.get(serverId)].filter(Boolean)
      : Array.from(this.mcpClients.values());

    for (const client of clients) {
      if (client) {
        try {
          const result = await client.listTools();
          tools.push(...(result.tools as unknown as MCPTool[]));
        } catch (error) {
          this.logger.error('Error listing tools', { error });
        }
      }
    }

    return tools;
  }

  /**
   * Call a tool
   */
  async callTool(
    toolName: string,
    args?: Record<string, unknown>,
    serverId?: string
  ): Promise<MCPToolResult> {
    const client = serverId
      ? this.mcpClients.get(serverId)
      : Array.from(this.mcpClients.values())[0];

    if (!client) {
      throw new Error('No connected MCP server');
    }

    try {
      const result = await client.callTool({ name: toolName, arguments: args || {} });
      return result as unknown as MCPToolResult;
    } catch (error) {
      this.logger.error('Error calling tool', { toolName, error });
      throw error;
    }
  }

  /**
   * List available resources
   */
  async listResources(serverId?: string): Promise<MCPResource[]> {
    const resources: MCPResource[] = [];
    const clients = serverId
      ? [this.mcpClients.get(serverId)].filter(Boolean)
      : Array.from(this.mcpClients.values());

    for (const client of clients) {
      if (client) {
        try {
          const result = await client.listResources();
          resources.push(...(result.resources as unknown as MCPResource[]));
        } catch (error) {
          this.logger.error('Error listing resources', { error });
        }
      }
    }

    return resources;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string, serverId?: string): Promise<string> {
    const client = serverId
      ? this.mcpClients.get(serverId)
      : Array.from(this.mcpClients.values())[0];

    if (!client) {
      throw new Error('No connected MCP server');
    }

    try {
      const result = await client.readResource({ uri });
      const content = result.contents[0] as { text?: string };
      return content?.text || '';
    } catch (error) {
      this.logger.error('Error reading resource', { uri, error });
      throw error;
    }
  }

  /**
   * List available prompts
   */
  async listPrompts(serverId?: string): Promise<MCPPrompt[]> {
    const prompts: MCPPrompt[] = [];
    const clients = serverId
      ? [this.mcpClients.get(serverId)].filter(Boolean)
      : Array.from(this.mcpClients.values());

    for (const client of clients) {
      if (client) {
        try {
          const result = await client.listPrompts();
          prompts.push(...(result.prompts as unknown as MCPPrompt[]));
        } catch (error) {
          this.logger.error('Error listing prompts', { error });
        }
      }
    }

    return prompts;
  }

  /**
   * Get a prompt
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>,
    serverId?: string
  ): Promise<{ messages: Array<{ role: string; content: string }> }> {
    const client = serverId
      ? this.mcpClients.get(serverId)
      : Array.from(this.mcpClients.values())[0];

    if (!client) {
      throw new Error('No connected MCP server');
    }

    try {
      const result = await client.getPrompt({ name, arguments: args });
      return result as unknown as { messages: Array<{ role: string; content: string }> };
    } catch (error) {
      this.logger.error('Error getting prompt', { name, error });
      throw error;
    }
  }

  /**
   * Chat with Ollama and use MCP tools
   */
  async chat(message: string, options?: ChatOptions): Promise<ChatResponse> {
    const session = await this.sessionManager.getOrCreateSession();

    // Add user message to conversation
    const userEntry = this.sessionManager.addConversationEntry(session.id, {
      role: 'user',
      content: message,
    });

    try {
      // Get available tools
      const tools = await this.listTools(options?.serverId);

      // Prepare system prompt with tool descriptions
      const systemPrompt = this.buildSystemPrompt(tools, options?.systemPrompt);

      // Get conversation history if needed
      const history = options?.includeHistory
        ? this.sessionManager.getConversationHistory(session.id, 10)
        : [];

      // Call Ollama with tool descriptions
      const response = (await this.ollamaClient.chat({
        model: options?.model || this.config.ollama?.model || 'llama2',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({
            role: h.role as 'system' | 'user' | 'assistant',
            content: h.content,
          })),
          { role: 'user', content: message },
        ],
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
        },
      })) as ChatCompletionResponse | void;

      // Parse response for tool calls
      const toolCalls = this.parseToolCalls(response?.message?.content || '');

      // Execute tool calls if any
      const toolResults: MCPToolResult[] = [];
      for (const toolCall of toolCalls) {
        const toolEntry = this.sessionManager.addToolCall(session.id, userEntry.id, {
          toolName: toolCall.name,
          arguments: toolCall.arguments || {},
        });

        try {
          const result = await this.callTool(toolCall.name, toolCall.arguments, options?.serverId);

          toolResults.push(result);
          this.sessionManager.updateToolCallResult(session.id, toolEntry.id, result);
        } catch (error) {
          this.sessionManager.updateToolCallResult(
            session.id,
            toolEntry.id,
            undefined,
            (error as Error).message
          );
        }
      }

      // If we have tool results, generate final response
      let finalResponse = response?.message?.content || '';
      if (toolResults.length > 0) {
        const toolContext = this.formatToolResults(toolResults);
        const finalChat = (await this.ollamaClient.chat({
          model: options?.model || this.config.ollama?.model || 'llama2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
            { role: 'assistant', content: response?.message?.content || '' },
            {
              role: 'user',
              content: `Tool results:\n${toolContext}\n\nPlease provide a final response based on these results.`,
            },
          ],
          stream: false,
        })) as ChatCompletionResponse | void;

        finalResponse = finalChat?.message?.content || '';
      }

      // Add assistant response to conversation
      this.sessionManager.addConversationEntry(session.id, {
        role: 'assistant',
        content: finalResponse,
        toolCalls:
          toolCalls.length > 0
            ? toolResults.map((r, i) => ({
                id: `tool_${i}`,
                toolName: toolCalls[i].name,
                arguments: toolCalls[i].arguments || {},
                result: r,
              }))
            : undefined,
      });

      return {
        message: finalResponse,
        toolCalls: toolResults.map((r, i) => ({
          id: `tool_${i}`,
          toolName: toolCalls[i]?.name || 'unknown',
          arguments: toolCalls[i]?.arguments || {},
          result: r,
        })),
        usage: response?.eval_count
          ? {
              promptTokens: response?.prompt_eval_count || 0,
              completionTokens: response?.eval_count || 0,
              totalTokens: (response?.prompt_eval_count || 0) + (response?.eval_count || 0),
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error('Chat error', { error });
      throw error;
    }
  }

  /**
   * Get session information
   */
  getSession(): ClientSession | undefined {
    return this.sessionManager.getActiveSession();
  }

  /**
   * Get connected servers
   */
  getConnectedServers(): ConnectionInfo[] {
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      return [];
    }

    return Array.from(session.connections.values());
  }

  /**
   * Setup event forwarding from session manager
   */
  private setupEventForwarding(): void {
    this.sessionManager.on('sessionCreated', (session) => {
      this.emit('sessionCreated', session);
    });

    this.sessionManager.on('messageReceived', (entry) => {
      this.emit('messageReceived', entry);
    });

    this.sessionManager.on('toolCallStarted', (toolCall) => {
      this.emit('toolCallStarted', toolCall);
    });

    this.sessionManager.on('toolCallCompleted', (toolCall) => {
      this.emit('toolCallCompleted', toolCall);
    });
  }

  /**
   * Setup client handlers
   */
  private setupClientHandlers(serverId: string, client: Client, _session: ClientSession): void {
    // Handle notifications from the server
    const clientWithEvents = client as Client & {
      on: (event: string, handler: (data: unknown) => void) => void;
    };
    clientWithEvents.on('notification', (notification: unknown) => {
      const notif = notification as { method: string; params?: unknown };
      const { method, params } = notif;
      this.logger.debug('Notification received', { serverId, method, params });

      switch (method) {
        case 'notifications/tools/list_changed':
          this.emit('toolsUpdated', serverId, params);
          break;
        case 'notifications/resources/list_changed':
          this.emit('resourcesUpdated', serverId, params);
          break;
        case 'notifications/prompts/list_changed':
          this.emit('promptsUpdated', serverId, params);
          break;
      }
    });
  }

  /**
   * Discover server capabilities
   */
  private async discoverServerCapabilities(
    serverId: string,
    client: Client,
    session: ClientSession
  ): Promise<void> {
    try {
      // Get available tools
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools as MCPTool[];

      // Get available resources
      let resources: MCPResource[] = [];
      try {
        const resourcesResult = await client.listResources();
        resources = resourcesResult.resources as MCPResource[];
      } catch {
        // Server might not support resources
      }

      // Get available prompts
      let prompts: MCPPrompt[] = [];
      try {
        const promptsResult = await client.listPrompts();
        prompts = promptsResult.prompts as MCPPrompt[];
      } catch {
        // Server might not support prompts
      }

      // Update session state
      this.sessionManager.updateMCPState(session.id, {
        availableTools: tools,
        availableResources: resources,
        availablePrompts: prompts,
        isConnected: true,
      });

      this.logger.info('Server capabilities discovered', {
        serverId,
        tools: tools.length,
        resources: resources.length,
        prompts: prompts.length,
      });
    } catch (error) {
      this.logger.error('Failed to discover server capabilities', { serverId, error });
    }
  }

  /**
   * Adapt our custom transport to MCP SDK interface
   */
  private adaptTransport(transport: ITransport, serverId: string): unknown {
    // Create a message handler for this transport
    const messageHandler = new MessageHandler({
      debug: this.config.logging?.level === 'debug',
    });

    this.messageHandlers.set(serverId, messageHandler);

    // Return an adapter object that matches MCP SDK's transport interface
    return {
      start: async (): Promise<void> => {
        await transport.connect();

        // Forward data from transport to message handler
        transport.on('data', (data) => {
          messageHandler.processMessage(data);
        });

        // Forward send requests from message handler to transport
        messageHandler.on('send', async (message) => {
          await transport.send(message);
        });
      },

      close: async (): Promise<void> => {
        await transport.disconnect();
        messageHandler.cleanup();
      },

      send: async (message: unknown): Promise<void> => {
        await transport.send(JSON.stringify(message));
      },

      // MCP SDK expects these event emitters
      onmessage: (handler: (message: unknown) => void): void => {
        messageHandler.on('request', handler);
        messageHandler.on('response', handler);
        messageHandler.on('notification', handler);
      },

      onerror: (handler: (error: Error) => void): void => {
        transport.on('error', handler);
      },

      onclose: (handler: () => void): void => {
        transport.on('disconnect', handler);
      },
    };
  }

  /**
   * Generate server ID
   */
  private generateServerId(options: ServerConnectionOptions): string {
    const random = Math.random().toString(36).substring(7);

    if (options.type === 'stdio') {
      return `mcp_stdio_${options.command}_${random}`;
    } else {
      const url = new URL(options.url);
      return `mcp_${options.type}_${url.hostname}_${random}`;
    }
  }

  /**
   * Build system prompt with tool descriptions
   */
  private buildSystemPrompt(tools: MCPTool[], customPrompt?: string): string {
    let prompt = customPrompt || 'You are a helpful assistant that can use tools to help users.';

    if (tools.length > 0) {
      prompt += '\n\nAvailable tools:\n';
      for (const tool of tools) {
        prompt += `\n- ${tool.name}: ${tool.description || 'No description'}`;
        if (tool.inputSchema?.properties) {
          const params = Object.keys(tool.inputSchema.properties).join(', ');
          prompt += ` (params: ${params})`;
        }
      }

      prompt += '\n\nTo use a tool, format your response as:\n';
      prompt += 'TOOL_CALL: tool_name\n';
      prompt += 'ARGUMENTS: {"param1": "value1", "param2": "value2"}\n';
      prompt += 'Then provide your regular response.';
    }

    return prompt;
  }

  /**
   * Parse tool calls from Ollama response
   */
  private parseToolCalls(content: string): MCPToolCall[] {
    const toolCalls: MCPToolCall[] = [];

    // Simple pattern matching for tool calls
    const toolCallPattern = /TOOL_CALL:\s*([\w-]+)\s*\nARGUMENTS:\s*({[^}]+})/g;
    let match;

    while ((match = toolCallPattern.exec(content)) !== null) {
      try {
        const toolName = match[1];
        const args = JSON.parse(match[2]);

        toolCalls.push({
          name: toolName,
          arguments: args,
        });
      } catch (error) {
        this.logger.warn('Failed to parse tool call', { match: match[0], error });
      }
    }

    return toolCalls;
  }

  /**
   * Format tool results for context
   */
  private formatToolResults(results: MCPToolResult[]): string {
    let formatted = '';

    for (const result of results) {
      if (result.content) {
        for (const content of result.content) {
          if (content.type === 'text' && content.text) {
            formatted += content.text + '\n';
          }
        }
      }
    }

    return formatted.trim();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.disconnectAll();
    await this.sessionManager.cleanup();
    await this.transportManager.cleanup();

    this.logger.info('OllamaMCPClient cleaned up');
  }
}
