/**
 * Connectivity Status Manager
 * 
 * Monitors network connectivity and provides UI indicators for online/offline
 * status. Uses both navigator.onLine and actual connectivity testing for
 * accurate status reporting.
 * 
 * Requirements: 10.7, 13.4
 */

export type ConnectivityState = 'online' | 'offline' | 'reconnecting' | 'degraded';

export interface ConnectivityInfo {
  state: ConnectivityState;
  isOnline: boolean;
  lastOnline?: number;
  lastOffline?: number;
  reconnectAttempts: number;
  latencyMs?: number;
  effectiveType?: string;
}

export interface ConnectivityCallbacks {
  onOnline?: (info: ConnectivityInfo) => void;
  onOffline?: (info: ConnectivityInfo) => void;
  onStateChange?: (info: ConnectivityInfo) => void;
  onReconnecting?: (attempt: number) => void;
}

export interface ConnectivityStatusOptions {
  pingUrl?: string;
  pingIntervalMs?: number;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  showBanner?: boolean;
  bannerPosition?: 'top' | 'bottom';
  callbacks?: ConnectivityCallbacks;
}

const DEFAULT_OPTIONS: Required<Omit<ConnectivityStatusOptions, 'callbacks'>> & { callbacks: ConnectivityCallbacks } = {
  pingUrl: '/api/health',
  pingIntervalMs: 30000, // 30 seconds
  reconnectIntervalMs: 5000, // 5 seconds
  maxReconnectAttempts: 10,
  showBanner: true,
  bannerPosition: 'top',
  callbacks: {},
};

/**
 * ConnectivityStatusManager monitors and displays network connectivity status
 */
export class ConnectivityStatusManager {
  private options: Required<Omit<ConnectivityStatusOptions, 'callbacks'>> & { callbacks: ConnectivityCallbacks };
  private info: ConnectivityInfo;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerElement: HTMLElement | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private isDestroyed = false;

  constructor(options: ConnectivityStatusOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.info = {
      state: navigator.onLine ? 'online' : 'offline',
      isOnline: navigator.onLine,
      reconnectAttempts: 0,
    };
  }

  /**
   * Start monitoring connectivity
   */
  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    // Set initial state
    if (!navigator.onLine) {
      this.info.state = 'offline';
      this.info.isOnline = false;
      this.info.lastOffline = Date.now();
    }

