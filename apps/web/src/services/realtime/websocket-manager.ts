/**
 * WebSocket Connection Manager
 *
 * Enhanced WebSocket connection management with:
 * - Auto-reconnection with exponential backoff
 * - Heartbeat/ping-pong keep-alive
 * - Connection state tracking with event emitter
 * - Graceful degradation to polling fallback
 *
 * Requirements: 7.2, 7.9, 7.10
 */

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'polling';

export interface WebSocketConnectionOptions {
  /** WebSocket server URL */
  url: string;
  /** Optional sub-protocols */
  protocols?: string[];
  /** Whether to auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Base reconnection delay in ms (default: 1000) */
  reconnectBaseDelay?: number;
  /** Maximum reconnection delay in ms (default: 30000) */
  reconnectMaxDelay?: number;
  /** Maximum number of reconnection attempts before failing (default: 15) */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in ms (default: 25000) */
  heartbeatInterval?: number;
  /** Heartbeat timeout in ms — if no pong received (default: 10000) */
  heartbeatTimeout?: number;
  /** Connection timeout in ms (default: 10000) */
  connectionTimeout?: number;
  /** Authentication token provider */
  getAuthToken?: () => string | Promise<string>;
  /** Polling interval in ms for fallback mode (default: 5000) */
  pollingInterval?: number;
  /** Polling URL for fallback mode */
  pollingUrl?: string;
}

export interface WebSocketEvent {
  type: string;
  payload: unknown;
  id?: string;
  timestamp?: string;
  userId?: string;
}

export type ConnectionEventType =
  | 'statusChange'
  | 'message'
  | 'error'
  | 'reconnecting'
  | 'reconnected';

export type ConnectionEventHandler = (data: unknown) => void;

const DEFAULT_OPTIONS: Required<Omit<WebSocketConnectionOptions, 'url' | 'getAuthToken' | 'pollingUrl'>> & {
  getAuthToken?: () => string | Promise<string>;
  pollingUrl?: string;
} = {
  protocols: [],
  autoReconnect: true,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  maxReconnectAttempts: 15,
  heartbeatInterval: 25000,
  heartbeatTimeout: 10000,
  connectionTimeout: 10000,
  pollingInterval: 5000,
};

/**
 * Manages a WebSocket connection with resilience features:
 * exponential backoff reconnection, heartbeat keep-alive,
 * connection state tracking, and polling fallback.
 */
export class RealtimeWebSocketManager {
  private ws: WebSocket | null = null;
  private options: Required<Omit<WebSocketConnectionOptions, 'getAuthToken' | 'pollingUrl'>> & {
    getAuthToken?: () => string | Promise<string>;
    pollingUrl?: string;
  };
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: WebSocketEvent[] = [];
  private eventListeners = new Map<ConnectionEventType, Set<ConnectionEventHandler>>();
  private lastPongTimestamp = 0;
  private connectionAttemptTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WebSocketConnectionOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as any;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Establish connection to the WebSocket server.
   */
  public async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.setStatus('connecting');
    this.reconnectAttempts = 0;

