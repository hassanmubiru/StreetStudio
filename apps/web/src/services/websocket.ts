/**
 * WebSocket Service
 * 
 * Handles real-time communication with automatic reconnection,
 * error handling, and graceful degradation for collaboration features.
 */

import { handleError, getDegradationManager } from '../app/error-handler.js';
import { logger } from '../app/client-logger.js';

export interface WebSocketMessage {
  id?: string;
  type: string;
  payload: any;
  timestamp?: string;
  userId?: string;
}

export interface WebSocketOptions {
  url: string;
  protocols?: string[];
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  messageTimeout?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface SubscriptionHandler {
  (message: WebSocketMessage): void;
}

export enum ConnectionState {
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Reconnecting = 'reconnecting',
  Failed = 'failed',
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private options: Required<WebSocketOptions>;
  private state = ConnectionState.Disconnected;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private subscriptions = new Map<string, Set<SubscriptionHandler>>();
  private pendingMessages = new Map<string, { resolve: Function; reject: Function; timeout: number }>();

  constructor(options: WebSocketOptions) {
    this.options = {
      protocols: [],
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      messageTimeout: 10000,
      onMessage: () => {},
      onConnect: () => {},
      onDisconnect: () => {},
      onError: () => {},
      ...options,
    };
  }

  /**
   * Connect to WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.state === ConnectionState.Connected || this.state === ConnectionState.Connecting) {
      return;
    }

    this.state = ConnectionState.Connecting;
    this.reconnectAttempts = 0;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url, this.options.protocols);
        
        const connectTimeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.handleConnect();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          this.handleDisconnect(event);
        };

        this.ws.onerror = (event) => {
          clearTimeout(connectTimeout);
          this.handleError(new Error('WebSocket connection error'));
          reject(new Error('WebSocket connection failed'));
        };

      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.options.reconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = ConnectionState.Disconnected;
  }

  /**
   * Send message through WebSocket
   */
  public async send(message: Omit<WebSocketMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: WebSocketMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...message,
    };

    if (this.state !== ConnectionState.Connected) {
      // Queue message for when connection is restored
      this.messageQueue.push(fullMessage);
      
      // Try to reconnect if not already trying
      if (this.state === ConnectionState.Disconnected) {
        this.reconnect();
      }
      
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      try {
        this.ws.send(JSON.stringify(fullMessage));
        
        // Set up response timeout for request-response messages
        if (message.type.endsWith('Request')) {
          const timeoutId = setTimeout(() => {
            this.pendingMessages.delete(fullMessage.id!);
            reject(new Error('Message timeout'));
          }, this.options.messageTimeout);

          this.pendingMessages.set(fullMessage.id!, {
            resolve,
            reject,
            timeout: timeoutId as any,
          });
        } else {
          resolve();
        }

        logger.debug('WebSocket message sent', {
          messageId: fullMessage.id,
          type: message.type,
        });

      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to specific message types
   */
  public subscribe(messageType: string, handler: SubscriptionHandler): () => void {
    if (!this.subscriptions.has(messageType)) {
      this.subscriptions.set(messageType, new Set());
    }
    
    this.subscriptions.get(messageType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.subscriptions.get(messageType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(messageType);
        }
      }
    };
  }

  /**
   * Get current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === ConnectionState.Connected;
  }

  /**
   * Get queued message count
   */
  public getQueueSize(): number {
    return this.messageQueue.length;
  }

  private handleConnect(): void {
    this.state = ConnectionState.Connected;
    this.reconnectAttempts = 0;

    logger.info('WebSocket connected');

    // Start heartbeat
    this.startHeartbeat();

    // Send queued messages
    this.processMessageQueue();

    // Notify listeners
    this.options.onConnect();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      logger.debug('WebSocket message received', {
        messageId: message.id,
        type: message.type,
      });

      // Handle response to pending request
      if (message.id && this.pendingMessages.has(message.id)) {
        const pending = this.pendingMessages.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingMessages.delete(message.id);
        pending.resolve();
        return;
      }

      // Handle heartbeat response
      if (message.type === 'pong') {
        return;
      }

      // Notify global handler
      this.options.onMessage(message);

      // Notify specific subscribers
      const handlers = this.subscriptions.get(message.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            logger.error('Error in WebSocket message handler', {
              messageType: message.type,
              error: (error as Error).message,
            });
          }
        });
      }

    } catch (error) {
      this.handleError(new Error(`Failed to parse WebSocket message: ${error.message}`));
    }
  }

  private handleDisconnect(event: CloseEvent): void {
    this.state = ConnectionState.Disconnected;
    this.ws = null;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Reject pending messages
    this.pendingMessages.forEach(pending => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebSocket disconnected'));
    });
    this.pendingMessages.clear();

    logger.warn('WebSocket disconnected', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });

    // Notify listeners
    this.options.onDisconnect();

    // Try to reconnect if configured
    if (this.options.reconnect && event.code !== 1000) {
      this.reconnect();
    } else {
      // Handle graceful degradation
      const degradationManager = getDegradationManager();
      if (degradationManager) {
        degradationManager.handleFeatureFailure(
          'realtime-collaboration',
          new Error('WebSocket connection lost')
        );
      }
    }
  }

  private handleError(error: Error): void {
    logger.error('WebSocket error', {
      error: error.message,
      state: this.state,
    });

    // Handle error through error system
    handleError(error, 'network', {
      feature: 'realtime-collaboration',
      websocketState: this.state,
      reconnectAttempts: this.reconnectAttempts,
    });

    this.options.onError(error);
  }

  private reconnect(): void {
    if (this.state === ConnectionState.Reconnecting || 
        this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.state = ConnectionState.Failed;
      
      // Handle graceful degradation
      const degradationManager = getDegradationManager();
      if (degradationManager) {
        degradationManager.handleFeatureFailure(
          'realtime-collaboration',
          new Error('WebSocket reconnection failed')
        );
      }
      
      return;
    }

    this.state = ConnectionState.Reconnecting;
    this.reconnectAttempts++;

    const delay = this.options.reconnectInterval * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5));

    logger.info(`Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`, {
      attempts: this.reconnectAttempts,
      maxAttempts: this.options.maxReconnectAttempts,
    });

    this.reconnectTimer = window.setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.warn('WebSocket reconnection failed', {
          attempt: this.reconnectAttempts,
          error: error.message,
        });
        
        // Try again
        this.reconnect();
      }
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = window.setInterval(() => {
      if (this.state === ConnectionState.Connected) {
        this.send({ type: 'ping', payload: {} }).catch(() => {
          // Heartbeat failed, connection might be broken
          logger.warn('WebSocket heartbeat failed');
        });
      }
    }, this.options.heartbeatInterval);
  }

  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    logger.info(`Processing ${this.messageQueue.length} queued messages`);

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(message => {
      this.send(message).catch(error => {
        logger.error('Failed to send queued message', {
          messageId: message.id,
          error: error.message,
        });
      });
    });
  }
}

