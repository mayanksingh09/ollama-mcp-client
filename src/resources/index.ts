/**
 * Resources module exports
 */

export { ResourceManager } from './ResourceManager';
export { ResourceCache } from './ResourceCache';
export { ResourceTransformer } from './ResourceTransformer';

// Re-export types
export type {
  ExtendedResource,
  ResourceAccessOptions,
  ResourceSubscription,
  ResourceEvent,
  ResourceCacheConfig,
  ResourceManagerConfig,
  ResourceListOptions,
  ResourceListResult,
  BatchResourceRequest,
  BatchResourceResult,
} from '../types/resources.types';