    try {
      await this.createConnection();
    } catch (error) {
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.setStatus('failed');
        throw error;
      }
    }
  }

  /**
   * Gracefully disconnect from the WebSocket server.
   */
  public disconnect(): void {
    this.clearTimers();
    this.stopPollingFallback();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message through the WebSocket connection.
   * If disconnected, messages are queued and sent on reconnect.
   */
  public send(event: WebSocketEvent): void {
    const message: WebSocketEvent = {
      ...event,
      id: event.id || generateId(),
      timestamp: event.timestamp || new Date().toISOString(),
    };

    if (this.status !== 'connected' || !this.ws) {
      this.messageQueue.push(message);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch {
      this.messageQueue.push(message);
    }
  }

  /**
   * Subscribe to connection events.
   */
  public on(event: ConnectionEventType, handler: ConnectionEventHandler): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);

    return () => {
      this.eventListeners.get(event)?.delete(handler);
    };
  }

  /**
   * Get current connection status.
   */
  public getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get the number of queued messages awaiting delivery.
   */
  public getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Get the current reconnection attempt number.
   */
  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Force immediate reconnection attempt (resets attempt counter).
   */
  public forceReconnect(): void {
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.connect();
  }

  // -------------------------------------------------------------------------
  // Private: Connection Management
  // -------------------------------------------------------------------------

  private async createConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url, this.options.protocols);
      } catch (error) {
        reject(error);
        return;
      }

      // Connection timeout
      this.connectionAttemptTimer = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, this.options.connectionTimeout);

      this.ws.onopen = async () => {
        this.clearConnectionTimeout();
        await this.handleOpen();
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event);
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.clearConnectionTimeout();
        this.handleClose(event);
      };

      this.ws.onerror = () => {
        this.clearConnectionTimeout();
        this.emit('error', new Error('WebSocket connection error'));
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  private async handleOpen(): Promise<void> {
    // Send auth token if provider is configured
    if (this.options.getAuthToken) {
      const token = await this.options.getAuthToken();
      this.ws?.send(JSON.stringify({ type: 'auth', payload: { token } }));
    }

    const wasReconnecting = this.status === 'reconnecting';
    this.setStatus('connected');
    this.reconnectAttempts = 0;
    this.lastPongTimestamp = Date.now();

    // Start heartbeat
    this.startHeartbeat();

    // Stop polling fallback if active
    this.stopPollingFallback();

    // Flush message queue
    this.flushMessageQueue();

    if (wasReconnecting) {
      this.emit('reconnected', null);
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as WebSocketEvent;

      // Handle pong responses
      if (data.type === 'pong') {
        this.lastPongTimestamp = Date.now();
        this.clearHeartbeatTimeout();
        return;
      }

      this.emit('message', data);
    } catch {
      // Non-JSON message, ignore
    }
  }

  private handleClose(event: CloseEvent): void {
    this.ws = null;
    this.stopHeartbeat();

    // Normal closure or intentional disconnect
    if (event.code === 1000) {
      this.setStatus('disconnected');
      return;
    }

    // Attempt reconnection
    if (this.options.autoReconnect) {
      this.scheduleReconnect();
    } else {
      this.setStatus('disconnected');
    }
  }

  // -------------------------------------------------------------------------
  // Private: Reconnection with Exponential Backoff
  // -------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setStatus('failed');
      // Fall back to polling
      this.startPollingFallback();
      return;
    }

    this.setStatus('reconnecting');
    this.reconnectAttempts++;

    const delay = this.calculateBackoff();
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.createConnection();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Calculate exponential backoff delay with jitter.
   */
  private calculateBackoff(): number {
    const exponential = this.options.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1);
    const capped = Math.min(exponential, this.options.reconnectMaxDelay);
    // Add random jitter ±25%
    const jitter = capped * (0.75 + Math.random() * 0.5);
    return Math.round(jitter);
  }

  // -------------------------------------------------------------------------
  // Private: Heartbeat / Keep-Alive
  // -------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.status !== 'connected' || !this.ws) return;

      try {
        this.ws.send(JSON.stringify({ type: 'ping', payload: {} }));
        this.startHeartbeatTimeout();
      } catch {
        // Connection may be broken
        this.handleHeartbeatFailure();
      }
    }, this.options.heartbeatInterval);
  }

  private startHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();
    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.handleHeartbeatFailure();
    }, this.options.heartbeatTimeout);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private handleHeartbeatFailure(): void {
    // Connection is likely dead — force reconnect
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.stopHeartbeat();
    this.scheduleReconnect();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  // -------------------------------------------------------------------------
  // Private: Polling Fallback
  // -------------------------------------------------------------------------

  private startPollingFallback(): void {
    if (!this.options.pollingUrl) return;

    this.setStatus('polling');

    this.pollingTimer = setInterval(async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.options.getAuthToken) {
          const token = await this.options.getAuthToken();
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(this.options.pollingUrl!, { headers });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              this.emit('message', msg);
            }
          }
        }
      } catch {
        // Polling failed, will retry next interval
      }
    }, this.options.pollingInterval);
  }

  private stopPollingFallback(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Utilities
  // -------------------------------------------------------------------------

  private flushMessageQueue(): void {
    const queued = [...this.messageQueue];
    this.messageQueue = [];

    for (const msg of queued) {
      this.send(msg);
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status === newStatus) return;
    const previousStatus = this.status;
    this.status = newStatus;
    this.emit('statusChange', { previous: previousStatus, current: newStatus });
  }

  private emit(event: ConnectionEventType, data: unknown): void {
    const handlers = this.eventListeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch {
        // Don't let listener errors break the manager
      }
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.clearConnectionTimeout();
  }

  private clearConnectionTimeout(): void {
    if (this.connectionAttemptTimer) {
      clearTimeout(this.connectionAttemptTimer);
      this.connectionAttemptTimer = null;
    }
  }
}

// -------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
