/**
 * Cache Invalidation Service
 *
 * Provides intelligent cache invalidation tied to real-time WebSocket updates.
 * When the server broadcasts data changes, this service invalidates the
 * relevant cache entries so subsequent reads fetch fresh data.
 *
 * Requirements: 12.3, 12.6
 */

import { logger } from '../app/client-logger.js';
import { CacheManager, getCacheManager } from './cache-manager.js';
import { WebSocketManager, getCollaborationSocket, WebSocketMessage } from './websocket.js';

export interface InvalidationRule {
  /** WebSocket message type that triggers this rule */
  messageType: string;
  /** Function to derive cache keys to invalidate from the message payload */
  getCacheKeys: (payload: any) => string[];
  /** Optional pattern-based invalidation (prefix match) */
  getCachePatterns?: (payload: any) => string[];
}

export interface InvalidationEvent {
  messageType: string;
  invalidatedKeys: string[];
  invalidatedPatterns: string[];
  timestamp: number;
}

export type InvalidationListener = (event: InvalidationEvent) => void;

export class CacheInvalidationService {
  private rules: InvalidationRule[] = [];
  private cacheManager: CacheManager;
  private wsUnsubscribers: Array<() => void> = [];
  private listeners: Set<InvalidationListener> = new Set();
  private invalidationLog: InvalidationEvent[] = [];
  private maxLogSize = 100;

  constructor(cacheManager?: CacheManager) {
    this.cacheManager = cacheManager ?? getCacheManager();
    this.registerDefaultRules();
  }

  /**
   * Connect to the WebSocket and start listening for invalidation events
   */
  public connect(wsManager?: WebSocketManager): void {
    const ws = wsManager ?? getCollaborationSocket();
    if (!ws) {
      logger.warn('No WebSocket available for cache invalidation');
      return;
    }

    // Unsubscribe from previous connection if any
    this.disconnect();

    // Subscribe to all registered message types
    const messageTypes = new Set(this.rules.map((r) => r.messageType));

    for (const messageType of messageTypes) {
      const unsub = ws.subscribe(messageType, (message: WebSocketMessage) => {
        this.handleMessage(message);
      });
      this.wsUnsubscribers.push(unsub);
    }

    logger.info('Cache invalidation connected', {
      messageTypes: Array.from(messageTypes),
    });
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    for (const unsub of this.wsUnsubscribers) {
      unsub();
    }
    this.wsUnsubscribers = [];
  }

  /**
   * Register a custom invalidation rule
   */
  public addRule(rule: InvalidationRule): void {
    this.rules.push(rule);
    logger.debug('Invalidation rule added', { messageType: rule.messageType });
  }

  /**
   * Remove rules for a specific message type
   */
  public removeRules(messageType: string): void {
    this.rules = this.rules.filter((r) => r.messageType !== messageType);
  }

