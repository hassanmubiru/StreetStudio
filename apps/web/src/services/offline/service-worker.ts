/**
 * Service Worker for StreetStudio Web Application
 * 
 * Provides offline functionality including:
 * - Cache-first strategy for static assets
 * - Network-first strategy for API responses
 * - Background sync for queued operations
 * - Push notification delivery
 * 
 * Requirements: 10.7, 12.6
 */

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `streetstudio-static-${CACHE_VERSION}`;
const API_CACHE = `streetstudio-api-${CACHE_VERSION}`;
const MEDIA_CACHE = `streetstudio-media-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const CACHEABLE_API_PATTERNS = [
  /\/api\/videos\/[^/]+$/,
  /\/api\/projects\/[^/]+$/,
  /\/api\/projects$/,
  /\/api\/videos$/,
  /\/api\/members\/me$/,
  /\/api\/organizations$/,
];

const MAX_API_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_MEDIA_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

export interface CacheStrategy {
  type: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  maxAge?: number;
  maxEntries?: number;
}

/**
 * Install event - precache static assets
 */
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name.startsWith('streetstudio-') &&
              name !== STATIC_CACHE &&
              name !== API_CACHE &&
              name !== MEDIA_CACHE
            );
          })
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - route requests through caching strategies
 */
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (except for background sync)
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip WebSocket and other non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Route to appropriate strategy
  if (isStaticAsset(url)) {
    event.respondWith(handleStaticRequest(event.request));
  } else if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(event.request));
  } else if (isMediaRequest(url)) {
    event.respondWith(handleMediaRequest(event.request));
  } else if (isNavigationRequest(event.request)) {
    event.respondWith(handleNavigationRequest(event.request));
  }
});

/**
 * Background sync event - process queued operations
 */
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'streetstudio-comment-sync') {
    event.waitUntil(processCommentSyncQueue());
  } else if (event.tag === 'streetstudio-action-sync') {
    event.waitUntil(processActionSyncQueue());
  }
});

/**
 * Message event - handle messages from the main thread
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        notifyClients({ type: 'CACHE_CLEARED' });
      });
      break;
    case 'CACHE_CONTENT':
      if (payload?.url) {
        cacheContent(payload.url, payload.cacheName || API_CACHE);
      }
      break;
    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        notifyClients({ type: 'CACHE_STATUS', payload: status });
      });
      break;
  }
});

// === Cache Strategy Implementations ===

/**
 * Cache-first strategy for static assets
 */
async function handleStaticRequest(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return createOfflineResponse('Static asset unavailable offline');
  }
}

/**
 * Network-first strategy for API requests with cache fallback
 */
async function handleApiRequest(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      const responseToCache = response.clone();
      // Add timestamp header for cache age tracking
      const headers = new Headers(responseToCache.headers);
      headers.set('x-cached-at', Date.now().toString());
      const timestampedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });
      cache.put(request, timestampedResponse);
    }
    return response;
  } catch {
    // Fallback to cache when offline
    const cached = await caches.match(request);
    if (cached) {
      // Check if cache is still valid
      const cachedAt = cached.headers.get('x-cached-at');
      if (cachedAt) {
        const age = Date.now() - parseInt(cachedAt, 10);
        if (age > MAX_API_CACHE_AGE_MS) {
          // Cache is stale but still return it with indicator
          const headers = new Headers(cached.headers);
          headers.set('x-cache-stale', 'true');
          return new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers,
          });
        }
      }
      return cached;
    }
    return createOfflineResponse('API data unavailable offline');
  }
}

/**
 * Cache-first with size-limited strategy for media content
 */
async function handleMediaRequest(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    // Revalidate in background
    fetchAndCache(request, MEDIA_CACHE);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      await enforceMediaCacheLimit();
      const cache = await caches.open(MEDIA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return createOfflineResponse('Media unavailable offline');
  }
}

/**
 * Navigation requests return the app shell for SPA routing
 */
async function handleNavigationRequest(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(new Request('/index.html'), response.clone());
    }
    return response;
  } catch {
    // Return cached app shell for offline navigation
    const cached = await caches.match('/index.html');
    if (cached) {
      return cached;
    }
    return createOfflineResponse('Application unavailable offline');
  }
}

// === Background Sync Processors ===

async function processCommentSyncQueue(): Promise<void> {
  const queue = await getQueuedComments();

  for (const comment of queue) {
    try {
      const response = await fetch(comment.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(comment.authToken ? { Authorization: `Bearer ${comment.authToken}` } : {}),
        },
        body: JSON.stringify(comment.data),
      });

      if (response.ok) {
        await removeFromQueue('comment-sync-queue', comment.id);
        notifyClients({
          type: 'COMMENT_SYNCED',
          payload: { id: comment.id, status: 'success' },
        });
      } else if (response.status >= 400 && response.status < 500) {
        // Client error - remove from queue, notify failure
        await removeFromQueue('comment-sync-queue', comment.id);
        notifyClients({
          type: 'COMMENT_SYNC_FAILED',
          payload: { id: comment.id, status: 'client_error', statusCode: response.status },
        });
      }
      // For 5xx errors, leave in queue for next sync attempt
    } catch {
      // Network error - leave in queue for retry
    }
  }
}

async function processActionSyncQueue(): Promise<void> {
  const queue = await getQueuedActions();

  for (const action of queue) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          ...(action.authToken ? { Authorization: `Bearer ${action.authToken}` } : {}),
        },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await removeFromQueue('action-sync-queue', action.id);
        notifyClients({
          type: 'ACTION_SYNCED',
          payload: { id: action.id, status: response.ok ? 'success' : 'failed' },
        });
      }
    } catch {
      // Network error - leave in queue for retry
    }
  }
}

// === Helper Functions ===

function isStaticAsset(url: URL): boolean {
  return /\.(js|css|ico|png|jpg|jpeg|svg|webp|woff2?|ttf|eot)$/.test(url.pathname);
}

function isApiRequest(url: URL): boolean {
  return url.pathname.startsWith('/api/') && CACHEABLE_API_PATTERNS.some((p) => p.test(url.pathname));
}

function isMediaRequest(url: URL): boolean {
  return url.pathname.startsWith('/api/videos/') && /\/(thumbnail|stream|preview)/.test(url.pathname);
}

function isNavigationRequest(request: Request): boolean {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html') === true;
}

function createOfflineResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: 'offline', message }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'x-offline': 'true' },
    }
  );
}

async function fetchAndCache(request: Request, cacheName: string): Promise<void> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response);
    }
  } catch {
    // Silently fail background revalidation
  }
}

async function enforceMediaCacheLimit(): Promise<void> {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();

  let totalSize = 0;
  const entries: Array<{ request: Request; size: number; cachedAt: number }> = [];

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.clone().blob();
      const cachedAt = parseInt(response.headers.get('x-cached-at') || '0', 10);
      entries.push({ request, size: blob.size, cachedAt });
      totalSize += blob.size;
    }
  }

  if (totalSize > MAX_MEDIA_CACHE_SIZE) {
    // Remove oldest entries first
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    while (totalSize > MAX_MEDIA_CACHE_SIZE * 0.8 && entries.length > 0) {
      const entry = entries.shift()!;
      await cache.delete(entry.request);
      totalSize -= entry.size;
    }
  }
}

async function getQueuedComments(): Promise<Array<{
  id: string;
  url: string;
  data: unknown;
  authToken?: string;
}>> {
  try {
    const db = await openSyncDatabase();
    const tx = db.transaction('comment-sync-queue', 'readonly');
    const store = tx.objectStore('comment-sync-queue');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function getQueuedActions(): Promise<Array<{
  id: string;
  url: string;
  method: string;
  body?: unknown;
  authToken?: string;
}>> {
  try {
    const db = await openSyncDatabase();
    const tx = db.transaction('action-sync-queue', 'readonly');
    const store = tx.objectStore('action-sync-queue');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function removeFromQueue(storeName: string, id: string): Promise<void> {
  try {
    const db = await openSyncDatabase();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
  } catch {
    // Silently fail cleanup
  }
}

function openSyncDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('streetstudio-sync', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('comment-sync-queue')) {
        db.createObjectStore('comment-sync-queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('action-sync-queue')) {
        db.createObjectStore('action-sync-queue', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearAllCaches(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith('streetstudio-'))
      .map((name) => caches.delete(name))
  );
}

async function getCacheStatus(): Promise<{
  staticCacheSize: number;
  apiCacheSize: number;
  mediaCacheSize: number;
}> {
  const getSize = async (cacheName: string): Promise<number> => {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      return keys.length;
    } catch {
      return 0;
    }
  };

  return {
    staticCacheSize: await getSize(STATIC_CACHE),
    apiCacheSize: await getSize(API_CACHE),
    mediaCacheSize: await getSize(MEDIA_CACHE),
  };
}

async function notifyClients(message: unknown): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
}

export {
  STATIC_CACHE,
  API_CACHE,
  MEDIA_CACHE,
  CACHE_VERSION,
};
