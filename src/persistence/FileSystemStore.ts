import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { ConversationStore } from './ConversationStore';
import type {
  ConversationSnapshot,
  StorageMetadata,
  StorageFilter,
  SearchQuery,
  CleanupOptions,
  StorageStats,
  StorageOptions,
} from './types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class FileSystemStore extends ConversationStore {
  private indexPath: string;
  private dataPath: string;
  private index: Map<string, StorageMetadata> = new Map();
  private encryptionKey?: Buffer;

  constructor(options: StorageOptions = {}) {
    super(options);
    this.dataPath = path.join(this.options.storagePath, 'conversations');
    this.indexPath = path.join(this.options.storagePath, 'index.json');

    if (this.options.encryption) {
      this.encryptionKey = crypto.scryptSync('default-key', 'salt', 32);
    }
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataPath, { recursive: true });
    await this.loadIndex();
  }

  private async loadIndex(): Promise<void> {
    try {
      const indexData = await fs.readFile(this.indexPath, 'utf-8');
      const index = JSON.parse(indexData);

      this.index = new Map(
        Object.entries(index).map(([id, metadata]) => [
          id,
          {
            ...(metadata as StorageMetadata),
            createdAt: new Date((metadata as StorageMetadata).createdAt),
            updatedAt: new Date((metadata as StorageMetadata).updatedAt),
          },
        ])
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      this.index = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    const indexData = Object.fromEntries(
      Array.from(this.index.entries()).map(([id, metadata]) => [
        id,
        {
          ...metadata,
          createdAt: metadata.createdAt.toISOString(),
          updatedAt: metadata.updatedAt.toISOString(),
        },
      ])
    );

    await fs.writeFile(this.indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
  }

  async save(snapshot: ConversationSnapshot): Promise<void> {
    this.validateSnapshot(snapshot);

    const metadata = this.generateMetadata(snapshot);
    let data = JSON.stringify(snapshot);

    if (this.options.compression) {
      data = (await gzip(data)).toString('base64');
    }

    if (this.options.encryption && this.encryptionKey) {
      data = this.encrypt(data);
    }

    const filePath = path.join(this.dataPath, `${snapshot.id}.json`);
    await fs.writeFile(filePath, data, 'utf-8');

    this.index.set(snapshot.id, metadata);
    await this.saveIndex();

    this.emit('conversationSaved', snapshot.id);
  }

  async load(id: string): Promise<ConversationSnapshot | null> {
    if (!this.index.has(id)) {
      return null;
    }

    const filePath = path.join(this.dataPath, `${id}.json`);

    try {
      let data = await fs.readFile(filePath, 'utf-8');

      if (this.options.encryption && this.encryptionKey) {
        data = this.decrypt(data);
      }

      if (this.options.compression) {
        const buffer = Buffer.from(data, 'base64');
        data = (await gunzip(buffer)).toString('utf-8');
      }

      const snapshot = JSON.parse(data);

      snapshot.metadata.createdAt = new Date(snapshot.metadata.createdAt);
      snapshot.metadata.updatedAt = new Date(snapshot.metadata.updatedAt);

      if (snapshot.context.metadata) {
        snapshot.context.metadata.createdAt = new Date(snapshot.context.metadata.createdAt);
        snapshot.context.metadata.lastUpdated = new Date(snapshot.context.metadata.lastUpdated);
      }

      for (const entry of snapshot.context.entries) {
        entry.timestamp = new Date(entry.timestamp);
        if (entry.toolCalls) {
          for (const toolCall of entry.toolCalls) {
            toolCall.timestamp = new Date(toolCall.timestamp);
          }
        }
      }

      return snapshot;
    } catch (error) {
      this.emit('loadError', { id, error });
      return null;
    }
  }

  async list(filter?: StorageFilter): Promise<ConversationSnapshot[]> {
    let metadataList = Array.from(this.index.values());

    if (filter) {
      const snapshots: ConversationSnapshot[] = [];

      for (const metadata of metadataList) {
        const snapshot = await this.load(metadata.id);
        if (snapshot && this.matchesFilter(snapshot, filter)) {
          snapshots.push(snapshot);
        }
      }

      let sorted = this.sortSnapshots(snapshots, filter.sortBy, filter.sortOrder);

      if (filter.offset) {
        sorted = sorted.slice(filter.offset);
      }

      if (filter.limit) {
        sorted = sorted.slice(0, filter.limit);
      }

      return sorted;
    }

    const snapshots = await Promise.all(metadataList.map((metadata) => this.load(metadata.id)));

    return snapshots.filter((s): s is ConversationSnapshot => s !== null);
  }

  async delete(id: string): Promise<boolean> {
    if (!this.index.has(id)) {
      return false;
    }

    const filePath = path.join(this.dataPath, `${id}.json`);

    try {
      await fs.unlink(filePath);
      this.index.delete(id);
      await this.saveIndex();

      this.emit('conversationDeleted', id);
      return true;
    } catch (error) {
      this.emit('deleteError', { id, error });
      return false;
    }
  }

  async exists(id: string): Promise<boolean> {
    if (!this.index.has(id)) {
      return false;
    }

    const filePath = path.join(this.dataPath, `${id}.json`);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      this.index.delete(id);
      await this.saveIndex();
      return false;
    }
  }

  async getMetadata(id: string): Promise<StorageMetadata | null> {
    return this.index.get(id) || null;
  }

  async updateMetadata(id: string, metadata: Partial<StorageMetadata>): Promise<void> {
    const existing = this.index.get(id);
    if (!existing) {
      throw new Error(`Conversation ${id} not found`);
    }

    const updated = {
      ...existing,
      ...metadata,
      id: existing.id,
      updatedAt: new Date(),
    };

    this.index.set(id, updated);
    await this.saveIndex();
  }

  async search(query: SearchQuery): Promise<ConversationSnapshot[]> {
    const results: ConversationSnapshot[] = [];

    for (const metadata of this.index.values()) {
      const snapshot = await this.load(metadata.id);
      if (!snapshot) continue;

      let matches = true;

      if (query.text) {
        const hasTextMatch = snapshot.context.entries.some((entry) =>
          entry.content.toLowerCase().includes(query.text!.toLowerCase())
        );
        if (!hasTextMatch) matches = false;
      }

      if (query.role && matches) {
        const hasRoleMatch = snapshot.context.entries.some((entry) => entry.role === query.role);
        if (!hasRoleMatch) matches = false;
      }

      if (query.hasTools !== undefined && matches) {
        const hasTools = snapshot.context.entries.some(
          (entry) => entry.toolCalls && entry.toolCalls.length > 0
        );
        if (hasTools !== query.hasTools) matches = false;
      }

      if (query.toolNames && query.toolNames.length > 0 && matches) {
        const hasToolMatch = snapshot.context.entries.some((entry) =>
          entry.toolCalls?.some((tc) => query.toolNames!.includes(tc.toolName))
        );
        if (!hasToolMatch) matches = false;
      }

      if (matches) {
        results.push(snapshot);

        if (query.limit && results.length >= query.limit) {
          break;
        }
      }
    }

    return results;
  }

  async cleanup(options: CleanupOptions = {}): Promise<number> {
    let deletedCount = 0;
    const toDelete: string[] = [];

    if (options.olderThan) {
      for (const [id, metadata] of this.index.entries()) {
        if (metadata.createdAt < options.olderThan) {
          toDelete.push(id);
        }
      }
    }

    if (options.keepLast !== undefined) {
      const sorted = Array.from(this.index.entries()).sort(
        (a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime()
      );

      if (sorted.length > options.keepLast) {
        const toRemove = sorted.slice(options.keepLast);
        toDelete.push(...toRemove.map(([id]) => id));
      }
    }

    if (options.maxTotalSize !== undefined) {
      let totalSize = 0;
      const sorted = Array.from(this.index.entries()).sort(
        (a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime()
      );

      for (const [id, metadata] of sorted) {
        totalSize += metadata.size;
        if (totalSize > options.maxTotalSize) {
          toDelete.push(id);
        }
      }
    }

    if (options.orphaned) {
      for (const [id] of this.index.entries()) {
        const filePath = path.join(this.dataPath, `${id}.json`);
        try {
          await fs.access(filePath);
        } catch {
          toDelete.push(id);
        }
      }
    }

    const uniqueToDelete = Array.from(new Set(toDelete));

    for (const id of uniqueToDelete) {
      if (await this.delete(id)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async getStats(): Promise<StorageStats> {
    const stats = await fs.stat(this.options.storagePath);
    const metadataList = Array.from(this.index.values());

    const totalSize = metadataList.reduce((sum, m) => sum + m.size, 0);
    const dates = metadataList.map((m) => m.createdAt).sort((a, b) => a.getTime() - b.getTime());

    return {
      totalConversations: this.index.size,
      totalSize,
      averageSize: this.index.size > 0 ? totalSize / this.index.size : 0,
      oldestConversation: dates[0],
      newestConversation: dates[dates.length - 1],
      storageUsage: {
        used: totalSize,
        available: stats.size - totalSize,
        percentage: (totalSize / stats.size) * 100,
      },
    };
  }

  private encrypt(data: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(data: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
