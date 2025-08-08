/**
 * Resource Manager - Core resource discovery, reading, and management
 */

import { EventEmitter } from 'events';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Logger } from 'winston';
import winston from 'winston';
import { ResourceCache } from './ResourceCache';
import { ResourceTransformer } from './ResourceTransformer';
import type {
  ExtendedResource,
  ResourceAccessOptions,
  ResourceManagerConfig,
  ResourceListOptions,
  ResourceListResult,
  ResourceSubscription,
  BatchResourceRequest,
  BatchResourceResult,
} from '../types/resources.types';
import type { MCPResource, MCPResourceContent } from '../types/mcp.types';

export class ResourceManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private cache: ResourceCache;
  private transformer: ResourceTransformer;
  private subscriptions: Map<string, ResourceSubscription> = new Map();
  private resources: Map<string, ExtendedResource> = new Map();
  private logger: Logger;

  constructor(_config: ResourceManagerConfig = {}) {
    super();
    // Config is merged but not stored as we don't use it currently

    this.cache = new ResourceCache(_config.cache);
    this.transformer = new ResourceTransformer();

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'ResourceManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
          silent: process.env.LOG_LEVEL === 'silent',
        }),
      ],
    });

    this.logger.info('ResourceManager initialized');
  }

  /**
   * Register an MCP client
   */
  registerClient(serverId: string, client: Client): void {
    this.clients.set(serverId, client);
    this.discoverResources(serverId).catch((error) => {
      this.logger.error(`Failed to discover resources for ${serverId}:`, error);
    });
  }

  /**
   * Discover resources from servers
   */
  async discoverResources(serverId?: string): Promise<ExtendedResource[]> {
    const discoveredResources: ExtendedResource[] = [];

    for (const [id, client] of this.clients.entries()) {
      if (serverId && id !== serverId) continue;

      try {
        const result = await client.listResources();
        const resources = result.resources as MCPResource[];

        const extendedResources = resources.map(
          (resource) =>
            ({
              ...resource,
              serverId: id,
              lastModified: new Date(),
              isAvailable: true,
              accessCount: 0,
            }) as ExtendedResource
        );

        for (const resource of extendedResources) {
          const key = this.getResourceKey(resource.uri, id);
          this.resources.set(key, resource);
        }

        discoveredResources.push(...extendedResources);
        this.emit('resourcesDiscovered', { serverId: id, resources });
      } catch (error) {
        // Downgrade MCP Method not found errors to debug since they're expected
        const err = error as Error & { code?: number };
        if (err.code === -32601 || err.message?.includes('Method not found')) {
          this.logger.debug(`Server ${id} does not support resources (Method not found)`);
        } else {
          this.logger.error(`Failed to discover resources from ${id}:`, error);
        }
      }
    }

    return discoveredResources;
  }

  /**
   * List resources with filtering
   */
  async listResources(options?: ResourceListOptions): Promise<ResourceListResult> {
    let resources = Array.from(this.resources.values());

    // Apply filters
    if (options?.filter) {
      const { filter } = options;
      if (filter.serverId) {
        resources = resources.filter((r) => r.serverId === filter.serverId);
      }
      if (filter.mimeType) {
        const types = Array.isArray(filter.mimeType) ? filter.mimeType : [filter.mimeType];
        resources = resources.filter((r) => r.mimeType && types.includes(r.mimeType));
      }
    }

    // Pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const paginatedResources = resources.slice(offset, offset + limit);

    return {
      resources: paginatedResources,
      total: resources.length,
      offset,
      limit,
      hasMore: offset + limit < resources.length,
    };
  }

  /**
   * Read a resource
   */
  async readResource(
    uri: string,
    serverId?: string,
    options?: ResourceAccessOptions
  ): Promise<MCPResourceContent> {
    const cacheKey = this.cache.generateKey(uri, serverId || 'default');

    // Check cache if enabled
    if (options?.useCache !== false && !options?.forceRefresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.emit('resourceAccess', {
          type: 'cached',
          uri,
          serverId: serverId || 'default',
          fromCache: true,
          timestamp: new Date(),
        });
        return cached.content;
      }
    }

    // Find the client
    const client = serverId ? this.clients.get(serverId) : this.clients.values().next().value;
    if (!client) {
      throw new Error('No MCP client available');
    }

    try {
      const result = await client.readResource({ uri });
      const content = {
        uri,
        text: result.contents[0]?.text,
        mimeType: result.contents[0]?.mimeType,
      } as MCPResourceContent;

      // Transform if needed
      if (options?.format) {
        const transformed = await this.transformer.transform(content, {
          targetFormat: options.format,
        });
        content.text = transformed as string;
      }

      // Cache the result
      if (options?.useCache !== false) {
        await this.cache.set(cacheKey, content, options?.cacheTTL);
      }

      this.emit('resourceAccess', {
        type: 'read',
        uri,
        serverId: serverId || 'default',
        timestamp: new Date(),
      });

      return content;
    } catch (error) {
      this.logger.error(`Failed to read resource ${uri}:`, error);
      throw error;
    }
  }

  /**
   * Execute batch resource requests
   */
  async executeBatch(request: BatchResourceRequest): Promise<BatchResourceResult> {
    const results: Array<{ uri: string; content?: MCPResourceContent; error?: Error }> = [];
    let succeeded = 0;
    let failed = 0;
    let cached = 0;

    for (const resource of request.resources) {
      try {
        const content = await this.readResource(resource.uri, resource.serverId, resource.options);
        results.push({ uri: resource.uri, content });
        succeeded++;
      } catch (error) {
        results.push({ uri: resource.uri, error: error as Error });
        failed++;
        if (request.stopOnError) break;
      }
    }

    return {
      batchId: request.id,
      results,
      summary: {
        total: request.resources.length,
        succeeded,
        failed,
        cached,
        totalSize: 0,
        totalTime: 0,
      },
    };
  }

  /**
   * Get resource key
   */
  private getResourceKey(uri: string, serverId: string): string {
    return `${uri}:${serverId}`;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.cache.cleanup();
    this.clients.clear();
    this.resources.clear();
    this.subscriptions.clear();
    this.logger.info('ResourceManager cleaned up');
  }
}
