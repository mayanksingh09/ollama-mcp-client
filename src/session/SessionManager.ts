/**
 * Session management for MCP client
 */

import { EventEmitter } from 'events';
import type {
  ClientSession,
  ConnectionInfo,
  ConversationEntry,
  ToolCallEntry,
} from '../types/client.types';
import { ConnectionState } from '../types/client.types';
import type { MCPSessionState } from '../types/mcp.types';
import type { Logger } from 'winston';
import winston from 'winston';
import * as fs from 'fs/promises';
import * as path from 'path';

// Performance tracking interfaces
interface ToolExecutionMetrics {
  toolName: string;
  executionTime: number;
  success: boolean;
  timestamp: Date;
  serverId?: string;
}

interface ResourceAccessMetrics {
  uri: string;
  fromCache: boolean;
  size?: number;
  accessTime: number;
  timestamp: Date;
  serverId?: string;
}

interface PromptUsageMetrics {
  promptName: string;
  tokenCount?: number;
  executionTime: number;
  success: boolean;
  timestamp: Date;
  serverId?: string;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, ClientSession> = new Map();
  private activeSessionId?: string;
  private logger: Logger;
  private persistPath?: string;
  private autosaveInterval?: NodeJS.Timeout;

  // Enhanced tracking
  private toolExecutionHistory: Map<string, ToolExecutionMetrics[]> = new Map();
  private resourceAccessHistory: Map<string, ResourceAccessMetrics[]> = new Map();
  private promptUsageHistory: Map<string, PromptUsageMetrics[]> = new Map();

