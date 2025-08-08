/**
 * Tool Registry - Tool indexing, categorization, and statistics
 */

import { EventEmitter } from 'events';
import type { ExtendedTool, ToolFilterOptions, ToolRegistryConfig } from '../types/tools.types';
import type { Logger } from 'winston';
import winston from 'winston';

interface ToolStats {
  usageCount: number;
  successCount: number;
  failureCount: number;
  totalExecutionTime: number;
  lastUsed?: Date;
  lastError?: string;
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ExtendedTool> = new Map();
  private toolsByServer: Map<string, Set<string>> = new Map();
  private toolsByCategory: Map<string, Set<string>> = new Map();
  private toolsByTag: Map<string, Set<string>> = new Map();
  private toolStats: Map<string, ToolStats> = new Map();
  private config: ToolRegistryConfig;
  private logger: Logger;
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: ToolRegistryConfig = {}) {
    super();
    this.config = {
      trackUsageStats: true,
      trackPerformance: true,
      enableCategorization: true,
      maxCachedTools: 1000,
      ...config,
    };

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'ToolRegistry' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
          silent: process.env.LOG_LEVEL === 'silent',
        }),
      ],
    });

    this.setupAutoRefresh();
    this.logger.info('ToolRegistry initialized');
  }

  /**
   * Register a tool in the registry
   */
  registerTool(tool: ExtendedTool): void {
    const toolKey = this.getToolKey(tool.name, tool.serverId);

    // Check if we're at capacity
    if (this.tools.size >= (this.config.maxCachedTools || 1000)) {
      this.evictOldestTool();
    }

    // Store the tool
    this.tools.set(toolKey, tool);

    // Index by server
    if (!this.toolsByServer.has(tool.serverId)) {
      this.toolsByServer.set(tool.serverId, new Set());
    }
    this.toolsByServer.get(tool.serverId)?.add(toolKey);

    // Categorize if enabled
    if (this.config.enableCategorization) {
      const category = this.categorizeTool(tool);
      if (category) {
        tool.category = category;
        if (!this.toolsByCategory.has(category)) {
          this.toolsByCategory.set(category, new Set());
        }
        this.toolsByCategory.get(category)?.add(toolKey);
      }
    }

    // Index by tags
    if (tool.tags) {
      for (const tag of tool.tags) {
        if (!this.toolsByTag.has(tag)) {
          this.toolsByTag.set(tag, new Set());
        }
        this.toolsByTag.get(tag)?.add(toolKey);
      }
    }

    // Initialize stats if tracking is enabled
    if (this.config.trackUsageStats && !this.toolStats.has(toolKey)) {
      this.toolStats.set(toolKey, {
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        totalExecutionTime: 0,
      });
    }

    this.logger.debug(`Registered tool: ${tool.name} from ${tool.serverId}`);
    this.emit('toolRegistered', tool);
  }

  /**
   * Update tool information
   */
  updateTool(tool: ExtendedTool): void {
    const toolKey = this.getToolKey(tool.name, tool.serverId);
    const existingTool = this.tools.get(toolKey);

    if (existingTool) {
      // Preserve stats
      tool.usageCount = existingTool.usageCount;
      tool.avgExecutionTime = existingTool.avgExecutionTime;
      tool.successRate = existingTool.successRate;
    }

    this.tools.set(toolKey, tool);
    this.logger.debug(`Updated tool: ${tool.name} from ${tool.serverId}`);
    this.emit('toolUpdated', tool);
  }

  /**
   * Remove a tool from the registry
   */
  removeTool(name: string, serverId: string): void {
    const toolKey = this.getToolKey(name, serverId);
    const tool = this.tools.get(toolKey);

    if (!tool) {
      return;
    }

    // Remove from main registry
    this.tools.delete(toolKey);

    // Remove from server index
    this.toolsByServer.get(serverId)?.delete(toolKey);
    if (this.toolsByServer.get(serverId)?.size === 0) {
      this.toolsByServer.delete(serverId);
    }

    // Remove from category index
    if (tool.category) {
      this.toolsByCategory.get(tool.category)?.delete(toolKey);
      if (this.toolsByCategory.get(tool.category)?.size === 0) {
        this.toolsByCategory.delete(tool.category);
      }
    }

    // Remove from tag indexes
    if (tool.tags) {
      for (const tag of tool.tags) {
        this.toolsByTag.get(tag)?.delete(toolKey);
        if (this.toolsByTag.get(tag)?.size === 0) {
          this.toolsByTag.delete(tag);
        }
      }
    }

    // Remove stats
    this.toolStats.delete(toolKey);

    this.logger.debug(`Removed tool: ${name} from ${serverId}`);
    this.emit('toolRemoved', name, serverId);
  }

  /**
   * Remove all tools from a specific server
   */
  removeToolsByServer(serverId: string): void {
    const toolKeys = this.toolsByServer.get(serverId);
    if (!toolKeys) {
      return;
    }

    for (const toolKey of toolKeys) {
      const tool = this.tools.get(toolKey);
      if (tool) {
        this.removeTool(tool.name, serverId);
      }
    }
  }

  /**
   * Get a specific tool
   */
  getTool(name: string, serverId?: string): ExtendedTool | undefined {
    if (serverId) {
      const toolKey = this.getToolKey(name, serverId);
      return this.tools.get(toolKey);
    }

    // Search across all servers
    for (const tool of this.tools.values()) {
      if (tool.name === name) {
        return tool;
      }
    }

    return undefined;
  }

  /**
   * Get tools with filtering
   */
  getTools(filter?: ToolFilterOptions): ExtendedTool[] {
    let tools = Array.from(this.tools.values());

    if (!filter) {
      return tools;
    }

    // Apply filters
    if (filter.serverId) {
      tools = tools.filter((t) => t.serverId === filter.serverId);
    }

    if (filter.category) {
      tools = tools.filter((t) => t.category === filter.category);
    }

    if (filter.tags && filter.tags.length > 0) {
      tools = tools.filter((t) => t.tags && filter.tags!.some((tag) => t.tags!.includes(tag)));
    }

    if (filter.namePattern) {
      const pattern =
        filter.namePattern instanceof RegExp ? filter.namePattern : new RegExp(filter.namePattern);
      tools = tools.filter((t) => pattern.test(t.name));
    }

    if (filter.isAvailable !== undefined) {
      tools = tools.filter((t) => t.isAvailable === filter.isAvailable);
    }

    if (filter.minSuccessRate !== undefined) {
      tools = tools.filter(
        (t) => t.successRate !== undefined && t.successRate >= filter.minSuccessRate!
      );
    }

    if (filter.maxAvgExecutionTime !== undefined) {
      tools = tools.filter(
        (t) => t.avgExecutionTime !== undefined && t.avgExecutionTime <= filter.maxAvgExecutionTime!
      );
    }

    return tools;
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ExtendedTool[] {
    const toolKeys = this.toolsByCategory.get(category);
    if (!toolKeys) {
      return [];
    }

    return Array.from(toolKeys)
      .map((key) => this.tools.get(key))
      .filter(Boolean) as ExtendedTool[];
  }

  /**
   * Get tools by tag
   */
  getToolsByTag(tag: string): ExtendedTool[] {
    const toolKeys = this.toolsByTag.get(tag);
    if (!toolKeys) {
      return [];
    }

    return Array.from(toolKeys)
      .map((key) => this.tools.get(key))
      .filter(Boolean) as ExtendedTool[];
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.toolsByCategory.keys());
  }

  /**
   * Get all tags
   */
  getTags(): string[] {
    return Array.from(this.toolsByTag.keys());
  }

  /**
   * Update tool statistics
   */
  updateToolStats(
    name: string,
    serverId: string,
    update: {
      executionTime?: number;
      success: boolean;
      error?: string;
    }
  ): void {
    if (!this.config.trackUsageStats) {
      return;
    }

    const toolKey = this.getToolKey(name, serverId);
    const tool = this.tools.get(toolKey);
    if (!tool) {
      return;
    }

    // Get or create stats
    let stats = this.toolStats.get(toolKey);
    if (!stats) {
      stats = {
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        totalExecutionTime: 0,
      };
      this.toolStats.set(toolKey, stats);
    }

    // Update stats
    stats.usageCount++;
    stats.lastUsed = new Date();

    if (update.success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
      if (update.error) {
        stats.lastError = update.error;
      }
    }

    if (update.executionTime && this.config.trackPerformance) {
      stats.totalExecutionTime += update.executionTime;
    }

    // Update tool metadata
    tool.usageCount = stats.usageCount;
    tool.avgExecutionTime = stats.usageCount > 0 ? stats.totalExecutionTime / stats.usageCount : 0;
    tool.successRate = stats.usageCount > 0 ? (stats.successCount / stats.usageCount) * 100 : 100;

    this.tools.set(toolKey, tool);
  }

  /**
   * Get tool statistics
   */
  getStatistics(name?: string, serverId?: string): unknown {
    if (name && serverId) {
      const toolKey = this.getToolKey(name, serverId);
      return this.toolStats.get(toolKey);
    }

    if (name) {
      // Get stats for tool across all servers
      const stats: ToolStats[] = [];
      for (const [key, stat] of this.toolStats.entries()) {
        if (key.startsWith(`${name}:`)) {
          stats.push(stat);
        }
      }
      return stats;
    }

    // Return all stats
    return Object.fromEntries(this.toolStats);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.toolsByServer.clear();
    this.toolsByCategory.clear();
    this.toolsByTag.clear();
    this.toolStats.clear();
    this.logger.info('Registry cleared');
  }

  /**
   * Get registry size
   */
  size(): number {
    return this.tools.size;
  }

  /**
   * Categorize a tool
   */
  private categorizeTool(tool: ExtendedTool): string | undefined {
    if (this.config.categorizer) {
      return this.config.categorizer(tool);
    }

    // Default categorization based on name patterns
    const name = tool.name.toLowerCase();

    if (name.includes('file') || name.includes('fs') || name.includes('directory')) {
      return 'file-system';
    }
    if (name.includes('http') || name.includes('api') || name.includes('request')) {
      return 'network';
    }
    if (name.includes('db') || name.includes('database') || name.includes('sql')) {
      return 'database';
    }
    if (name.includes('auth') || name.includes('login') || name.includes('permission')) {
      return 'authentication';
    }
    if (name.includes('log') || name.includes('debug') || name.includes('trace')) {
      return 'logging';
    }
    if (name.includes('crypto') || name.includes('hash') || name.includes('encrypt')) {
      return 'cryptography';
    }
    if (name.includes('math') || name.includes('calc') || name.includes('compute')) {
      return 'computation';
    }
    if (name.includes('transform') || name.includes('convert') || name.includes('parse')) {
      return 'transformation';
    }

    return 'general';
  }

  /**
   * Get tool key for indexing
   */
  private getToolKey(name: string, serverId: string): string {
    return `${name}:${serverId}`;
  }

  /**
   * Evict the oldest tool when at capacity
   */
  private evictOldestTool(): void {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [key, tool] of this.tools.entries()) {
      const lastUpdated = tool.lastUpdated?.getTime() || 0;
      if (lastUpdated < oldestTime) {
        oldestTime = lastUpdated;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const tool = this.tools.get(oldestKey);
      if (tool) {
        this.removeTool(tool.name, tool.serverId);
        this.logger.debug(`Evicted oldest tool: ${oldestKey}`);
      }
    }
  }

  /**
   * Setup auto-refresh timer
   */
  private setupAutoRefresh(): void {
    if (this.config.autoRefreshInterval) {
      this.refreshTimer = setInterval(() => {
        this.refreshAvailability();
      }, this.config.autoRefreshInterval * 1000);
    }
  }

  /**
   * Refresh tool availability status
   */
  private refreshAvailability(): void {
    for (const tool of this.tools.values()) {
      // Check if tool hasn't been used recently
      const stats = this.toolStats.get(this.getToolKey(tool.name, tool.serverId));
      if (stats?.lastUsed) {
        const timeSinceLastUse = Date.now() - stats.lastUsed.getTime();
        const threshold = 60 * 60 * 1000; // 1 hour

        if (timeSinceLastUse > threshold) {
          tool.isAvailable = false;
        }
      }
    }
  }

  /**
   * Export registry data
   */
  export(): {
    tools: ExtendedTool[];
    stats: Record<string, ToolStats>;
    categories: string[];
    tags: string[];
  } {
    return {
      tools: Array.from(this.tools.values()),
      stats: Object.fromEntries(this.toolStats),
      categories: this.getCategories(),
      tags: this.getTags(),
    };
  }

  /**
   * Import registry data
   */
  import(data: { tools: ExtendedTool[]; stats?: Record<string, ToolStats> }): void {
    this.clear();

    for (const tool of data.tools) {
      this.registerTool(tool);
    }

    if (data.stats) {
      for (const [key, stats] of Object.entries(data.stats)) {
        this.toolStats.set(key, stats);
      }
    }

    this.logger.info(`Imported ${data.tools.length} tools`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.clear();
    this.logger.info('ToolRegistry cleaned up');
  }
}
