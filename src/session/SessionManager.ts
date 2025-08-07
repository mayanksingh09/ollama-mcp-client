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

export class SessionManager extends EventEmitter {
  private sessions: Map<string, ClientSession> = new Map();
  private activeSessionId?: string;
  private logger: Logger;
  private persistPath?: string;
  private autosaveInterval?: NodeJS.Timeout;

  constructor(options?: { persist?: boolean; storagePath?: string }) {
    super();

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'SessionManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
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
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }

    await this.saveAllSessions();

    for (const sessionId of this.sessions.keys()) {
      await this.destroySession(sessionId);
    }

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
