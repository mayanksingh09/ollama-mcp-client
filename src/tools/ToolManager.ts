/**
 * Tool Manager - Core tool discovery, execution, and management
 */

import { EventEmitter } from 'events';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Logger } from 'winston';
import winston from 'winston';
import { ToolValidator } from './ToolValidator';
import { ToolRegistry } from './ToolRegistry';
import type {
  ExtendedTool,
  ToolExecutionOptions,
  ToolExecutionResult,
  ToolExecutionContext,
  ToolManagerConfig,
  ToolDiscoveryEvent,
  ToolExecutionEvent,
  BatchToolRequest,
  BatchToolResult,
  ToolFilterOptions,
  ToolChain,
  ToolChainStep,
  ToolChainContext,
} from '../types/tools.types';
import type { MCPTool, MCPToolResult } from '../types/mcp.types';

export class ToolManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private validator: ToolValidator;
  private registry: ToolRegistry;
  private config: ToolManagerConfig;
  private logger: Logger;
  private executionQueue: Map<string, ToolExecutionContext> = new Map();
  private activeExecutions: Map<string, AbortController> = new Map();
  private toolChains: Map<string, ToolChain> = new Map();

  constructor(config: ToolManagerConfig = {}) {
    super();
    this.config = {
      enableCaching: true,
      enableParallelExecution: true,
      maxParallelExecutions: 5,
      queueSize: 100,
      maxChainDepth: 10,
      ...config,
    };

    this.validator = new ToolValidator();
    this.registry = new ToolRegistry(config.registry);

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'ToolManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
          silent: process.env.LOG_LEVEL === 'silent',
        }),
      ],
    });

    this.setupEventHandlers();
    this.logger.info('ToolManager initialized');
  }

  /**
   * Register an MCP client for tool discovery
   */
  registerClient(serverId: string, client: Client): void {
    this.clients.set(serverId, client);
    this.logger.info(`Registered client for server: ${serverId}`);

    // Discover tools from the newly registered client
    this.discoverTools(serverId).catch((error) => {
      this.logger.error(`Failed to discover tools for ${serverId}:`, error);
    });
  }

  /**
   * Unregister an MCP client
   */
  unregisterClient(serverId: string): void {
    this.clients.delete(serverId);
    this.registry.removeToolsByServer(serverId);
    this.logger.info(`Unregistered client for server: ${serverId}`);
  }

  /**
   * Discover tools from a specific server or all servers
   */
  async discoverTools(serverId?: string): Promise<ExtendedTool[]> {
    const discoveredTools: ExtendedTool[] = [];

    for (const [id, client] of this.clients.entries()) {
      if (serverId && id !== serverId) continue;
      if (!client) continue;

      try {
        const result = await client.listTools();
        const tools = result.tools as MCPTool[];

        const extendedTools = tools.map(
          (tool) =>
            ({
              ...tool,
              serverId: id,
              lastUpdated: new Date(),
              isAvailable: true,
              usageCount: 0,
              avgExecutionTime: 0,
              successRate: 100,
            }) as ExtendedTool
        );

        // Register tools in the registry
        for (const tool of extendedTools) {
          this.registry.registerTool(tool);
        }

        discoveredTools.push(...extendedTools);

        // Emit discovery event
        const event: ToolDiscoveryEvent = {
          type: 'discovered',
          serverId: id,
          tools,
          timestamp: new Date(),
        };
        this.emit('toolsDiscovered', event);
      } catch (error) {
        this.logger.error(`Failed to discover tools from ${id}:`, error);
      }
    }

    this.logger.info(`Discovered ${discoveredTools.length} tools`);
    return discoveredTools;
  }

  /**
   * List all available tools with optional filtering
   */
  async listTools(filter?: ToolFilterOptions): Promise<ExtendedTool[]> {
    return this.registry.getTools(filter);
  }

  /**
   * Get a specific tool by name
   */
  async getTool(name: string, serverId?: string): Promise<ExtendedTool | undefined> {
    return this.registry.getTool(name, serverId);
  }

  /**
   * Execute a tool with validation and error handling
   */
  async executeTool(
    toolName: string,
    parameters?: Record<string, unknown>,
    options: ToolExecutionOptions = {},
    _context?: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    // Get tool definition
    const tool = await this.getTool(toolName, options.serverId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Validate parameters if requested
    if (options.validateParams !== false) {
      const validation = await this.validator.validate(tool, parameters || {});
      if (!validation.isValid) {
        throw new Error(`Parameter validation failed: ${JSON.stringify(validation.errors)}`);
      }
      parameters = validation.sanitizedParams || parameters;
    }

    // Check execution queue
    if (this.executionQueue.size >= (this.config.queueSize || 100)) {
      throw new Error('Execution queue is full');
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort());
    }
    this.activeExecutions.set(executionId, abortController);

    // Emit execution started event
    this.emitExecutionEvent({
      type: 'started',
      executionId,
      toolName,
      serverId: tool.serverId,
      timestamp: new Date(),
    });

    try {
      // Update progress
      if (options.onProgress) {
        options.onProgress({
          status: 'executing',
          percentage: 50,
          message: `Executing ${toolName}`,
          timestamp: new Date(),
        });
      }

      // Execute tool with retry logic
      const result = await this.executeWithRetry(tool, parameters, options, abortController.signal);

      // Update tool statistics
      this.registry.updateToolStats(toolName, tool.serverId, {
        executionTime: Date.now() - startTime,
        success: true,
      });

      // Create execution result
      const executionResult: ToolExecutionResult = {
        ...result,
        toolName,
        executionTime: Date.now() - startTime,
        serverId: tool.serverId,
        timestamp: new Date(),
        retryCount: options.retries || 0,
      };

      // Emit completion event
      this.emitExecutionEvent({
        type: 'completed',
        executionId,
        toolName,
        serverId: tool.serverId,
        result: executionResult,
        timestamp: new Date(),
      });

      return executionResult;
    } catch (error) {
      // Update tool statistics
      this.registry.updateToolStats(toolName, tool.serverId, {
        executionTime: Date.now() - startTime,
        success: false,
      });

      // Emit failure event
      this.emitExecutionEvent({
        type: 'failed',
        executionId,
        toolName,
        serverId: tool.serverId,
        error: error as Error,
        timestamp: new Date(),
      });

      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute a batch of tools
   */
  async executeBatch(request: BatchToolRequest): Promise<BatchToolResult> {
    const startTime = Date.now();
    const results: ToolExecutionResult[] = [];
    const errors: Array<{ toolName: string; error: Error }> = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    const executeToolWithTracking = async (tool: {
      name: string;
      parameters?: Record<string, unknown>;
      options?: ToolExecutionOptions;
    }): Promise<void> => {
      try {
        const result = await this.executeTool(tool.name, tool.parameters, tool.options);
        results.push(result);
        succeeded++;
      } catch (error) {
        errors.push({ toolName: tool.name, error: error as Error });
        failed++;

        if (request.stopOnError) {
          throw error;
        }
      }
    };

    if (request.mode === 'parallel') {
      // Execute in parallel with concurrency limit
      const maxParallel = request.maxParallel || this.config.maxParallelExecutions || 5;
      const chunks = this.chunkArray(request.tools, maxParallel);

      for (const chunk of chunks) {
        await Promise.allSettled(chunk.map(executeToolWithTracking));

        if (request.stopOnError && errors.length > 0) {
          skipped = request.tools.length - succeeded - failed;
          break;
        }
      }
    } else {
      // Execute sequentially
      for (const tool of request.tools) {
        await executeToolWithTracking(tool);

        if (request.stopOnError && errors.length > 0) {
          skipped = request.tools.length - succeeded - failed;
          break;
        }
      }
    }

    const totalTime = Date.now() - startTime;

    return {
      batchId: request.id,
      results,
      summary: {
        total: request.tools.length,
        succeeded,
        failed,
        skipped,
        totalTime,
        averageTime: results.length > 0 ? totalTime / results.length : 0,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute a tool chain
   */
  async executeChain(
    chainId: string,
    _parameters?: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<Map<string, MCPToolResult>> {
    const chain = this.toolChains.get(chainId);
    if (!chain) {
      throw new Error(`Tool chain not found: ${chainId}`);
    }

    const results = new Map<string, MCPToolResult>();
    const errors = new Map<string, Error>();
    const chainContext: ToolChainContext = {
      results,
      errors,
      currentStep: 0,
      totalSteps: chain.tools.length,
    };

    for (const step of chain.tools) {
      chainContext.currentStep++;

      // Check dependencies
      if (step.dependsOn) {
        const missingDeps = step.dependsOn.filter((dep) => !results.has(dep));
        if (missingDeps.length > 0) {
          throw new Error(`Missing dependencies for step ${step.id}: ${missingDeps.join(', ')}`);
        }
      }

      // Evaluate condition
      if (step.condition) {
        const shouldExecute = this.evaluateChainCondition(step.condition, chainContext);
        if (!shouldExecute) {
          this.logger.debug(`Skipping step ${step.id} due to condition`);
          continue;
        }
      }

      // Resolve parameters
      const resolvedParams = this.resolveChainParameters(
        step.parameters as Record<string, unknown> | undefined,
        chainContext
      );

      try {
        // Execute the tool
        const result = await this.executeTool(
          step.toolName,
          resolvedParams as Record<string, unknown>,
          { validateParams: true },
          context
        );

        // Transform result if needed
        let transformedResult = result;
        if (step.transform) {
          transformedResult = step.transform(result) as ToolExecutionResult;
        }

        results.set(step.id, transformedResult);
      } catch (error) {
        errors.set(step.id, error as Error);

        if (chain.stopOnError) {
          throw new Error(`Chain execution failed at step ${step.id}: ${(error as Error).message}`);
        }
      }
    }

    return results;
  }

  /**
   * Register a tool chain
   */
  registerChain(chain: ToolChain): void {
    this.toolChains.set(chain.id, chain);
    this.logger.info(`Registered tool chain: ${chain.id}`);
  }

  /**
   * Cancel an active execution
   */
  cancelExecution(executionId: string): boolean {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
      return true;
    }
    return false;
  }

  /**
   * Get tool statistics
   */
  getToolStats(toolName?: string, serverId?: string): unknown {
    return this.registry.getStatistics(toolName, serverId);
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    tool: ExtendedTool,
    parameters: Record<string, unknown> | undefined,
    options: ToolExecutionOptions,
    signal: AbortSignal
  ): Promise<MCPToolResult> {
    const maxRetries = options.retries || 0;
    const retryDelay = options.retryDelay || 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) {
        throw new Error('Execution cancelled');
      }

      try {
        const client = this.clients.get(tool.serverId);
        if (!client) {
          throw new Error(`Client not found for server: ${tool.serverId}`);
        }

        const result = await client.callTool({
          name: tool.name,
          arguments: parameters || {},
        });

        return result as unknown as MCPToolResult;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Tool execution attempt ${attempt + 1} failed:`, error);

        if (attempt < maxRetries) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Tool execution failed');
  }

  /**
   * Evaluate chain condition
   */
  private evaluateChainCondition(
    condition: ToolChainStep['condition'],
    context: ToolChainContext
  ): boolean {
    if (!condition) return true;

    switch (condition.type) {
      case 'always':
        return true;
      case 'success':
        return context.errors.size === 0;
      case 'failure':
        return context.errors.size > 0;
      case 'custom':
        return condition.evaluate ? condition.evaluate(context) : true;
      default:
        return true;
    }
  }

  /**
   * Resolve chain parameters with references
   */
  private resolveChainParameters(
    parameters: Record<string, unknown> | undefined,
    context: ToolChainContext
  ): Record<string, unknown> {
    if (!parameters) return {};

    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (this.isParameterReference(value)) {
        const ref = value as { $ref: string; path?: string; default?: unknown };
        const result = context.results.get(ref.$ref);

        if (result) {
          resolved[key] = ref.path ? this.extractPath(result, ref.path) : result;
        } else {
          resolved[key] = ref.default;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Check if value is a parameter reference
   */
  private isParameterReference(value: unknown): boolean {
    return typeof value === 'object' && value !== null && '$ref' in value;
  }

  /**
   * Extract value from path
   */
  private extractPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Emit execution event
   */
  private emitExecutionEvent(event: ToolExecutionEvent): void {
    this.emit('toolExecution', event);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.registry.on('toolRegistered', (tool: ExtendedTool) => {
      this.emit('toolRegistered', tool);
    });

    this.registry.on('toolUpdated', (tool: ExtendedTool) => {
      this.emit('toolUpdated', tool);
    });

    this.registry.on('toolRemoved', (toolName: string, serverId: string) => {
      this.emit('toolRemoved', { toolName, serverId });
    });
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Chunk array for parallel processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Cancel all active executions
    for (const controller of this.activeExecutions.values()) {
      controller.abort();
    }
    this.activeExecutions.clear();

    // Clear registries
    this.clients.clear();
    this.toolChains.clear();

    // Cleanup registry
    await this.registry.cleanup();

    this.logger.info('ToolManager cleaned up');
  }

  // Adapter methods for test compatibility
  async getAllTools(): Promise<MCPTool[]> {
    const extendedTools = await this.listTools();
    return extendedTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async getToolsByServer(serverId: string): Promise<MCPTool[]> {
    const extendedTools = await this.listTools({ serverId });
    return extendedTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }
}