    // Listen for browser online/offline events
    this.onlineHandler = () => this.handleOnline();
    this.offlineHandler = () => this.handleOffline();
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);

    // Monitor Network Information API for connection quality changes
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        connection.addEventListener('change', () => {
          this.updateConnectionInfo();
        });
        this.updateConnectionInfo();
      }
    }

    // Start periodic connectivity check
    this.startPingCheck();

    // Show initial banner if offline
    if (!navigator.onLine && this.options.showBanner) {
      this.showOfflineBanner();
    }
  }

  /**
   * Stop monitoring connectivity
   */
  public stop(): void {
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.offlineHandler) {
      window.removeEventListener('offline', this.offlineHandler);
      this.offlineHandler = null;
    }
    this.stopPingCheck();
    this.stopReconnecting();
    this.removeBanner();
  }

  /**
   * Get current connectivity info
   */
  public getInfo(): ConnectivityInfo {
    return { ...this.info };
  }

  /**
   * Get current connectivity state
   */
  public getState(): ConnectivityState {
    return this.info.state;
  }

  /**
   * Check if currently online
   */
  public isOnline(): boolean {
    return this.info.isOnline;
  }

  /**
   * Force a connectivity check
   */
  public async checkConnectivity(): Promise<boolean> {
    return this.performPing();
  }

  /**
   * Destroy the manager and clean up all resources
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.stop();
  }

  // === Private Methods ===

  private handleOnline(): void {
    // Browser reports online - verify with ping
    this.info.state = 'reconnecting';
    this.info.reconnectAttempts = 0;
    this.options.callbacks.onReconnecting?.(0);

    this.performPing().then((isReachable) => {
      if (isReachable) {
        this.setOnline();
      } else {
        this.info.state = 'degraded';
        this.startReconnecting();
      }
    });
  }

  private handleOffline(): void {
    this.setOffline();
  }

  private setOnline(): void {
    const wasOffline = !this.info.isOnline;
    this.info.state = 'online';
    this.info.isOnline = true;
    this.info.lastOnline = Date.now();
    this.info.reconnectAttempts = 0;

    this.stopReconnecting();

    if (wasOffline) {
      this.options.callbacks.onOnline?.(this.info);
      this.options.callbacks.onStateChange?.(this.info);
      this.hideBanner();
    }
  }

  private setOffline(): void {
    const wasOnline = this.info.isOnline;
    this.info.state = 'offline';
    this.info.isOnline = false;
    this.info.lastOffline = Date.now();

    if (wasOnline) {
      this.options.callbacks.onOffline?.(this.info);
      this.options.callbacks.onStateChange?.(this.info);

      if (this.options.showBanner) {
        this.showOfflineBanner();
      }
    }
  }

  private async performPing(): Promise<boolean> {
    try {
      const startTime = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.options.pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.info.latencyMs = Math.round(performance.now() - startTime);

      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  private startPingCheck(): void {
    if (this.pingInterval) {
      return;
    }

    this.pingInterval = setInterval(async () => {
      if (this.isDestroyed) return;

      const wasOnline = this.info.isOnline;
      const isReachable = await this.performPing();

      if (isReachable && !wasOnline) {
        this.setOnline();
      } else if (!isReachable && wasOnline) {
        this.setOffline();
        this.startReconnecting();
      }
    }, this.options.pingIntervalMs);
  }

  private stopPingCheck(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private startReconnecting(): void {
    if (this.reconnectTimer || this.info.reconnectAttempts >= this.options.maxReconnectAttempts) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      if (this.isDestroyed) return;

      this.info.reconnectAttempts++;
      this.info.state = 'reconnecting';
      this.options.callbacks.onReconnecting?.(this.info.reconnectAttempts);
      this.options.callbacks.onStateChange?.(this.info);

      const isReachable = await this.performPing();

      if (isReachable) {
        this.setOnline();
      } else if (this.info.reconnectAttempts < this.options.maxReconnectAttempts) {
        this.startReconnecting();
      } else {
        this.info.state = 'offline';
        this.options.callbacks.onStateChange?.(this.info);
      }
    }, this.options.reconnectIntervalMs);
  }

  private stopReconnecting(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateConnectionInfo(): void {
    const connection = (navigator as any).connection;
    if (connection) {
      this.info.effectiveType = connection.effectiveType;
    }
  }

  // === Banner UI ===

  private showOfflineBanner(): void {
    if (this.bannerElement || typeof document === 'undefined') {
      return;
    }

    this.bannerElement = document.createElement('div');
    this.bannerElement.setAttribute('role', 'alert');
    this.bannerElement.setAttribute('aria-live', 'assertive');
    this.bannerElement.setAttribute('aria-atomic', 'true');
    this.bannerElement.setAttribute('data-testid', 'offline-banner');

    const isTop = this.options.bannerPosition === 'top';

    this.bannerElement.style.cssText = `
      position: fixed;
      ${isTop ? 'top: 0' : 'bottom: 0'};
      left: 0;
      right: 0;
      z-index: 9999;
      background-color: #f59e0b;
      color: #1f2937;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transform: translateY(${isTop ? '-100%' : '100%'});
      transition: transform 300ms ease-out;
    `;

    this.bannerElement.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
      </svg>
      <span>You are currently offline. Some features may be unavailable.</span>
      <button 
        aria-label="Dismiss offline notification"
        style="
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          margin-left: 8px;
          color: inherit;
          line-height: 1;
        "
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    // Add dismiss handler
    const dismissButton = this.bannerElement.querySelector('button');
    if (dismissButton) {
      dismissButton.addEventListener('click', () => {
        this.hideBanner();
      });
    }

    document.body.appendChild(this.bannerElement);

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.bannerElement) {
        this.bannerElement.style.transform = 'translateY(0)';
      }
    });
  }

  private hideBanner(): void {
    if (!this.bannerElement) {
      return;
    }

    const isTop = this.options.bannerPosition === 'top';
    this.bannerElement.style.transform = `translateY(${isTop ? '-100%' : '100%'})`;

    setTimeout(() => {
      this.removeBanner();
    }, 300);
  }

  private removeBanner(): void {
    if (this.bannerElement && this.bannerElement.parentNode) {
      this.bannerElement.parentNode.removeChild(this.bannerElement);
      this.bannerElement = null;
    }
  }
}

// === Singleton Instance ===

let connectivityManager: ConnectivityStatusManager | null = null;

/**
 * Initialize the connectivity status manager
 */
export function initializeConnectivityMonitor(
  options?: ConnectivityStatusOptions
): ConnectivityStatusManager {
  if (!connectivityManager) {
    connectivityManager = new ConnectivityStatusManager(options);
    connectivityManager.start();
  }
  return connectivityManager;
}

/**
 * Get the shared connectivity manager
 */
export function getConnectivityManager(): ConnectivityStatusManager | null {
  return connectivityManager;
}

/**
 * Quick check if the app is currently online
 */
export function isAppOnline(): boolean {
  if (connectivityManager) {
    return connectivityManager.isOnline();
  }
  return navigator.onLine;
}

/**
 * Get current connectivity state
 */
export function getConnectivityState(): ConnectivityState {
  if (connectivityManager) {
    return connectivityManager.getState();
  }
  return navigator.onLine ? 'online' : 'offline';
}
