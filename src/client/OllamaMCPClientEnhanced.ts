/**
 * Enhanced MCP Client with Bridge Components
 */

import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { OllamaClient } from '../ollama/OllamaClient';
import { TransportManager } from '../transport/TransportManager';
import { SessionManager } from '../session/SessionManager';
import { MessageHandler } from '../protocol/MessageHandler';
import { ToolManager } from '../tools/ToolManager';
import { ResourceManager } from '../resources/ResourceManager';
import { PromptManager } from '../prompts/PromptManager';

import {
  ConversationManager,
  ContextWindowManager,
  ToolDecisionEngine,
  ToolInvocationFormatter,
  ResultInjector,
  FunctionCallingSimulator,
} from '../bridge';

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
import type { MCPTool, MCPResource, MCPPrompt, MCPToolResult } from '../types/mcp.types';
import type { ChatCompletionResponse, Message } from '../ollama/types';
import type { BridgeConfig } from '../bridge/types';
import type { Logger } from 'winston';
import winston from 'winston';

export interface EnhancedClientConfig extends OllamaMCPClientConfig {
  bridge?: BridgeConfig;
}

export class OllamaMCPClientEnhanced extends EventEmitter {
  private ollamaClient: OllamaClient;
  private transportManager: TransportManager;
  private sessionManager: SessionManager;
  private toolManager: ToolManager;
  private resourceManager: ResourceManager;
  private promptManager: PromptManager;

  private conversationManager: ConversationManager;
  private contextWindowManager: ContextWindowManager;
  private toolDecisionEngine: ToolDecisionEngine;
  private toolInvocationFormatter: ToolInvocationFormatter;
  private resultInjector: ResultInjector;
  private functionCallingSimulator: FunctionCallingSimulator;

  private messageHandlers: Map<string, MessageHandler> = new Map();
  private mcpClients: Map<string, Client> = new Map();
  private config: EnhancedClientConfig;
  private logger: Logger;

  constructor(config: EnhancedClientConfig = {}) {
    super();
    this.config = config;

    this.ollamaClient = new OllamaClient(config.ollama);

    this.transportManager = TransportManager.getInstance();
    this.sessionManager = new SessionManager({
      persist: config.session?.persist,
      storagePath: config.session?.storagePath,
    });

    this.toolManager = new ToolManager(config.tools);
    this.resourceManager = new ResourceManager(config.resources);
    this.promptManager = new PromptManager(config.prompts);

    this.conversationManager = new ConversationManager(config.bridge?.conversation);
    this.contextWindowManager = new ContextWindowManager();
    this.toolDecisionEngine = new ToolDecisionEngine(config.bridge?.toolSelection);
    this.toolInvocationFormatter = new ToolInvocationFormatter();
    this.resultInjector = new ResultInjector(config.bridge?.injection);
    this.functionCallingSimulator = new FunctionCallingSimulator(config.bridge?.functionCalling);

    this.logger = winston.createLogger({
      level: config.logging?.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'OllamaMCPClientEnhanced' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });

    this.setupEventForwarding();
    this.logger.info('OllamaMCPClientEnhanced initialized with bridge components');
  }

