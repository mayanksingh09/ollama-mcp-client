import { EventEmitter } from 'events';
import type {
  IConversationStore,
  ConversationSnapshot,
  StorageMetadata,
  StorageFilter,
  SearchQuery,
  CleanupOptions,
  StorageStats,
  StorageOptions,
} from './types';

export abstract class ConversationStore extends EventEmitter implements IConversationStore {
  protected options: Required<StorageOptions>;
  protected autoSaveTimer?: NodeJS.Timeout;
  protected pendingSaves: Map<string, ConversationSnapshot> = new Map();

  constructor(options: StorageOptions = {}) {
    super();
    this.options = {
      storagePath: options.storagePath || './conversations',
      encryption: options.encryption ?? false,
      compression: options.compression ?? true,
      maxSize: options.maxSize ?? 100 * 1024 * 1024, // 100MB
      autoSave: options.autoSave ?? true,
      autoSaveInterval: options.autoSaveInterval ?? 30000, // 30 seconds
    };

    if (this.options.autoSave) {
      this.startAutoSave();
    }
  }

  abstract save(snapshot: ConversationSnapshot): Promise<void>;
  abstract load(id: string): Promise<ConversationSnapshot | null>;
  abstract list(filter?: StorageFilter): Promise<ConversationSnapshot[]>;
  abstract delete(id: string): Promise<boolean>;
  abstract exists(id: string): Promise<boolean>;
  abstract getMetadata(id: string): Promise<StorageMetadata | null>;
  abstract updateMetadata(id: string, metadata: Partial<StorageMetadata>): Promise<void>;
  abstract search(query: SearchQuery): Promise<ConversationSnapshot[]>;
  abstract cleanup(options?: CleanupOptions): Promise<number>;
  abstract getStats(): Promise<StorageStats>;

  async exportData(ids?: string[]): Promise<string> {
    let snapshots: ConversationSnapshot[];

    if (ids && ids.length > 0) {
      snapshots = await Promise.all(
        ids.map(async (id) => {
          const snapshot = await this.load(id);
          if (!snapshot) {
            throw new Error(`Conversation ${id} not found`);
          }
          return snapshot;
        })
      );
    } else {
      snapshots = await this.list();
    }

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      conversations: snapshots,
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importData(data: string): Promise<string[]> {
    const importData = JSON.parse(data);

    if (!importData.conversations || !Array.isArray(importData.conversations)) {
      throw new Error('Invalid import data format');
    }

    const importedIds: string[] = [];

    for (const snapshot of importData.conversations) {
      snapshot.metadata.updatedAt = new Date();

      await this.save(snapshot);
      importedIds.push(snapshot.id);

      this.emit('conversationImported', snapshot.id);
    }

    return importedIds;
  }

  protected startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      if (this.pendingSaves.size === 0) return;

      const snapshots = Array.from(this.pendingSaves.values());
      this.pendingSaves.clear();

      for (const snapshot of snapshots) {
        try {
          await this.save(snapshot);
          this.emit('autoSaved', snapshot.id);
        } catch (error) {
          this.emit('autoSaveError', { id: snapshot.id, error });
        }
      }
    }, this.options.autoSaveInterval);
  }

  protected stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  queueForSave(snapshot: ConversationSnapshot): void {
    if (this.options.autoSave) {
      this.pendingSaves.set(snapshot.id, snapshot);
    }
  }

  async flush(): Promise<void> {
    if (this.pendingSaves.size === 0) return;

    const snapshots = Array.from(this.pendingSaves.values());
    this.pendingSaves.clear();

    await Promise.all(snapshots.map((snapshot) => this.save(snapshot)));
  }

  protected generateMetadata(snapshot: ConversationSnapshot): StorageMetadata {
    return {
      id: snapshot.id,
      createdAt: snapshot.metadata?.createdAt || new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      size: JSON.stringify(snapshot).length,
      tags: snapshot.metadata?.tags,
      description: snapshot.metadata?.description,
    };
  }

  protected validateSnapshot(snapshot: ConversationSnapshot): void {
    if (!snapshot.id) {
      throw new Error('Snapshot ID is required');
    }

    if (!snapshot.context) {
      throw new Error('Snapshot context is required');
    }

    if (JSON.stringify(snapshot).length > this.options.maxSize) {
      throw new Error(`Snapshot exceeds maximum size of ${this.options.maxSize} bytes`);
    }
  }

  protected matchesFilter(snapshot: ConversationSnapshot, filter: StorageFilter): boolean {
    if (filter.sessionId && snapshot.sessionId !== filter.sessionId) {
      return false;
    }

    if (filter.tags && filter.tags.length > 0) {
      const snapshotTags = snapshot.metadata.tags || [];
      if (!filter.tags.some((tag) => snapshotTags.includes(tag))) {
        return false;
      }
    }

    if (filter.fromDate && snapshot.metadata.createdAt < filter.fromDate) {
      return false;
    }

    if (filter.toDate && snapshot.metadata.createdAt > filter.toDate) {
      return false;
    }

    if (filter.minSize && snapshot.metadata.size < filter.minSize) {
      return false;
    }

    if (filter.maxSize && snapshot.metadata.size > filter.maxSize) {
      return false;
    }

    return true;
  }

  protected sortSnapshots(
    snapshots: ConversationSnapshot[],
    sortBy: StorageFilter['sortBy'] = 'createdAt',
    sortOrder: StorageFilter['sortOrder'] = 'desc'
  ): ConversationSnapshot[] {
    return snapshots.sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'createdAt':
          compareValue = a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime();
          break;
        case 'updatedAt':
          compareValue = a.metadata.updatedAt.getTime() - b.metadata.updatedAt.getTime();
          break;
        case 'size':
          compareValue = a.metadata.size - b.metadata.size;
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });
  }

  async destroy(): Promise<void> {
    this.stopAutoSave();
    await this.flush();
    this.removeAllListeners();
  }
}
