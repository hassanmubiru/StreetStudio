/**
 * Service Worker Registration
 * 
 * Handles service worker lifecycle management including:
 * - Registration with update checking
 * - Update notifications and activation
 * - Unregistration for development/debugging
 * 
 * Requirements: 10.7, 12.6
 */

export interface ServiceWorkerStatus {
  isSupported: boolean;
  isRegistered: boolean;
  isActive: boolean;
  isWaiting: boolean;
  updateAvailable: boolean;
  lastUpdateCheck?: number;
  error?: string;
}

export interface ServiceWorkerCallbacks {
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  onActivated?: () => void;
  onError?: (error: Error) => void;
  onOfflineFallback?: () => void;
}

export interface ServiceWorkerRegistrationOptions {
  scriptUrl?: string;
  scope?: string;
  updateInterval?: number; // ms between update checks
  callbacks?: ServiceWorkerCallbacks;
}

const DEFAULT_OPTIONS: Required<Omit<ServiceWorkerRegistrationOptions, 'callbacks'>> & { callbacks: ServiceWorkerCallbacks } = {
  scriptUrl: '/service-worker.js',
  scope: '/',
  updateInterval: 60 * 60 * 1000, // 1 hour
  callbacks: {},
};

/**
 * ServiceWorkerManager handles the lifecycle of the service worker
 */
export class ServiceWorkerManager {
  private options: Required<Omit<ServiceWorkerRegistrationOptions, 'callbacks'>> & { callbacks: ServiceWorkerCallbacks };
  private registration: ServiceWorkerRegistration | null = null;
  private updateCheckInterval: ReturnType<typeof setInterval> | null = null;
  private status: ServiceWorkerStatus = {
    isSupported: false,
    isRegistered: false,
    isActive: false,
    isWaiting: false,
    updateAvailable: false,
  };

  constructor(options: ServiceWorkerRegistrationOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.status.isSupported = 'serviceWorker' in navigator;
  }

  /**
   * Register the service worker
   */
  public async register(): Promise<ServiceWorkerStatus> {
    if (!this.status.isSupported) {
      this.status.error = 'Service Workers are not supported in this browser';
      return this.status;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        this.options.scriptUrl,
        { scope: this.options.scope }
      );

      this.registration = registration;
      this.status.isRegistered = true;

      // Handle initial state
      if (registration.active) {
        this.status.isActive = true;
        this.options.callbacks.onActivated?.();
      }

      if (registration.waiting) {
        this.status.isWaiting = true;
        this.status.updateAvailable = true;
        this.options.callbacks.onUpdateAvailable?.(registration);
      }

      // Listen for state changes
      registration.addEventListener('updatefound', () => {
        this.handleUpdateFound(registration);
      });

      // Listen for controller changes (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.status.isActive = true;
        this.status.isWaiting = false;
        this.status.updateAvailable = false;
        this.options.callbacks.onActivated?.();
      });

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });

      // Trigger registered callback
      this.options.callbacks.onRegistered?.(registration);

      // Start periodic update checks
      this.startUpdateChecking();

      this.status.lastUpdateCheck = Date.now();

    } catch (error) {
      this.status.error = (error as Error).message;
      this.options.callbacks.onError?.(error as Error);
    }

    return this.status;
  }

  /**
   * Unregister the service worker
   */
  public async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    this.stopUpdateChecking();

    try {
      const success = await this.registration.unregister();
      if (success) {
        this.registration = null;
        this.status = {
          isSupported: this.status.isSupported,
          isRegistered: false,
          isActive: false,
          isWaiting: false,
          updateAvailable: false,
        };
      }
      return success;
    } catch {
      return false;
    }
  }

  /**
   * Check for service worker updates
   */
  public async checkForUpdates(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      await this.registration.update();
      this.status.lastUpdateCheck = Date.now();
      return this.status.updateAvailable;
    } catch {
      return false;
    }
  }

  /**
   * Activate a waiting service worker
   */
  public activateWaiting(): void {
    if (!this.registration?.waiting) {
      return;
    }

    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  /**
   * Get current status
   */
  public getStatus(): ServiceWorkerStatus {
    return { ...this.status };
  }

  /**
   * Get the registration object
   */
  public getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }

  /**
   * Send a message to the active service worker
   */
  public postMessage(message: unknown): void {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  /**
   * Request the service worker to cache specific content
   */
  public cacheContent(url: string, cacheName?: string): void {
    this.postMessage({
      type: 'CACHE_CONTENT',
      payload: { url, cacheName },
    });
  }

  /**
   * Request cache status from the service worker
   */
  public requestCacheStatus(): void {
    this.postMessage({ type: 'GET_CACHE_STATUS' });
  }

  /**
   * Clear all caches managed by the service worker
   */
  public clearCaches(): void {
    this.postMessage({ type: 'CLEAR_CACHE' });
  }

  /**
   * Destroy the manager and clean up resources
   */
  public destroy(): void {
    this.stopUpdateChecking();
  }

  // === Private Methods ===

  private handleUpdateFound(registration: ServiceWorkerRegistration): void {
    const newWorker = registration.installing;
    if (!newWorker) {
      return;
    }

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // New version available
        this.status.updateAvailable = true;
        this.status.isWaiting = true;
        this.options.callbacks.onUpdateAvailable?.(registration);
      }
    });
  }

  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, payload } = event.data || {};

    switch (type) {
      case 'CACHE_CLEARED':
        // Cache was cleared by SW
        break;
      case 'CACHE_STATUS':
        // Received cache status update
        break;
      case 'COMMENT_SYNCED':
      case 'COMMENT_SYNC_FAILED':
      case 'ACTION_SYNCED':
        // Dispatch custom events for the app to handle
        window.dispatchEvent(new CustomEvent('sw-sync-event', { detail: { type, payload } }));
        break;
    }
  }

  private startUpdateChecking(): void {
    if (this.updateCheckInterval) {
      return;
    }

    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates();
    }, this.options.updateInterval);
  }

  private stopUpdateChecking(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }
}

// === Singleton Instance ===

let serviceWorkerManager: ServiceWorkerManager | null = null;

/**
 * Initialize and register the service worker
 */
export function initializeServiceWorker(
  options?: ServiceWorkerRegistrationOptions
): ServiceWorkerManager {
  if (!serviceWorkerManager) {
    serviceWorkerManager = new ServiceWorkerManager(options);
  }
  return serviceWorkerManager;
}

/**
 * Get the current service worker manager instance
 */
export function getServiceWorkerManager(): ServiceWorkerManager | null {
  return serviceWorkerManager;
}

/**
 * Register the service worker with default options
 */
export async function registerServiceWorker(
  callbacks?: ServiceWorkerCallbacks
): Promise<ServiceWorkerStatus> {
  const manager = initializeServiceWorker({ callbacks });
  return manager.register();
}
