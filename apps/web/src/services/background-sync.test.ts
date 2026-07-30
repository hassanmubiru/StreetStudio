/**
 * Background Sync Manager Tests
 *
 * Tests for offline operation queueing, retry logic, and sync processing.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BackgroundSyncManager } from './background-sync.js';

describe('BackgroundSyncManager', () => {
  let syncManager: BackgroundSyncManager;
  let mockExecutor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    mockExecutor = vi.fn().mockResolvedValue({ success: true });

    // Ensure navigator.onLine returns true by default
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    syncManager = new BackgroundSyncManager({
      executor: mockExecutor,
      autoSync: false, // Disable auto-sync for controlled testing
    });
  });

  afterEach(() => {
    syncManager.destroy();
    vi.restoreAllMocks();
  });

  describe('enqueue', () => {
    it('adds operations to the queue', () => {
      const id = syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
        payload: { body: 'Hello' },
      });

      expect(id).toBeDefined();
      expect(syncManager.getQueueSize()).toBe(1);
    });

    it('assigns default priority and maxRetries', () => {
      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      const queue = syncManager.getQueue();
      expect(queue[0].priority).toBe(5);
      expect(queue[0].maxRetries).toBe(5);
    });

    it('respects custom priority and maxRetries', () => {
      syncManager.enqueue({
        type: 'update',
        resource: 'video',
        endpoint: '/api/videos/1',
        method: 'PUT',
        priority: 1,
        maxRetries: 10,
      });

      const queue = syncManager.getQueue();
      expect(queue[0].priority).toBe(1);
      expect(queue[0].maxRetries).toBe(10);
    });

    it('sorts queue by priority (lower number = higher priority)', () => {
      syncManager.enqueue({
        type: 'create',
        resource: 'low',
        endpoint: '/api/low',
        method: 'POST',
        priority: 10,
      });

      syncManager.enqueue({
        type: 'create',
        resource: 'high',
        endpoint: '/api/high',
        method: 'POST',
        priority: 1,
      });

      const queue = syncManager.getQueue();
      expect(queue[0].resource).toBe('high');
      expect(queue[1].resource).toBe('low');
    });

    it('throws when queue is full', () => {
      const smallManager = new BackgroundSyncManager({
        maxQueueSize: 2,
        executor: mockExecutor,
        autoSync: false,
      });

      smallManager.enqueue({
        type: 'create',
        resource: 'a',
        endpoint: '/a',
        method: 'POST',
      });

      smallManager.enqueue({
        type: 'create',
        resource: 'b',
        endpoint: '/b',
        method: 'POST',
      });

      expect(() =>
        smallManager.enqueue({
          type: 'create',
          resource: 'c',
          endpoint: '/c',
          method: 'POST',
        })
      ).toThrow('Sync queue is full');

      smallManager.destroy();
    });
  });

  describe('processQueue', () => {
    it('processes all operations in the queue', async () => {
      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
        payload: { body: 'test' },
      });

      syncManager.enqueue({
        type: 'update',
        resource: 'video',
        endpoint: '/api/videos/1',
        method: 'PUT',
        payload: { title: 'new' },
      });

      const results = await syncManager.processQueue();

      expect(results.length).toBe(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(syncManager.getQueueSize()).toBe(0);
    });

    it('removes successful operations from queue', async () => {
      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      await syncManager.processQueue();
      expect(syncManager.getQueueSize()).toBe(0);
    });

    it('keeps failed operations in queue for retry', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Server error'));

      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      const results = await syncManager.processQueue();

      expect(results[0].success).toBe(false);
      // Operation stays in queue because it has retries left
      expect(syncManager.getQueueSize()).toBe(1);
    });

    it('removes operations that exhaust retries', async () => {
      mockExecutor.mockRejectedValue(new Error('Permanent failure'));

      const manager = new BackgroundSyncManager({
        executor: mockExecutor,
        autoSync: false,
        defaultMaxRetries: 1,
      });

      manager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      await manager.processQueue();
      expect(manager.getQueueSize()).toBe(0); // Removed after exhausting retries
      manager.destroy();
    });

    it('returns empty when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });

      const offlineManager = new BackgroundSyncManager({
        executor: mockExecutor,
        autoSync: false,
      });

      offlineManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      const results = await offlineManager.processQueue();
      expect(results).toEqual([]);
      expect(mockExecutor).not.toHaveBeenCalled();
      offlineManager.destroy();
    });

    it('returns empty when queue is empty', async () => {
      const results = await syncManager.processQueue();
      expect(results).toEqual([]);
    });
  });

  describe('cancel and clear', () => {
    it('cancels a specific operation', () => {
      const id = syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      expect(syncManager.cancel(id)).toBe(true);
      expect(syncManager.getQueueSize()).toBe(0);
    });

    it('returns false when cancelling non-existent operation', () => {
      expect(syncManager.cancel('nonexistent')).toBe(false);
    });

    it('clears the entire queue', () => {
      syncManager.enqueue({
        type: 'create',
        resource: 'a',
        endpoint: '/a',
        method: 'POST',
      });
      syncManager.enqueue({
        type: 'create',
        resource: 'b',
        endpoint: '/b',
        method: 'POST',
      });

      syncManager.clearQueue();
      expect(syncManager.getQueueSize()).toBe(0);
      expect(syncManager.getStatus()).toBe('idle');
    });
  });

  describe('event listeners', () => {
    it('emits queued event when operation is added', () => {
      const listener = vi.fn();
      syncManager.onEvent(listener);

      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'queued',
          operation: expect.objectContaining({ resource: 'comment' }),
        })
      );
    });

    it('emits success event when operation succeeds', async () => {
      const listener = vi.fn();
      syncManager.onEvent(listener);

      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      await syncManager.processQueue();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      );
    });

    it('emits failed event when operation fails', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Failed'));
      const listener = vi.fn();
      syncManager.onEvent(listener);

      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      await syncManager.processQueue();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'failed' })
      );
    });

    it('supports unsubscribing from events', () => {
      const listener = vi.fn();
      const unsub = syncManager.onEvent(listener);

      unsub();

      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('persists queue to localStorage', () => {
      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
        payload: { body: 'persisted' },
      });

      const stored = localStorage.getItem('streetstudio_sync_queue');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].resource).toBe('comment');
    });

    it('loads queue from localStorage on init', () => {
      const queue = [
        {
          id: 'op-1',
          type: 'create',
          resource: 'comment',
          endpoint: '/api/comments',
          method: 'POST',
          createdAt: Date.now(),
          attempts: 0,
          priority: 5,
          maxRetries: 5,
        },
      ];
      localStorage.setItem('streetstudio_sync_queue', JSON.stringify(queue));

      const newManager = new BackgroundSyncManager({
        executor: mockExecutor,
        autoSync: false,
      });

      expect(newManager.getQueueSize()).toBe(1);
      newManager.destroy();
    });
  });

  describe('retry', () => {
    it('retries a specific operation', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Temporary'));
      mockExecutor.mockResolvedValueOnce({ success: true });

      syncManager.enqueue({
        type: 'create',
        resource: 'comment',
        endpoint: '/api/comments',
        method: 'POST',
      });

      // First attempt fails
      await syncManager.processQueue();
      expect(syncManager.getQueueSize()).toBe(1);

      // Manual retry succeeds
      const queue = syncManager.getQueue();
      const result = await syncManager.retry(queue[0].id);

      expect(result?.success).toBe(true);
    });

    it('returns null for non-existent operation', async () => {
      const result = await syncManager.retry('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('status', () => {
    it('starts with idle status', () => {
      expect(syncManager.getStatus()).toBe('idle');
    });

    it('reports online status', () => {
      expect(syncManager.getIsOnline()).toBe(true);
    });
  });
});
