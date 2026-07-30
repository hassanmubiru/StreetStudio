/**
 * Offline Capabilities Module
 * 
 * Provides comprehensive offline support for the StreetStudio web application:
 * - Service worker registration and lifecycle management
 * - Local content caching for recently viewed items
 * - Offline comment composition with background sync
 * - Connectivity status monitoring with UI indicators
 * 
 * Requirements: 10.7, 12.6
 */

// Service Worker Registration
export {
  ServiceWorkerManager,
  initializeServiceWorker,
  getServiceWorkerManager,
  registerServiceWorker,
} from './service-worker-registration.js';
export type {
  ServiceWorkerStatus,
  ServiceWorkerCallbacks,
  ServiceWorkerRegistrationOptions,
} from './service-worker-registration.js';

// Offline Content Cache
export {
  OfflineContentCache,
  getOfflineContentCache,
  cacheVideoForOffline,
  cacheProjectForOffline,
  getRecentOfflineContent,
} from './offline-content-cache.js';
export type {
  CachedContent,
  ContentType,
  OfflineCacheOptions,
  CacheStats,
} from './offline-content-cache.js';

// Offline Comment Queue
export {
  OfflineCommentQueue,
  getOfflineCommentQueue,
  queueCommentOffline,
} from './offline-comment-queue.js';
export type {
  QueuedComment,
  CommentSyncStatus,
  CommentQueueCallbacks,
  SyncResults,
  OfflineCommentQueueOptions,
} from './offline-comment-queue.js';

// Connectivity Status
export {
  ConnectivityStatusManager,
  initializeConnectivityMonitor,
  getConnectivityManager,
  isAppOnline,
  getConnectivityState,
} from './connectivity-status.js';
export type {
  ConnectivityState,
  ConnectivityInfo,
  ConnectivityCallbacks,
  ConnectivityStatusOptions,
} from './connectivity-status.js';

// === Convenience initialization ===

export interface OfflineCapabilitiesOptions {
  enableServiceWorker?: boolean;
  enableContentCache?: boolean;
  enableCommentQueue?: boolean;
  enableConnectivityMonitor?: boolean;
  apiBaseUrl?: string;
  getAuthToken?: () => string | null;
}

/**
 * Initialize all offline capabilities with a single call
 */
export async function initializeOfflineCapabilities(
  options: OfflineCapabilitiesOptions = {}
): Promise<{
  serviceWorkerReady: boolean;
  contentCacheReady: boolean;
  commentQueueReady: boolean;
  connectivityMonitorReady: boolean;
}> {
  const {
    enableServiceWorker = true,
    enableContentCache = true,
    enableCommentQueue = true,
    enableConnectivityMonitor = true,
    apiBaseUrl = '/api',
    getAuthToken = () => null,
  } = options;

  const results = {
    serviceWorkerReady: false,
    contentCacheReady: false,
    commentQueueReady: false,
    connectivityMonitorReady: false,
  };

  // Initialize service worker
  if (enableServiceWorker && 'serviceWorker' in navigator) {
    try {
      const { registerServiceWorker } = await import('./service-worker-registration.js');
      const status = await registerServiceWorker();
      results.serviceWorkerReady = status.isRegistered;
    } catch {
      // Service worker registration failed - continue without it
    }
  }

  // Initialize content cache
  if (enableContentCache) {
    try {
      const { getOfflineContentCache } = await import('./offline-content-cache.js');
      const cache = getOfflineContentCache();
      await cache.initialize();
      results.contentCacheReady = true;
    } catch {
      // Content cache initialization failed - continue without it
    }
  }

  // Initialize comment queue
  if (enableCommentQueue) {
    try {
      const { getOfflineCommentQueue } = await import('./offline-comment-queue.js');
      const queue = getOfflineCommentQueue({ apiBaseUrl, getAuthToken });
      await queue.initialize();
      results.commentQueueReady = true;
    } catch {
      // Comment queue initialization failed - continue without it
    }
  }

  // Initialize connectivity monitor
  if (enableConnectivityMonitor) {
    try {
      const { initializeConnectivityMonitor } = await import('./connectivity-status.js');
      initializeConnectivityMonitor({
        pingUrl: `${apiBaseUrl}/health`,
      });
      results.connectivityMonitorReady = true;
    } catch {
      // Connectivity monitor failed - continue without it
    }
  }

  return results;
}
