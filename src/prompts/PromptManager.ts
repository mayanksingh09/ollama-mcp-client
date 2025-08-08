/**
 * Prompt Manager - Prompt template management and execution
 */

import { EventEmitter } from 'events';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Logger } from 'winston';
import winston from 'winston';
import { PromptCache } from './PromptCache';
import { PromptSampler } from './PromptSampler';
import type {
  ExtendedPrompt,
  PromptExecutionOptions,
  PromptExecutionResult,
  PromptManagerConfig,
  PromptFilterOptions,
  BatchPromptRequest,
  BatchPromptResult,
} from '../types/prompts.types';
import type { MCPPrompt } from '../types/mcp.types';

export class PromptManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private cache: PromptCache;
  private sampler: PromptSampler;
  private prompts: Map<string, ExtendedPrompt> = new Map();
  private logger: Logger;

  constructor(_config: PromptManagerConfig = {}) {
    super();
    // Config is merged but not stored as we don't use it currently

    this.cache = new PromptCache(_config.cache);
    this.sampler = new PromptSampler();

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'error',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      defaultMeta: { service: 'PromptManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
          silent: process.env.LOG_LEVEL === 'silent',
        }),
      ],
    });

    this.logger.info('PromptManager initialized');
  }

  /**
   * Register an MCP client
   */
  registerClient(serverId: string, client: Client): void {
    this.clients.set(serverId, client);
    this.discoverPrompts(serverId).catch((error) => {
      this.logger.error(`Failed to discover prompts for ${serverId}:`, error);
    });
  }

  /**
   * Discover prompts from servers
   */
  async discoverPrompts(serverId?: string): Promise<ExtendedPrompt[]> {
    const discoveredPrompts: ExtendedPrompt[] = [];

    for (const [id, client] of this.clients.entries()) {
      if (serverId && id !== serverId) continue;

      try {
        const result = await client.listPrompts();
        const prompts = result.prompts as MCPPrompt[];

        const extendedPrompts = prompts.map(
          (prompt) =>
            ({
              ...prompt,
              serverId: id,
              isAvailable: true,
              usageCount: 0,
              successRate: 100,
            }) as ExtendedPrompt
        );

        for (const prompt of extendedPrompts) {
          const key = this.getPromptKey(prompt.name, id);
          this.prompts.set(key, prompt);
        }

        discoveredPrompts.push(...extendedPrompts);
        this.emit('promptsDiscovered', { serverId: id, prompts });
      } catch (error) {
        this.logger.error(`Failed to discover prompts from ${id}:`, error);
      }
    }

    return discoveredPrompts;
  }

  /**
   * List prompts with filtering
   */
  async listPrompts(filter?: PromptFilterOptions): Promise<ExtendedPrompt[]> {
    let prompts = Array.from(this.prompts.values());

    if (filter) {
      if (filter.serverId) {
        prompts = prompts.filter((p) => p.serverId === filter.serverId);
      }
      if (filter.category) {
        prompts = prompts.filter((p) => p.category === filter.category);
      }
      if (filter.tags && filter.tags.length > 0) {
        prompts = prompts.filter(
          (p) => p.tags && filter.tags!.some((tag) => p.tags!.includes(tag))
        );
      }
    }

    return prompts;
  }

  /**
   * Execute a prompt
   */
  async executePrompt(
    name: string,
    parameters?: Record<string, unknown>,
    options?: PromptExecutionOptions,
    serverId?: string
  ): Promise<PromptExecutionResult> {
    const startTime = Date.now();
    const cacheKey = this.cache.generateKey(name, parameters || {});

    // Check cache
    if (options?.cache !== false) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.emit('promptExecution', {
          type: 'cached',
          promptName: name,
          serverId: serverId || 'default',
          fromCache: true,
          timestamp: new Date(),
        });
        return cached.result;
      }
    }

    // Find client
    const client = serverId ? this.clients.get(serverId) : this.clients.values().next().value;
    if (!client) {
      throw new Error('No MCP client available');
    }

    try {
      const result = await client.getPrompt({
        name,
        arguments: parameters as Record<string, string> | undefined,
      });

      // Parse the messages from the result
      const resultMessages = result.messages || [];
      const parsedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      for (const msg of resultMessages) {
        if (typeof msg === 'object' && msg !== null && 'role' in msg) {
          const role = (msg as { role?: string }).role;
          let content = '';

          // Handle different content formats
          const msgContent = (msg as { content?: unknown }).content;
          if (typeof msgContent === 'string') {
            content = msgContent;
          } else if (
            typeof msgContent === 'object' &&
            msgContent !== null &&
            'text' in msgContent
          ) {
            content = (msgContent as { text?: string }).text || '';
          }

          if (role === 'system' || role === 'user' || role === 'assistant') {
            parsedMessages.push({ role, content });
          }
        }
      }

      const executionResult: PromptExecutionResult = {
        promptName: name,
        messages: parsedMessages,
        parameters,
        executionTime: Date.now() - startTime,
        serverId: serverId || 'default',
        timestamp: new Date(),
      };

      // Apply sampling if configured
      if (options) {
        executionResult.messages = await this.sampler.sample(executionResult.messages, options);
      }

      // Cache result
      if (options?.cache !== false) {
        await this.cache.set(cacheKey, executionResult, options?.cacheTTL);
      }

      this.emit('promptExecution', {
        type: 'completed',
        promptName: name,
        serverId: serverId || 'default',
        result: executionResult,
        timestamp: new Date(),
      });

      return executionResult;
    } catch (error) {
      this.emit('promptExecution', {
        type: 'failed',
        promptName: name,
        serverId: serverId || 'default',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Execute batch prompts
   */
  async executeBatch(request: BatchPromptRequest): Promise<BatchPromptResult> {
    const results: PromptExecutionResult[] = [];
    const errors: Array<{ promptName: string; error: Error }> = [];
    let succeeded = 0;
    let failed = 0;
    let cached = 0;

    for (const prompt of request.prompts) {
      try {
        const result = await this.executePrompt(prompt.name, prompt.parameters, prompt.options);
        results.push(result);
        succeeded++;
        if (result.fromCache) cached++;
      } catch (error) {
        errors.push({ promptName: prompt.name, error: error as Error });
        failed++;
        if (request.stopOnError) break;
      }
    }

    return {
      batchId: request.id,
      results,
      summary: {
        total: request.prompts.length,
        succeeded,
        failed,
        cached,
        totalTokens: 0,
        totalTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0),
        averageTime:
          results.length > 0
            ? results.reduce((sum, r) => sum + (r.executionTime || 0), 0) / results.length
            : 0,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get prompt key
   */
  private getPromptKey(name: string, serverId: string): string {
    return `${name}:${serverId}`;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.cache.cleanup();
    this.clients.clear();
    this.prompts.clear();
    this.logger.info('PromptManager cleaned up');
  }
}