// Singleton WebSocket manager for real-time collaboration
let collaborationSocket: WebSocketManager | null = null;

export function initializeCollaborationSocket(baseUrl: string): WebSocketManager {
  if (collaborationSocket) {
    collaborationSocket.disconnect();
  }

  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws/collaboration';
  
  collaborationSocket = new WebSocketManager({
    url: wsUrl,
    reconnect: true,
    onConnect: () => {
      logger.info('Collaboration socket connected');
    },
    onDisconnect: () => {
      logger.warn('Collaboration socket disconnected');
    },
    onError: (error) => {
      logger.error('Collaboration socket error', { error: error.message });
    },
  });

  return collaborationSocket;
}

export function getCollaborationSocket(): WebSocketManager | null {
  return collaborationSocket;
}

// Helper functions for common collaboration messages
export async function sendPresenceUpdate(data: {
  videoId?: string;
  projectId?: string;
  timestamp: number;
}): Promise<void> {
  if (!collaborationSocket || !collaborationSocket.isConnected()) {
    // Gracefully fail if WebSocket not available
    return;
  }

  return collaborationSocket.send({
    type: 'presence.update',
    payload: data,
  });
}

export async function sendCommentAdded(data: {
  videoId: string;
  comment: any;
}): Promise<void> {
  if (!collaborationSocket || !collaborationSocket.isConnected()) {
    // Gracefully fail if WebSocket not available
    return;
  }

  return collaborationSocket.send({
    type: 'comment.added',
    payload: data,
  });
}

export function subscribeToVideoEvents(
  videoId: string,
  handlers: {
    onPresenceUpdate?: (users: any[]) => void;
    onCommentAdded?: (comment: any) => void;
    onPlaybackSync?: (position: number) => void;
  }
): () => void {
  if (!collaborationSocket) {
    return () => {}; // No-op unsubscribe
  }

  const unsubscribers: Array<() => void> = [];

  if (handlers.onPresenceUpdate) {
    const unsub = collaborationSocket.subscribe('presence.update', (message) => {
      if (message.payload.videoId === videoId) {
        handlers.onPresenceUpdate!(message.payload.users);
      }
    });
    unsubscribers.push(unsub);
  }

  if (handlers.onCommentAdded) {
    const unsub = collaborationSocket.subscribe('comment.added', (message) => {
      if (message.payload.videoId === videoId) {
        handlers.onCommentAdded!(message.payload.comment);
      }
    });
    unsubscribers.push(unsub);
  }

  if (handlers.onPlaybackSync) {
    const unsub = collaborationSocket.subscribe('playback.sync', (message) => {
      if (message.payload.videoId === videoId) {
        handlers.onPlaybackSync!(message.payload.position);
      }
    });
    unsubscribers.push(unsub);
  }

  // Return combined unsubscribe function
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}