  constructor(options?: { persist?: boolean; storagePath?: string }) {
    super();

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'SessionManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
          silent: process.env.LOG_LEVEL === 'silent',
        }),
      ],
    });

    if (options?.persist && options.storagePath) {
      this.persistPath = options.storagePath;
      this.setupAutosave();
    }
  }

  /**
   * Create a new session
   */
  async createSession(): Promise<ClientSession> {
    const sessionId = this.generateSessionId();

    const session: ClientSession = {
      id: sessionId,
      connections: new Map(),
      mcpState: {
        availableTools: [],
        availableResources: [],
        availablePrompts: [],
        isConnected: false,
      },
      conversationHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    this.logger.info('Session created', { sessionId });
    this.emit('sessionCreated', session);

    await this.persistSession(session);

    return session;
  }

  /**
   * Get active session or create if none exists
   */
  async getOrCreateSession(): Promise<ClientSession> {
    if (this.activeSessionId) {
      const session = this.sessions.get(this.activeSessionId);
      if (session) {
        return session;
      }
    }

    return this.createSession();
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active session
   */
  getActiveSession(): ClientSession | undefined {
    if (!this.activeSessionId) {
      return undefined;
    }
    return this.sessions.get(this.activeSessionId);
  }

  /**
   * Set active session
   */
  setActiveSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    this.activeSessionId = sessionId;
    this.logger.info('Active session changed', { sessionId });
  }

  /**
   * Update connection info
   */
  updateConnection(sessionId: string, serverId: string, info: ConnectionInfo): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.connections.set(serverId, info);
    session.updatedAt = new Date();

    // Update MCP state based on connection status
    const hasConnected = Array.from(session.connections.values()).some(
      (conn) => conn.state === ConnectionState.CONNECTED
    );
    session.mcpState.isConnected = hasConnected;

    this.logger.debug('Connection updated', { sessionId, serverId, state: info.state });
  }

  /**
   * Remove connection
   */
  removeConnection(sessionId: string, serverId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.connections.delete(serverId);
    session.updatedAt = new Date();

    // Update MCP state
    const hasConnected = Array.from(session.connections.values()).some(
      (conn) => conn.state === ConnectionState.CONNECTED
    );
    session.mcpState.isConnected = hasConnected;

    this.logger.debug('Connection removed', { sessionId, serverId });
  }

  /**
   * Update MCP state
   */
  updateMCPState(sessionId: string, updates: Partial<MCPSessionState>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.mcpState = {
      ...session.mcpState,
      ...updates,
    };
    session.updatedAt = new Date();

    this.logger.debug('MCP state updated', { sessionId, updates });
  }

  /**
   * Add conversation entry
   */
  addConversationEntry(
    sessionId: string,
    entry: Omit<ConversationEntry, 'id' | 'timestamp'>
  ): ConversationEntry {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const fullEntry: ConversationEntry = {
      ...entry,
      id: this.generateEntryId(),
      timestamp: new Date(),
    };

    session.conversationHistory.push(fullEntry);
    session.updatedAt = new Date();

    // Trim history if needed
    const maxSize = 1000; // Default max history size
    if (session.conversationHistory.length > maxSize) {
      session.conversationHistory = session.conversationHistory.slice(-maxSize);
    }

    this.emit('messageReceived', fullEntry);

    return fullEntry;
  }

  /**
   * Add tool call to conversation
   */
  addToolCall(
    sessionId: string,
    conversationEntryId: string,
    toolCall: Omit<ToolCallEntry, 'id'>
  ): ToolCallEntry {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const entry = session.conversationHistory.find((e) => e.id === conversationEntryId);
    if (!entry) {
      throw new Error(`Conversation entry ${conversationEntryId} not found`);
    }

    const fullToolCall: ToolCallEntry = {
      ...toolCall,
      id: this.generateEntryId(),
    };

    if (!entry.toolCalls) {
      entry.toolCalls = [];
    }
    entry.toolCalls.push(fullToolCall);
    session.updatedAt = new Date();

    this.emit('toolCallStarted', fullToolCall);

    return fullToolCall;
  }

  /**
   * Update tool call result
   */
  updateToolCallResult(
    sessionId: string,
    toolCallId: string,
    result?: unknown,
    error?: string,
    duration?: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Find the tool call in conversation history
    for (const entry of session.conversationHistory) {
      if (entry.toolCalls) {
        const toolCall = entry.toolCalls.find((tc) => tc.id === toolCallId);
        if (toolCall) {
          toolCall.result = result;
          toolCall.error = error;
          toolCall.duration = duration;
          session.updatedAt = new Date();

          if (error) {
            this.emit('toolCallFailed', toolCall, new Error(error));
          } else {
            this.emit('toolCallCompleted', toolCall);
          }

          break;
        }
      }
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(sessionId: string, limit?: number): ConversationEntry[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    if (limit) {
      return session.conversationHistory.slice(-limit);
    }

    return session.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.conversationHistory = [];
    session.updatedAt = new Date();

    this.logger.info('Conversation history cleared', { sessionId });
  }

  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Disconnect all connections
    for (const [serverId, conn] of session.connections) {
      if (conn.state === ConnectionState.CONNECTED) {
        this.logger.debug('Disconnecting server', { serverId });
      }
    }

    this.sessions.delete(sessionId);

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = undefined;
    }

    // Remove persisted session
    if (this.persistPath) {
      const sessionFile = path.join(this.persistPath, `${sessionId}.json`);
      try {
        await fs.unlink(sessionFile);
      } catch (error) {
        this.logger.debug('Failed to remove session file', { sessionId, error });
      }
    }

    this.logger.info('Session destroyed', { sessionId });
    this.emit('sessionDestroyed', sessionId);
  }

  /**
   * Persist session to disk
   */
  private async persistSession(session: ClientSession): Promise<void> {
    if (!this.persistPath) {
      return;
    }

    try {
      await fs.mkdir(this.persistPath, { recursive: true });

      const sessionFile = path.join(this.persistPath, `${session.id}.json`);
      const data = {
        ...session,
        connections: Array.from(session.connections.entries()),
      };

      await fs.writeFile(sessionFile, JSON.stringify(data, null, 2));
      this.logger.debug('Session persisted', { sessionId: session.id });
    } catch (error) {
      this.logger.error('Failed to persist session', { sessionId: session.id, error });
    }
  }

  /**
   * Load sessions from disk
   */
  async loadSessions(): Promise<void> {
    if (!this.persistPath) {
      return;
    }

    try {
      const files = await fs.readdir(this.persistPath);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.persistPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        const session: ClientSession = {
          ...data,
          connections: new Map(data.connections),
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        };

        this.sessions.set(session.id, session);
        this.logger.info('Session loaded', { sessionId: session.id });
        this.emit('sessionRestored', session);
      }
    } catch (error) {
      this.logger.error('Failed to load sessions', { error });
    }
  }

  /**
   * Setup autosave
   */
  private setupAutosave(): void {
    // Save sessions every minute
    this.autosaveInterval = setInterval(() => {
      this.saveAllSessions().catch((err) => {
        this.logger.error('Autosave failed', err);
      });
    }, 60000);
  }

  /**
   * Save all sessions
   */
  private async saveAllSessions(): Promise<void> {
    for (const session of this.sessions.values()) {
      await this.persistSession(session);
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Generate entry ID
   */
  private generateEntryId(): string {
    return `entry_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Track tool execution
   */
  trackToolExecution(
    sessionId: string,
    toolName: string,
    executionTime: number,
    success: boolean,
    serverId?: string
  ): void {
    const metrics: ToolExecutionMetrics = {
      toolName,
      executionTime,
      success,
      timestamp: new Date(),
      serverId,
    };

    if (!this.toolExecutionHistory.has(sessionId)) {
      this.toolExecutionHistory.set(sessionId, []);
    }
    this.toolExecutionHistory.get(sessionId)?.push(metrics);

    this.emit('toolExecutionTracked', metrics);
  }

  /**
   * Track resource access
   */
  trackResourceAccess(
    sessionId: string,
    uri: string,
    fromCache: boolean,
    accessTime: number,
    size?: number,
    serverId?: string
  ): void {
    const metrics: ResourceAccessMetrics = {
      uri,
      fromCache,
      size,
      accessTime,
      timestamp: new Date(),
      serverId,
    };

    if (!this.resourceAccessHistory.has(sessionId)) {
      this.resourceAccessHistory.set(sessionId, []);
    }
    this.resourceAccessHistory.get(sessionId)?.push(metrics);

    this.emit('resourceAccessTracked', metrics);
  }

  /**
   * Track prompt usage
   */
  trackPromptUsage(
    sessionId: string,
    promptName: string,
    executionTime: number,
    success: boolean,
    tokenCount?: number,
    serverId?: string
  ): void {
    const metrics: PromptUsageMetrics = {
      promptName,
      tokenCount,
      executionTime,
      success,
      timestamp: new Date(),
      serverId,
    };

    if (!this.promptUsageHistory.has(sessionId)) {
      this.promptUsageHistory.set(sessionId, []);
    }
    this.promptUsageHistory.get(sessionId)?.push(metrics);

    this.emit('promptUsageTracked', metrics);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(sessionId?: string): {
    tools: {
      totalExecutions: number;
      averageExecutionTime: number;
      successRate: number;
      topTools: Array<{ name: string; count: number; avgTime: number }>;
    };
    resources: {
      totalAccesses: number;
      cacheHitRate: number;
      averageAccessTime: number;
      totalDataTransferred: number;
    };
    prompts: {
      totalUsages: number;
      averageExecutionTime: number;
      successRate: number;
      totalTokens: number;
    };
  } {
    const sid = sessionId || this.activeSessionId;
    const toolMetrics = sid ? this.toolExecutionHistory.get(sid) || [] : [];
    const resourceMetrics = sid ? this.resourceAccessHistory.get(sid) || [] : [];
    const promptMetrics = sid ? this.promptUsageHistory.get(sid) || [] : [];

    // Calculate tool metrics
    const toolStats = new Map<string, { count: number; totalTime: number; successes: number }>();
    let totalToolTime = 0;
    let toolSuccesses = 0;

    for (const metric of toolMetrics) {
      const stats = toolStats.get(metric.toolName) || { count: 0, totalTime: 0, successes: 0 };
      stats.count++;
      stats.totalTime += metric.executionTime;
      if (metric.success) {
        stats.successes++;
        toolSuccesses++;
      }
      toolStats.set(metric.toolName, stats);
      totalToolTime += metric.executionTime;
    }

    const topTools = Array.from(toolStats.entries())
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        avgTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate resource metrics
    let cacheHits = 0;
    let totalAccessTime = 0;
    let totalDataSize = 0;

    for (const metric of resourceMetrics) {
      if (metric.fromCache) cacheHits++;
      totalAccessTime += metric.accessTime;
      if (metric.size) totalDataSize += metric.size;
    }

    // Calculate prompt metrics
    let promptSuccesses = 0;
    let totalPromptTime = 0;
    let totalTokens = 0;

    for (const metric of promptMetrics) {
      if (metric.success) promptSuccesses++;
      totalPromptTime += metric.executionTime;
      if (metric.tokenCount) totalTokens += metric.tokenCount;
    }

    return {
      tools: {
        totalExecutions: toolMetrics.length,
        averageExecutionTime: toolMetrics.length > 0 ? totalToolTime / toolMetrics.length : 0,
        successRate: toolMetrics.length > 0 ? (toolSuccesses / toolMetrics.length) * 100 : 0,
        topTools,
      },
      resources: {
        totalAccesses: resourceMetrics.length,
        cacheHitRate: resourceMetrics.length > 0 ? (cacheHits / resourceMetrics.length) * 100 : 0,
        averageAccessTime:
          resourceMetrics.length > 0 ? totalAccessTime / resourceMetrics.length : 0,
        totalDataTransferred: totalDataSize,
      },
      prompts: {
        totalUsages: promptMetrics.length,
        averageExecutionTime: promptMetrics.length > 0 ? totalPromptTime / promptMetrics.length : 0,
        successRate: promptMetrics.length > 0 ? (promptSuccesses / promptMetrics.length) * 100 : 0,
        totalTokens,
      },
    };
  }

  /**
   * Get usage statistics
   */
  getUsageStatistics(sessionId?: string): {
    mostUsedTools: Array<{ name: string; count: number }>;
    mostAccessedResources: Array<{ uri: string; count: number }>;
    mostUsedPrompts: Array<{ name: string; count: number }>;
    sessionDuration: number;
    totalInteractions: number;
  } {
    const sid = sessionId || this.activeSessionId;
    const session = sid ? this.sessions.get(sid) : undefined;

    if (!session) {
      return {
        mostUsedTools: [],
        mostAccessedResources: [],
        mostUsedPrompts: [],
        sessionDuration: 0,
        totalInteractions: 0,
      };
    }

    // Count tool usage
    const toolCounts = new Map<string, number>();
    const toolMetrics = sid ? this.toolExecutionHistory.get(sid) || [] : [];
    for (const metric of toolMetrics) {
      toolCounts.set(metric.toolName, (toolCounts.get(metric.toolName) || 0) + 1);
    }

    // Count resource access
    const resourceCounts = new Map<string, number>();
    const resourceMetrics = sid ? this.resourceAccessHistory.get(sid) || [] : [];
    for (const metric of resourceMetrics) {
      resourceCounts.set(metric.uri, (resourceCounts.get(metric.uri) || 0) + 1);
    }

    // Count prompt usage
    const promptCounts = new Map<string, number>();
    const promptMetrics = sid ? this.promptUsageHistory.get(sid) || [] : [];
    for (const metric of promptMetrics) {
      promptCounts.set(metric.promptName, (promptCounts.get(metric.promptName) || 0) + 1);
    }

    return {
      mostUsedTools: Array.from(toolCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      mostAccessedResources: Array.from(resourceCounts.entries())
        .map(([uri, count]) => ({ uri, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      mostUsedPrompts: Array.from(promptCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      sessionDuration: Date.now() - session.createdAt.getTime(),
      totalInteractions: session.conversationHistory.length,
    };
  }

  /**
   * Clear tracking history for a session
   */
  clearTrackingHistory(sessionId: string): void {
    this.toolExecutionHistory.delete(sessionId);
    this.resourceAccessHistory.delete(sessionId);
    this.promptUsageHistory.delete(sessionId);
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }

    await this.saveAllSessions();

    // Clear all tracking history
    for (const sessionId of this.sessions.keys()) {
      this.clearTrackingHistory(sessionId);
      await this.destroySession(sessionId);
    }

    // Clear tracking maps
    this.toolExecutionHistory.clear();
    this.resourceAccessHistory.clear();
    this.promptUsageHistory.clear();

    this.logger.info('SessionManager cleaned up');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSession?: string;
    totalConnections: number;
    totalMessages: number;
    totalToolCalls: number;
  } {
    let totalConnections = 0;
    let totalMessages = 0;
    let totalToolCalls = 0;

    for (const session of this.sessions.values()) {
      totalConnections += session.connections.size;
      totalMessages += session.conversationHistory.length;

      for (const entry of session.conversationHistory) {
        if (entry.toolCalls) {
          totalToolCalls += entry.toolCalls.length;
        }
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSession: this.activeSessionId,
      totalConnections,
      totalMessages,
      totalToolCalls,
    };
  }
}
