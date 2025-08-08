import { EventEmitter } from 'events';
import type { Message } from '../ollama/types';
import type {
  ConversationEntry,
  ConversationMessage,
  ConversationContext,
  ConversationOptions,
  ToolCallRecord,
  TokenEstimator,
} from './types';
import type { MCPToolResult } from '../types/mcp.types';

export class ConversationManager extends EventEmitter {
  private contexts: Map<string, ConversationContext> = new Map();
  private activeContextId: string | null = null;
  private options: Required<ConversationOptions>;
  private tokenEstimator: TokenEstimator;

  constructor(
    options: ConversationOptions & { maxMessages?: number } = {},
    tokenEstimator?: TokenEstimator
  ) {
    super();
    this.options = {
      maxTokens: options.maxTokens || 4096,
      maxEntries: options.maxEntries || options.maxMessages || 100,
      summarizationThreshold: options.summarizationThreshold || 3500,
      persistSession: options.persistSession || false,
      sessionId: options.sessionId || this.generateContextId(),
    };

    this.tokenEstimator = tokenEstimator || new SimpleTokenEstimator();
    this.activeContextId = this.options.sessionId;
    this.initializeContext(this.activeContextId);
  }

  private initializeContext(contextId: string): void {
    this.contexts.set(contextId, {
      id: contextId,
      entries: [],
      totalTokens: 0,
      maxTokens: this.options.maxTokens,
      metadata: {
        createdAt: new Date(),
        lastUpdated: new Date(),
      },
    });
  }

  addEntry(
    role: ConversationEntry['role'],
    content: string,
    toolCalls?: ToolCallRecord[],
    metadata?: Record<string, unknown>
  ): ConversationEntry {
    const context = this.getActiveContext();
    if (!context) {
      throw new Error('No active conversation context');
    }

    const entry: ConversationEntry = {
      id: this.generateEntryId(),
      timestamp: new Date(),
      role,
      content,
      toolCalls,
      metadata,
      tokenCount: this.tokenEstimator.estimate(content),
    };

    context.entries.push(entry);
    context.totalTokens += entry.tokenCount || 0;

    if (context.metadata) {
      context.metadata.lastUpdated = new Date();
    }

    this.manageContextSize(context);
    this.emit('entryAdded', entry);

    return entry;
  }

  addToolCall(
    toolName: string,
    args: Record<string, unknown>,
    parentEntryId?: string
  ): ToolCallRecord {
    const toolCall: ToolCallRecord = {
      id: this.generateToolCallId(),
      toolName,
      arguments: args,
      timestamp: new Date(),
    };

    if (parentEntryId) {
      const context = this.getActiveContext();
      const entry = context?.entries.find((e) => e.id === parentEntryId);
      if (entry) {
        if (!entry.toolCalls) {
          entry.toolCalls = [];
        }
        entry.toolCalls.push(toolCall);
      }
    }

    this.emit('toolCallAdded', toolCall);
    return toolCall;
  }

  updateToolCallResult(
    toolCallId: string,
    result?: MCPToolResult,
    error?: string,
    duration?: number
  ): void {
    const context = this.getActiveContext();
    if (!context) return;

    for (const entry of context.entries) {
      if (entry.toolCalls) {
        const toolCall = entry.toolCalls.find((tc) => tc.id === toolCallId);
        if (toolCall) {
          if (result) {
            toolCall.result = result;
          }
          if (error) {
            toolCall.error = error;
          }
          if (duration) {
            toolCall.duration = duration;
          }
          this.emit('toolCallUpdated', toolCall);
          return;
        }
      }
    }
  }

  getConversationHistory(limit?: number): ConversationEntry[] {
    const context = this.getActiveContext();
    if (!context) return [];

    const entries = context.entries;
    if (limit && limit < entries.length) {
      return entries.slice(-limit);
    }
    return entries;
  }

  getMessages(includeSystem = true): Message[] {
    const context = this.getActiveContext();
    if (!context) return [];

    return context.entries
      .filter((entry) => includeSystem || entry.role !== 'system')
      .map((entry) => {
        const message: Message = {
          role: entry.role as 'system' | 'user' | 'assistant',
          content: entry.content,
        };

        if (entry.toolCalls && entry.toolCalls.length > 0) {
          message.tool_calls = entry.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }

        return message;
      });
  }

  getRecentContext(tokenLimit?: number): ConversationEntry[] {
    const context = this.getActiveContext();
    if (!context) return [];

    const limit = tokenLimit || this.options.maxTokens;
    const entries: ConversationEntry[] = [];
    let tokenCount = 0;

    for (let i = context.entries.length - 1; i >= 0; i--) {
      const entry = context.entries[i];
      const entryTokens = entry.tokenCount || 0;

      if (tokenCount + entryTokens > limit) {
        break;
      }

      entries.unshift(entry);
      tokenCount += entryTokens;
    }

    return entries;
  }

  private manageContextSize(context: ConversationContext): void {
    if (context.entries.length > this.options.maxEntries) {
      const toRemove = context.entries.length - this.options.maxEntries;
      const removed = context.entries.splice(0, toRemove);

      const removedTokens = removed.reduce((sum, entry) => sum + (entry.tokenCount || 0), 0);
      context.totalTokens -= removedTokens;

      this.emit('entriesTruncated', removed);
    }

    if (context.totalTokens > this.options.summarizationThreshold) {
      this.triggerSummarization(context);
    }
  }