  /**
   * Subscribe to invalidation events
   */
  public onInvalidation(listener: InvalidationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Manually trigger invalidation for a message (useful for testing or
   * non-WebSocket triggers like polling)
   */
  public triggerInvalidation(message: WebSocketMessage): void {
    this.handleMessage(message);
  }

  /**
   * Get recent invalidation log for debugging
   */
  public getInvalidationLog(): InvalidationEvent[] {
    return [...this.invalidationLog];
  }

  /**
   * Clear the invalidation log
   */
  public clearLog(): void {
    this.invalidationLog = [];
  }

  private handleMessage(message: WebSocketMessage): void {
    const matchingRules = this.rules.filter((r) => r.messageType === message.type);

    if (matchingRules.length === 0) return;

    const invalidatedKeys: string[] = [];
    const invalidatedPatterns: string[] = [];

    for (const rule of matchingRules) {
      // Key-based invalidation
      const keys = rule.getCacheKeys(message.payload);
      for (const key of keys) {
        if (this.cacheManager.invalidate(key)) {
          invalidatedKeys.push(key);
        }
      }

      // Pattern-based invalidation
      if (rule.getCachePatterns) {
        const patterns = rule.getCachePatterns(message.payload);
        for (const pattern of patterns) {
          const count = this.cacheManager.invalidatePattern(pattern);
          if (count > 0) {
            invalidatedPatterns.push(pattern);
          }
        }
      }
    }

    if (invalidatedKeys.length > 0 || invalidatedPatterns.length > 0) {
      const event: InvalidationEvent = {
        messageType: message.type,
        invalidatedKeys,
        invalidatedPatterns,
        timestamp: Date.now(),
      };

      this.logEvent(event);
      this.notifyListeners(event);

      logger.debug('Cache invalidated via WebSocket', {
        messageType: message.type,
        keys: invalidatedKeys.length,
        patterns: invalidatedPatterns.length,
      });
    }
  }

  private logEvent(event: InvalidationEvent): void {
    this.invalidationLog.push(event);
    if (this.invalidationLog.length > this.maxLogSize) {
      this.invalidationLog = this.invalidationLog.slice(-this.maxLogSize);
    }
  }

  private notifyListeners(event: InvalidationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Invalidation listener error', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Register default invalidation rules for common StreetStudio data types
   */
  private registerDefaultRules(): void {
    // Video updates
    this.addRule({
      messageType: 'video.updated',
      getCacheKeys: (payload) => [
        `video:${payload.videoId}`,
        `video:${payload.videoId}:metadata`,
      ],
      getCachePatterns: (payload) => [
        `video:${payload.videoId}:comments`,
        `project:${payload.projectId}:videos`,
      ],
    });

    // Video processing status changes
    this.addRule({
      messageType: 'video.processing',
      getCacheKeys: (payload) => [
        `video:${payload.videoId}`,
        `video:${payload.videoId}:status`,
      ],
    });

    // Comment changes
    this.addRule({
      messageType: 'comment.added',
      getCacheKeys: (payload) => [`video:${payload.videoId}:comments`],
    });

    this.addRule({
      messageType: 'comment.updated',
      getCacheKeys: (payload) => [
        `video:${payload.videoId}:comments`,
        `comment:${payload.commentId}`,
      ],
    });

    this.addRule({
      messageType: 'comment.deleted',
      getCacheKeys: (payload) => [
        `video:${payload.videoId}:comments`,
        `comment:${payload.commentId}`,
      ],
    });

    // Project changes
    this.addRule({
      messageType: 'project.updated',
      getCacheKeys: (payload) => [`project:${payload.projectId}`],
      getCachePatterns: (payload) => [`project:${payload.projectId}:`],
    });

    // Member/organization changes
    this.addRule({
      messageType: 'member.updated',
      getCacheKeys: (payload) => [`member:${payload.memberId}`],
      getCachePatterns: (payload) => [
        `org:${payload.organizationId}:members`,
      ],
    });

    // Presence updates (short-lived, invalidate quickly)
    this.addRule({
      messageType: 'presence.update',
      getCacheKeys: (payload) => [`presence:${payload.videoId}`],
    });

    // Reaction changes
    this.addRule({
      messageType: 'reaction.added',
      getCacheKeys: (payload) => [
        `video:${payload.videoId}:reactions`,
        `comment:${payload.commentId}:reactions`,
      ].filter((k) => !k.includes('undefined')),
    });

    this.addRule({
      messageType: 'reaction.removed',
      getCacheKeys: (payload) => [
        `video:${payload.videoId}:reactions`,
        `comment:${payload.commentId}:reactions`,
      ].filter((k) => !k.includes('undefined')),
    });
  }
}

// Singleton instance
let globalInvalidationService: CacheInvalidationService | null = null;

export function getCacheInvalidationService(): CacheInvalidationService {
  if (!globalInvalidationService) {
    globalInvalidationService = new CacheInvalidationService();
  }
  return globalInvalidationService;
}

export function initializeCacheInvalidation(
  cacheManager?: CacheManager,
  wsManager?: WebSocketManager
): CacheInvalidationService {
  globalInvalidationService = new CacheInvalidationService(cacheManager);
  globalInvalidationService.connect(wsManager);
  return globalInvalidationService;
}
