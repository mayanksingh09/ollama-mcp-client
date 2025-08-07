import type { ConversationEntry, ConversationContext } from '../bridge/types';
import type { ClientSession } from '../types/client.types';

export interface StorageOptions {
  storagePath?: string;
  encryption?: boolean;
  compression?: boolean;
  maxSize?: number;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

export interface StorageMetadata {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  size: number;
  tags?: string[];
  description?: string;
}

export interface ConversationSnapshot {
  id: string;
  context: ConversationContext;
  metadata: StorageMetadata;
  sessionId?: string;
  checksum?: string;
}

export interface SessionSnapshot {
  id: string;
  session: ClientSession;
  conversations: ConversationSnapshot[];
  metadata: StorageMetadata;
}

export interface IConversationStore {
  save(snapshot: ConversationSnapshot): Promise<void>;
  load(id: string): Promise<ConversationSnapshot | null>;
  list(filter?: StorageFilter): Promise<ConversationSnapshot[]>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  getMetadata(id: string): Promise<StorageMetadata | null>;
  updateMetadata(id: string, metadata: Partial<StorageMetadata>): Promise<void>;
  search(query: SearchQuery): Promise<ConversationSnapshot[]>;
  exportData(ids?: string[]): Promise<string>;
  importData(data: string): Promise<string[]>;
  cleanup(options?: CleanupOptions): Promise<number>;
  getStats(): Promise<StorageStats>;
}

export interface StorageFilter {
  sessionId?: string;
  tags?: string[];
  fromDate?: Date;
  toDate?: Date;
  minSize?: number;
  maxSize?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'size';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchQuery {
  text?: string;
  role?: ConversationEntry['role'];
  hasTools?: boolean;
  toolNames?: string[];
  metadata?: Record<string, unknown>;
  limit?: number;
}

export interface CleanupOptions {
  olderThan?: Date;
  keepLast?: number;
  maxTotalSize?: number;
  orphaned?: boolean;
}

export interface StorageStats {
  totalConversations: number;
  totalSize: number;
  averageSize: number;
  oldestConversation?: Date;
  newestConversation?: Date;
  storageUsage: {
    used: number;
    available: number;
    percentage: number;
  };
}

export interface StorageProvider {
  type: 'filesystem' | 'database' | 'memory' | 'cloud';
  initialize(options: StorageOptions): Promise<void>;
  close(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