  private triggerSummarization(context: ConversationContext): void {
    const oldEntries = context.entries.slice(0, Math.floor(context.entries.length / 2));

    const summary = this.createSummary(oldEntries);

    const summaryEntry: ConversationEntry = {
      id: this.generateEntryId(),
      timestamp: new Date(),
      role: 'system',
      content: `Previous conversation summary: ${summary}`,
      metadata: { type: 'summary', originalCount: oldEntries.length },
      tokenCount: this.tokenEstimator.estimate(summary),
    };

    const removedTokens = oldEntries.reduce((sum, entry) => sum + (entry.tokenCount || 0), 0);

    context.entries = [summaryEntry, ...context.entries.slice(oldEntries.length)];
    context.totalTokens = context.totalTokens - removedTokens + (summaryEntry.tokenCount || 0);

    this.emit('conversationSummarized', { summary: summaryEntry, removed: oldEntries });
  }

  private createSummary(entries: ConversationEntry[]): string {
    const keyPoints: string[] = [];

    for (const entry of entries) {
      if (entry.role === 'user') {
        keyPoints.push(`User asked: ${entry.content.substring(0, 100)}`);
      } else if (entry.role === 'assistant' && entry.toolCalls) {
        const tools = entry.toolCalls.map((tc) => tc.toolName).join(', ');
        keyPoints.push(`Used tools: ${tools}`);
      }
    }

    return keyPoints.join('; ');
  }

  switchContext(contextId: string): void {
    if (!this.contexts.has(contextId)) {
      this.initializeContext(contextId);
    }
    this.activeContextId = contextId;
    this.emit('contextSwitched', contextId);
  }

  clearContext(contextId?: string): void {
    const id = contextId || this.activeContextId;
    if (id) {
      this.contexts.delete(id);
      if (id === this.activeContextId) {
        this.activeContextId = null;
      }
      this.emit('contextCleared', id);
    }
  }

  getActiveContext(): ConversationContext | undefined {
    if (!this.activeContextId) return undefined;
    return this.contexts.get(this.activeContextId);
  }

  getAllContexts(): ConversationContext[] {
    return Array.from(this.contexts.values());
  }

  exportContext(contextId?: string): string {
    const id = contextId || this.activeContextId;
    const context = id ? this.contexts.get(id) : undefined;

    if (!context) {
      throw new Error('Context not found');
    }

    return JSON.stringify(context, null, 2);
  }

  importContext(data: string): string {
    const context = JSON.parse(data) as ConversationContext;

    for (const entry of context.entries) {
      entry.timestamp = new Date(entry.timestamp);
      if (entry.toolCalls) {
        for (const toolCall of entry.toolCalls) {
          toolCall.timestamp = new Date(toolCall.timestamp);
        }
      }
    }

    this.contexts.set(context.id, context);
    this.emit('contextImported', context.id);
    return context.id;
  }

  getTokenCount(): number {
    const context = this.getActiveContext();
    return context?.totalTokens || 0;
  }

  private generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateEntryId(): string {
    return `entry_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  // Adapter methods for backward compatibility with tests
  addMessage(message: ConversationMessage): ConversationEntry {
    const timestamp = message.timestamp ? new Date(message.timestamp) : new Date();
    return this.addEntry(message.role, message.content, message.toolCalls, {
      ...message.metadata,
      originalTimestamp: timestamp,
    });
  }

  clearHistory(): void {
    const context = this.getActiveContext();
    if (context) {
      context.entries = [];
      context.totalTokens = 0;
      if (context.metadata) {
        context.metadata.lastUpdated = new Date();
      }
      this.emit('historyCleared');
    }
  }

  getMessageCount(): number {
    const context = this.getActiveContext();
    return context?.entries.length || 0;
  }

  getSummary(): string {
    const context = this.getActiveContext();
    if (!context || context.entries.length === 0) {
      return 'No conversation history';
    }
    return this.createSummary(context.entries);
  }

  summarize(): void {
    const context = this.getActiveContext();
    if (context) {
      this.triggerSummarization(context);
    }
  }

  getContext(): ConversationContext | undefined {
    return this.getActiveContext();
  }

  extractToolCalls(): ToolCallRecord[] {
    const context = this.getActiveContext();
    if (!context) return [];

    const toolCalls: ToolCallRecord[] = [];
    for (const entry of context.entries) {
      if (entry.toolCalls) {
        toolCalls.push(...entry.toolCalls);
      }
    }
    return toolCalls;
  }

  formatForModel(): Message[] {
    return this.getMessages();
  }

  getLastUserMessage(): ConversationEntry | undefined {
    const context = this.getActiveContext();
    if (!context) return undefined;

    for (let i = context.entries.length - 1; i >= 0; i--) {
      if (context.entries[i].role === 'user') {
        return context.entries[i];
      }
    }
    return undefined;
  }

  getLastAssistantMessage(): ConversationEntry | undefined {
    const context = this.getActiveContext();
    if (!context) return undefined;

    for (let i = context.entries.length - 1; i >= 0; i--) {
      if (context.entries[i].role === 'assistant') {
        return context.entries[i];
      }
    }
    return undefined;
  }

  // Alias methods for test compatibility
  export = this.exportContext.bind(this);
  import = this.importContext.bind(this);
}

class SimpleTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  estimateMessages(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + this.estimate(msg.content), 0);
  }
}
