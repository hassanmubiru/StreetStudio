/**
 * Cache Invalidation Service Tests
 *
 * Tests for WebSocket-driven cache invalidation with rules and patterns.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheInvalidationService } from './cache-invalidation.js';
import { CacheManager } from './cache-manager.js';
import type { WebSocketMessage } from './websocket.js';

describe('CacheInvalidationService', () => {
  let cacheManager: CacheManager;
  let invalidationService: CacheInvalidationService;

  beforeEach(() => {
    localStorage.clear();
    cacheManager = new CacheManager({ persist: false });
    invalidationService = new CacheInvalidationService(cacheManager);
  });

  describe('default invalidation rules', () => {
    it('invalidates video cache on video.updated message', () => {
      cacheManager.set('video:abc:metadata', { title: 'Old' });
      cacheManager.set('video:abc', { id: 'abc' });

      const message: WebSocketMessage = {
        type: 'video.updated',
        payload: { videoId: 'abc', projectId: 'proj1' },
      };

      invalidationService.triggerInvalidation(message);

      expect(cacheManager.has('video:abc')).toBe(false);
      expect(cacheManager.has('video:abc:metadata')).toBe(false);
    });

    it('invalidates comment cache on comment.added message', () => {
      cacheManager.set('video:v1:comments', [{ id: 'c1' }]);

      const message: WebSocketMessage = {
        type: 'comment.added',
        payload: { videoId: 'v1', commentId: 'c2' },
      };

      invalidationService.triggerInvalidation(message);

      expect(cacheManager.has('video:v1:comments')).toBe(false);
    });

    it('invalidates project cache with pattern on project.updated', () => {
      cacheManager.set('project:p1', { name: 'Project 1' });
      cacheManager.set('project:p1:videos', ['v1']);
      cacheManager.set('project:p1:members', ['m1']);
      cacheManager.set('project:p2:videos', ['v2']); // Should remain

      const message: WebSocketMessage = {
        type: 'project.updated',
        payload: { projectId: 'p1' },
      };

      invalidationService.triggerInvalidation(message);

      expect(cacheManager.has('project:p1')).toBe(false);
      expect(cacheManager.has('project:p1:videos')).toBe(false);
      expect(cacheManager.has('project:p1:members')).toBe(false);
      expect(cacheManager.has('project:p2:videos')).toBe(true);
    });

    it('invalidates presence cache on presence.update', () => {
      cacheManager.set('presence:v1', [{ userId: 'u1' }]);

      invalidationService.triggerInvalidation({
        type: 'presence.update',
        payload: { videoId: 'v1' },
      });

      expect(cacheManager.has('presence:v1')).toBe(false);
    });
  });

  describe('custom rules', () => {
    it('supports adding custom invalidation rules', () => {
      cacheManager.set('custom:item:1', { data: 'old' });

      invalidationService.addRule({
        messageType: 'custom.event',
        getCacheKeys: (payload) => [`custom:item:${payload.itemId}`],
      });

      invalidationService.triggerInvalidation({
        type: 'custom.event',
        payload: { itemId: '1' },
      });

      expect(cacheManager.has('custom:item:1')).toBe(false);
    });

    it('supports removing rules by message type', () => {
      cacheManager.set('video:x', { id: 'x' });

      invalidationService.removeRules('video.updated');

      invalidationService.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'x', projectId: 'p' },
      });

      // Should still exist because rule was removed
      expect(cacheManager.has('video:x')).toBe(true);
    });
  });

  describe('event listeners', () => {
    it('notifies listeners when invalidation occurs', () => {
      const listener = vi.fn();
      invalidationService.onInvalidation(listener);

      cacheManager.set('video:abc', { id: 'abc' });

      invalidationService.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'abc', projectId: 'p1' },
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'video.updated',
          invalidatedKeys: expect.arrayContaining(['video:abc']),
          timestamp: expect.any(Number),
        })
      );
    });

    it('supports unsubscribing from events', () => {
      const listener = vi.fn();
      const unsub = invalidationService.onInvalidation(listener);

      cacheManager.set('video:abc', { id: 'abc' });
      unsub();

      invalidationService.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'abc', projectId: 'p1' },
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('invalidation log', () => {
    it('records invalidation events in the log', () => {
      cacheManager.set('video:1', { id: '1' });

      invalidationService.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: '1', projectId: 'p' },
      });

      const log = invalidationService.getInvalidationLog();
      expect(log.length).toBe(1);
      expect(log[0].messageType).toBe('video.updated');
    });

    it('clears the log', () => {
      cacheManager.set('video:1', { id: '1' });

      invalidationService.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: '1', projectId: 'p' },
      });

      invalidationService.clearLog();
      expect(invalidationService.getInvalidationLog().length).toBe(0);
    });
  });

  describe('does not notify when no entries are invalidated', () => {
    it('skips listener notification when no cache entries match', () => {
      const listener = vi.fn();
      invalidationService.onInvalidation(listener);

      // No matching cache entries exist
      invalidationService.triggerInvalidation({
        type: 'video.updated',
        payload: { videoId: 'nonexistent', projectId: 'none' },
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
