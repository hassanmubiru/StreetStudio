/**
 * Unit Tests: Cache Invalidation Service
 *
 * Tests for WebSocket-driven cache invalidation, rule matching,
 * pattern-based invalidation, and invalidation event listening.
 *
 * Validates: Requirements 12.3
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheInvalidationService, type InvalidationEvent } from './cache-invalidation.js';
import { CacheManager } from './cache-manager.js';
import type { WebSocketMessage } from './websocket.js';

// Mock the client-logger to avoid side effects
vi.mock('../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the websocket module
vi.mock('./websocket.js', () => ({
  getCollaborationSocket: vi.fn(() => null),
  WebSocketManager: vi.fn(),
}));

describe('CacheInvalidationService', () => {
  let cacheManager: CacheManager;
  let service: CacheInvalidationService;

  beforeEach(() => {
    localStorage.clear();
    cacheManager = new CacheManager({
      defaultTTL: 60000,
      maxEntries: 100,
      prefix: 'inv_test_',
      persist: false,
    });
    service = new CacheInvalidationService(cacheManager);
  });

  describe('triggerInvalidation with default rules', () => {
    it('invalidates video cache on video.updated message', () => {
      // Pre-populate cache
      cacheManager.set('video:v1', { title: 'Video 1' }, 'cache-first');
      cacheManager.set('video:v1:metadata', { duration: 120 }, 'cache-first');

      const message: WebSocketMessage = {
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      };

      service.triggerInvalidation(message);

      expect(cacheManager.has('video:v1')).toBe(false);
      expect(cacheManager.has('video:v1:metadata')).toBe(false);
    });

    it('invalidates comment cache on comment.added message', () => {
      cacheManager.set('video:v1:comments', [{ id: 'c1' }], 'cache-first');

      const message: WebSocketMessage = {
        type: 'comment.added',
        payload: { videoId: 'v1', commentId: 'c2' },
      };

      service.triggerInvalidation(message);

      expect(cacheManager.has('video:v1:comments')).toBe(false);
    });

    it('invalidates comment and video comments on comment.deleted', () => {
      cacheManager.set('video:v2:comments', [{ id: 'c1' }], 'cache-first');
      cacheManager.set('comment:c1', { text: 'hello' }, 'cache-first');

      const message: WebSocketMessage = {
        type: 'comment.deleted',
        payload: { videoId: 'v2', commentId: 'c1' },
      };

      service.triggerInvalidation(message);

      expect(cacheManager.has('video:v2:comments')).toBe(false);
      expect(cacheManager.has('comment:c1')).toBe(false);
    });

    it('invalidates project cache and pattern on project.updated', () => {
      cacheManager.set('project:p1', { name: 'Project 1' }, 'cache-first');
      cacheManager.set('project:p1:videos', ['v1', 'v2'], 'cache-first');
      cacheManager.set('project:p1:members', ['m1'], 'cache-first');

      const message: WebSocketMessage = {
        type: 'project.updated',
        payload: { projectId: 'p1' },
      };

      service.triggerInvalidation(message);

      expect(cacheManager.has('project:p1')).toBe(false);
      expect(cacheManager.has('project:p1:videos')).toBe(false);
      expect(cacheManager.has('project:p1:members')).toBe(false);
    });

    it('invalidates presence cache on presence.update', () => {
      cacheManager.set('presence:v1', { users: ['u1'] }, 'cache-first');

      const message: WebSocketMessage = {
        type: 'presence.update',
        payload: { videoId: 'v1' },
      };

      service.triggerInvalidation(message);

      expect(cacheManager.has('presence:v1')).toBe(false);
    });

    it('invalidates video processing status', () => {
      cacheManager.set('video:v1', { status: 'processing' }, 'cache-first');
      cacheManager.set('video:v1:status', 'processing', 'cache-first');

      const message: WebSocketMessage = {
        type: 'video.processing',
        payload: { videoId: 'v1' },
      };

      service.triggerInvalidation(message);

      expect(cacheManager.has('video:v1')).toBe(false);
      expect(cacheManager.has('video:v1:status')).toBe(false);
    });
  });

  describe('custom rules', () => {
    it('registers and triggers custom invalidation rules', () => {
      cacheManager.set('custom:item:1', 'data', 'cache-first');

      service.addRule({
        messageType: 'custom.event',
        getCacheKeys: (payload) => [`custom:item:${payload.itemId}`],
      });

      service.triggerInvalidation({
        type: 'custom.event',
        payload: { itemId: '1' },
      });

      expect(cacheManager.has('custom:item:1')).toBe(false);
    });

    it('removes rules for a specific message type', () => {
      cacheManager.set('video:v1', 'data', 'cache-first');

      service.removeRules('video.updated');

      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      });

      // Should NOT be invalidated because rules were removed
      expect(cacheManager.has('video:v1')).toBe(true);
    });
  });

  describe('invalidation listeners', () => {
    it('notifies listeners when cache is invalidated', () => {
      const listener = vi.fn();
      service.onInvalidation(listener);

      cacheManager.set('video:v1', 'data', 'cache-first');

      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'video.updated',
          invalidatedKeys: expect.arrayContaining(['video:v1']),
          timestamp: expect.any(Number),
        })
      );
    });

    it('unsubscribes listeners correctly', () => {
      const listener = vi.fn();
      const unsubscribe = service.onInvalidation(listener);

      cacheManager.set('video:v1', 'data', 'cache-first');
      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      cacheManager.set('video:v2', 'data', 'cache-first');
      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v2', projectId: 'p1' },
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify when no keys are actually invalidated', () => {
      const listener = vi.fn();
      service.onInvalidation(listener);

      // Trigger invalidation for a key that doesn't exist
      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'nonexistent', projectId: 'p1' },
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('handles listener errors gracefully', () => {
      const badListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      service.onInvalidation(badListener);
      service.onInvalidation(goodListener);

      cacheManager.set('video:v1', 'data', 'cache-first');
      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      });

      // Good listener should still be called despite bad listener throwing
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('invalidation log', () => {
    it('records invalidation events', () => {
      cacheManager.set('video:v1', 'data', 'cache-first');

      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      });

      const log = service.getInvalidationLog();
      expect(log).toHaveLength(1);
      expect(log[0].messageType).toBe('video.updated');
    });

    it('clears the invalidation log', () => {
      cacheManager.set('video:v1', 'data', 'cache-first');
      service.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'v1', projectId: 'p1' },
      });

      service.clearLog();

      expect(service.getInvalidationLog()).toHaveLength(0);
    });

    it('limits log size to maxLogSize', () => {
      // Trigger many invalidation events
      for (let i = 0; i < 120; i++) {
        cacheManager.set(`presence:v${i}`, 'data', 'cache-first');
        service.triggerInvalidation({
          type: 'presence.update',
          payload: { videoId: `v${i}` },
        });
      }

      const log = service.getInvalidationLog();
      expect(log.length).toBeLessThanOrEqual(100);
    });
  });

  describe('WebSocket connection', () => {
    it('connects to a WebSocket manager and subscribes to message types', () => {
      const subscribeMock = vi.fn(() => vi.fn());
      const mockWs = {
        subscribe: subscribeMock,
      } as any;

      service.connect(mockWs);

      // Should subscribe to multiple message types (from default rules)
      expect(subscribeMock).toHaveBeenCalled();
      const subscribedTypes = subscribeMock.mock.calls.map((call) => call[0]);
      expect(subscribedTypes).toContain('video.updated');
      expect(subscribedTypes).toContain('comment.added');
      expect(subscribedTypes).toContain('project.updated');
    });

    it('disconnects and clears subscriptions', () => {
      const unsubFns = [vi.fn(), vi.fn()];
      let callIndex = 0;
      const subscribeMock = vi.fn(() => unsubFns[callIndex++ % 2]);
      const mockWs = { subscribe: subscribeMock } as any;

      service.connect(mockWs);
      service.disconnect();

      // All unsubscribe functions should have been called
      for (const unsub of unsubFns) {
        expect(unsub).toHaveBeenCalled();
      }
    });

    it('handles invalidation triggered by WebSocket messages', () => {
      let videoUpdatedHandler: ((msg: WebSocketMessage) => void) | null = null;
      const subscribeMock = vi.fn((type: string, handler: any) => {
        if (type === 'video.updated') {
          videoUpdatedHandler = handler;
        }
        return vi.fn();
      });
      const mockWs = { subscribe: subscribeMock } as any;

      cacheManager.set('video:ws-v1', 'data', 'cache-first');
      service.connect(mockWs);

      // Simulate WebSocket message
      videoUpdatedHandler!({
        type: 'video.updated',
        payload: { videoId: 'ws-v1', projectId: 'p1' },
      });

      expect(cacheManager.has('video:ws-v1')).toBe(false);
    });
  });

  describe('reaction invalidation', () => {
    it('invalidates reaction cache for videos', () => {
      cacheManager.set('video:v1:reactions', [{ type: 'like' }], 'cache-first');

      service.triggerInvalidation({
        type: 'reaction.added',
        payload: { videoId: 'v1' },
      });

      expect(cacheManager.has('video:v1:reactions')).toBe(false);
    });

    it('filters out undefined keys in reaction rules', () => {
      // When commentId is not provided, should not try to invalidate comment:undefined:reactions
      cacheManager.set('video:v1:reactions', 'data', 'cache-first');

      service.triggerInvalidation({
        type: 'reaction.added',
        payload: { videoId: 'v1' /* no commentId */ },
      });

      // Should still invalidate video reactions
      expect(cacheManager.has('video:v1:reactions')).toBe(false);
    });
  });
});