  async connectToServer(options: ServerConnectionOptions): Promise<string> {
    const session = await this.sessionManager.getOrCreateSession();
    const serverId = this.generateServerId(options);

    try {
      this.logger.info('Connecting to MCP server', { serverId, type: options.type });

      let transport: unknown;

      if (options.type === 'stdio') {
        transport = new StdioClientTransport({
          command: options.command,
          args: options.args,
          env: options.env,
        });
      } else {
        const customTransport = this.transportManager.createTransport(
          options,
          this.config.logging?.level === 'debug'
        );
        transport = this.adaptTransport(customTransport, serverId);
      }

      const client = new Client(
        {
          name: this.config.mcp?.name || 'ollama-mcp-client-enhanced',
          version: this.config.mcp?.version || '2.0.0',
        },
        {
          capabilities: (this.config.mcp?.capabilities || {}) as Record<string, unknown>,
        }
      );

      await client.connect(transport as Parameters<typeof client.connect>[0]);

      this.mcpClients.set(serverId, client);
      this.setupClientHandlers(serverId, client, session);

      this.toolManager.registerClient(serverId, client);
      this.resourceManager.registerClient(serverId, client);
      this.promptManager.registerClient(serverId, client);

      const connectionInfo: ConnectionInfo = {
        serverId,
        serverName: options.type === 'stdio' ? options.command : options.url,
        connectionType: options.type,
        state: ConnectionState.CONNECTED,
        connectedAt: new Date(),
      };

      this.sessionManager.updateConnection(session.id, serverId, connectionInfo);

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
   * Auto-detect the first available Ollama model
   */
  private async getDefaultModel(): Promise<string> {
    try {
      const modelsResponse = await this.ollamaClient.listModels();
      const models = modelsResponse.models || [];

      if (models.length === 0) {
        throw new Error(
          'No Ollama models found. Please install a model first using: ollama pull <model-name>'
        );
      }

      // Return the first available model
      return models[0].name;
    } catch (error) {
      this.logger.error('Failed to auto-detect Ollama model', { error });
      throw new Error(
        'Failed to detect available Ollama models. Please ensure Ollama is running and has at least one model installed.'
      );
    }
  }

  async chat(message: string, options?: ChatOptions): Promise<ChatResponse> {
    const conversationEntry = this.conversationManager.addEntry('user', message);

    try {
      const extendedTools = await this.toolManager.listTools(
        options?.serverId ? { serverId: options.serverId } : undefined
      );
      const tools = extendedTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));

      // Determine model to use: from options, config, or auto-detect
      let modelName = options?.model || this.config.ollama?.model;
      if (!modelName) {
        modelName = await this.getDefaultModel();
      }

      let messages: Message[];
      if (this.shouldUseFunctionSimulator(modelName)) {
        messages = this.functionCallingSimulator.preparePrompt(
          message,
          tools,
          this.conversationManager.getMessages()
        );
      } else {
        messages = this.prepareMessagesWithContext(message, tools, modelName, options);
      }

      const response = (await this.ollamaClient.chat({
        model: modelName,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
        },
      })) as ChatCompletionResponse | void;

      if (!response?.message?.content) {
        throw new Error('No response from Ollama');
      }

      let enhancedContent = response.message.content;
      if (this.shouldUseFunctionSimulator(modelName)) {
        enhancedContent = this.functionCallingSimulator.enhanceResponse(enhancedContent, tools);
      }

      const toolDecision = await this.toolDecisionEngine.analyzeResponse(
        enhancedContent,
        tools,
        message
      );

      const toolResults: Array<{ toolName: string; result: MCPToolResult }> = [];

      if (toolDecision.shouldInvoke) {
        for (const parsedCall of toolDecision.toolCalls) {
          const tool = tools.find((t) => t.name === parsedCall.toolName);
          if (!tool) continue;

          try {
            const formattedCall = this.toolInvocationFormatter.formatForMCP(parsedCall, tool);

            const toolCallRecord = this.conversationManager.addToolCall(
              formattedCall.name,
              formattedCall.arguments || {},
              conversationEntry.id
            );

            const startTime = Date.now();
            const result = await this.toolManager.executeTool(
              formattedCall.name,
              formattedCall.arguments,
              { serverId: options?.serverId }
            );

            const mcpResult: MCPToolResult = {
              content: result.content,
              isError: result.isError,
              metadata: result.metadata,
            };

            toolResults.push({ toolName: formattedCall.name, result: mcpResult });

            this.conversationManager.updateToolCallResult(
              toolCallRecord.id,
              mcpResult,
              undefined,
              Date.now() - startTime
            );
          } catch (error) {
            this.logger.error('Tool execution failed', {
              tool: parsedCall.toolName,
              error,
            });
          }
        }
      }

      let finalResponse = enhancedContent;
      if (toolResults.length > 0) {
        const injectedResults = this.resultInjector.injectBatch(toolResults, enhancedContent);

        const finalMessages = [
          ...messages,
          { role: 'assistant' as const, content: enhancedContent },
          { role: 'user' as const, content: `Tool results:\n${injectedResults}` },
        ];

        const contextWindow = this.contextWindowManager.manageWindow(finalMessages, modelName);

        const finalChat = (await this.ollamaClient.chat({
          model: modelName,
          messages: contextWindow.messages,
          stream: false,
        })) as ChatCompletionResponse | void;

        finalResponse = finalChat?.message?.content || enhancedContent;
      }

      this.conversationManager.addEntry('assistant', finalResponse, undefined, {
        toolCalls: toolDecision.toolCalls,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      });

      return {
        message: finalResponse,
        toolCalls: toolResults.map((r, i) => ({
          id: `tool_${i}`,
          toolName: r.toolName,
          arguments: toolDecision.toolCalls[i]?.arguments || {},
          result: r.result,
        })),
        usage: response?.eval_count
          ? {
              promptTokens: response?.prompt_eval_count || 0,
              completionTokens: response?.eval_count || 0,
              totalTokens: (response?.prompt_eval_count || 0) + (response?.eval_count || 0),
            }
          : undefined,
        metadata: {
          toolDecision: {
            confidence: toolDecision.confidence,
            reasoning: toolDecision.reasoning,
          },
          contextTokens: this.conversationManager.getTokenCount(),
        },
      } as ChatResponse & { metadata?: Record<string, unknown> };
    } catch (error) {
      this.logger.error('Chat error', { error });
      throw error;
    }
  }

  private prepareMessagesWithContext(
    message: string,
    tools: MCPTool[],
    modelName: string,
    options?: ChatOptions
  ): Message[] {
    const conversationHistory = this.conversationManager.getMessages(true);

    const systemPrompt = this.buildEnhancedSystemPrompt(tools, options?.systemPrompt);

    const allMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    const contextWindow = this.contextWindowManager.manageWindow(allMessages, modelName, 500);

    return contextWindow.messages;
  }

  private buildEnhancedSystemPrompt(tools: MCPTool[], customPrompt?: string): string {
    let prompt =
      customPrompt ||
      'You are an intelligent assistant with access to various tools. ' +
        'Analyze user requests carefully and use tools when appropriate.';

    if (tools.length > 0) {
      prompt += '\n\nAvailable tools:\n';
      for (const tool of tools) {
        prompt += `\n- ${tool.name}: ${tool.description || 'No description'}`;
        if (tool.inputSchema?.properties) {
          const params = Object.keys(tool.inputSchema.properties).join(', ');
          prompt += ` (params: ${params})`;
        }
      }

      prompt +=
        '\n\nWhen you need to use a tool, you can format your response in any of these ways:\n';
      prompt += '1. JSON: ```json{"tool_name": "name", "arguments": {...}}```\n';
      prompt += '2. Structured: TOOL_CALL: name\\nARGUMENTS: {...}\n';
      prompt += '3. Natural: "I\'ll use the [tool_name] tool with [parameters]"\n';
      prompt += '\nI will detect and execute the appropriate tools automatically.';
    }

    return prompt;
  }

  private shouldUseFunctionSimulator(modelName: string): boolean {
    const modelsWithNativeFunctions = ['gpt-4', 'claude', 'gemini'];
    return !modelsWithNativeFunctions.some((m) => modelName.toLowerCase().includes(m));
  }

  async getConversationSummary(): Promise<string> {
    return this.conversationManager.exportContext();
  }

  async importConversation(data: string): Promise<void> {
    const contextId = this.conversationManager.importContext(data);
    this.conversationManager.switchContext(contextId);
  }

  getContextStatistics(): {
    utilization: number;
    messageCount: number;
    tokenCount: number;
  } {
    // Try to use configured model, otherwise use a default context size
    const modelName = this.config.ollama?.model || 'default';
    const messages = this.conversationManager.getMessages();
    const window = this.contextWindowManager.manageWindow(messages, modelName);
    const stats = this.contextWindowManager.getStatistics(window);

    return {
      utilization: stats.utilization,
      messageCount: stats.messageCount,
      tokenCount: this.conversationManager.getTokenCount(),
    };
  }

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

  async listTools(serverId?: string): Promise<MCPTool[]> {
    const extendedTools = await this.toolManager.listTools(serverId ? { serverId } : undefined);
    return extendedTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(
    toolName: string,
    args?: Record<string, unknown>,
    serverId?: string
  ): Promise<MCPToolResult> {
    const result = await this.toolManager.executeTool(toolName, args, { serverId });
    return {
      content: result.content,
      isError: result.isError,
      metadata: result.metadata,
    };
  }

  async listResources(serverId?: string): Promise<MCPResource[]> {
    const result = await this.resourceManager.listResources(
      serverId ? { filter: { serverId } } : undefined
    );
    return result.resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
      metadata: r.metadata,
    }));
  }

  async readResource(uri: string, serverId?: string): Promise<string> {
    const result = await this.resourceManager.readResource(uri, serverId);
    return result.text || '';
  }

  async listPrompts(serverId?: string): Promise<MCPPrompt[]> {
    const extendedPrompts = await this.promptManager.listPrompts(
      serverId ? { serverId } : undefined
    );
    return extendedPrompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }));
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
    serverId?: string
  ): Promise<{ messages: Array<{ role: string; content: string }> }> {
    const result = await this.promptManager.executePrompt(name, args, undefined, serverId);
    return { messages: result.messages };
  }

  getSession(): ClientSession | undefined {
    return this.sessionManager.getActiveSession();
  }

  getConnectedServers(): ConnectionInfo[] {
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      return [];
    }

    return Array.from(session.connections.values());
  }

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

    this.conversationManager.on('entryAdded', (entry) => {
      this.emit('conversationUpdated', entry);
    });

    this.conversationManager.on('conversationSummarized', (data) => {
      this.emit('conversationSummarized', data);
    });
  }

  private setupClientHandlers(serverId: string, client: Client, _session: ClientSession): void {
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

  private async discoverServerCapabilities(
    serverId: string,
    client: Client,
    session: ClientSession
  ): Promise<void> {
    try {
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools as MCPTool[];

      let resources: MCPResource[] = [];
      try {
        const resourcesResult = await client.listResources();
        resources = resourcesResult.resources as MCPResource[];
      } catch {
        // Server might not support resources
      }

      let prompts: MCPPrompt[] = [];
      try {
        const promptsResult = await client.listPrompts();
        prompts = promptsResult.prompts as MCPPrompt[];
      } catch {
        // Server might not support prompts
      }

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

  private adaptTransport(transport: ITransport, serverId: string): unknown {
    const messageHandler = new MessageHandler({
      debug: this.config.logging?.level === 'debug',
    });

    this.messageHandlers.set(serverId, messageHandler);

    return {
      start: async (): Promise<void> => {
        await transport.connect();

        transport.on('data', (data) => {
          messageHandler.processMessage(data);
        });

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

  private generateServerId(options: ServerConnectionOptions): string {
    const random = Math.random().toString(36).substring(7);

    if (options.type === 'stdio') {
      return `mcp_stdio_${options.command}_${random}`;
    } else {
      const url = new URL(options.url);
      return `mcp_${options.type}_${url.hostname}_${random}`;
    }
  }

  async cleanup(): Promise<void> {
    await this.disconnectAll();
    await this.sessionManager.cleanup();
    await this.transportManager.cleanup();
    await this.toolManager.cleanup();
    await this.resourceManager.cleanup();
    await this.promptManager.cleanup();

    this.logger.info('OllamaMCPClientEnhanced cleaned up');
  }
}
