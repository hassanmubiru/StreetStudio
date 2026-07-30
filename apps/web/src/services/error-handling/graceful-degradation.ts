/**
 * Graceful Degradation Service
 * 
 * Detects unavailable features (WebSocket, service worker, IndexedDB, etc.)
 * and provides fallbacks or disables features gracefully with user messaging.
 * 
 * Implements Requirement 13.6.
 */

import { logger } from '../../app/client-logger.js';
import { toast } from '../../utils/toast.js';

export type FeatureStatus = 'available' | 'degraded' | 'unavailable' | 'checking';

export interface FeatureCheck {
  name: string;
  description: string;
  check: () => Promise<boolean> | boolean;
  fallback?: () => void;
  userMessage?: string;
  critical: boolean;
}

export interface FeatureState {
  name: string;
  status: FeatureStatus;
  description: string;
  degradedMessage?: string;
  lastChecked: string;
  critical: boolean;
}

export interface GracefulDegradationConfig {
  features: FeatureCheck[];
  onFeatureUnavailable?: (feature: FeatureState) => void;
  onFeatureRestored?: (feature: FeatureState) => void;
  checkInterval?: number;
  notifyUser: boolean;
}

const DEFAULT_FEATURES: FeatureCheck[] = [
  {
    name: 'websocket',
    description: 'Real-time collaboration and live updates',
    check: () => typeof WebSocket !== 'undefined',
    fallback: () => {
      logger.info('WebSocket unavailable - falling back to polling');
    },
    userMessage: 'Live updates are unavailable. Content will refresh periodically.',
    critical: false,
  },
  {
    name: 'service-worker',
    description: 'Offline support and background sync',
    check: () => 'serviceWorker' in navigator,
    fallback: () => {
      logger.info('Service Worker unavailable - offline features disabled');
    },
    userMessage: 'Offline features are not available in this browser.',
    critical: false,
  },
  {
    name: 'indexeddb',
    description: 'Local data storage for offline access',
    check: async () => {
      try {
        const testDB = indexedDB.open('__feature_test__', 1);
        return await new Promise<boolean>((resolve) => {
          testDB.onsuccess = () => {
            testDB.result.close();
            indexedDB.deleteDatabase('__feature_test__');
            resolve(true);
          };
          testDB.onerror = () => resolve(false);
        });
      } catch {
        return false;
      }
    },
    fallback: () => {
      logger.info('IndexedDB unavailable - using in-memory storage');
    },
    userMessage: 'Local storage is limited. Some data may not persist between sessions.',
    critical: false,
  },
  {
    name: 'notifications',
    description: 'Browser push notifications',
    check: () => 'Notification' in window,
    fallback: () => {
      logger.info('Notifications API unavailable - using in-app notifications only');
    },
    userMessage: 'Browser notifications are not available. You will receive in-app notifications.',
    critical: false,
  },
  {
    name: 'clipboard',
    description: 'Copy and paste functionality',
    check: () => navigator.clipboard !== undefined,
    fallback: () => {
      logger.info('Clipboard API unavailable - using fallback copy mechanism');
    },
    userMessage: undefined, // Silent fallback
    critical: false,
  },
  {
    name: 'media-recorder',
    description: 'Screen and video recording',
    check: () => typeof MediaRecorder !== 'undefined',
    fallback: () => {
      logger.info('MediaRecorder unavailable - recording features disabled');
    },
    userMessage: 'Recording features are not supported in this browser.',
    critical: false,
  },
  {
    name: 'screen-capture',
    description: 'Screen sharing and capture',
    check: () => !!(navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices),
    fallback: () => {
      logger.info('Screen capture unavailable');
    },
    userMessage: 'Screen capture is not supported. Try using a modern browser like Chrome or Firefox.',
    critical: false,
  },
  {
    name: 'web-workers',
    description: 'Background processing for heavy computations',
    check: () => typeof Worker !== 'undefined',
    fallback: () => {
      logger.info('Web Workers unavailable - processing on main thread');
    },
    userMessage: undefined, // Silent fallback
    critical: false,
  },
];

export class GracefulDegradationService {
  private config: GracefulDegradationConfig;
  private featureStates: Map<string, FeatureState> = new Map();
  private checkTimer: number | null = null;
  private listeners: Map<string, Array<(state: FeatureState) => void>> = new Map();

  constructor(config?: Partial<GracefulDegradationConfig>) {
    this.config = {
      features: config?.features || DEFAULT_FEATURES,
      notifyUser: config?.notifyUser ?? true,
      checkInterval: config?.checkInterval,
      onFeatureUnavailable: config?.onFeatureUnavailable,
      onFeatureRestored: config?.onFeatureRestored,
    };
  }

  /**
   * Run initial feature checks
   */
  public async initialize(): Promise<Map<string, FeatureState>> {
    await this.checkAllFeatures();

    if (this.config.checkInterval) {
      this.startPeriodicChecks();
    }

    return this.featureStates;
  }

  /**
   * Check all registered features
   */
  public async checkAllFeatures(): Promise<void> {
    const results = await Promise.allSettled(
      this.config.features.map(feature => this.checkFeature(feature))
    );

    // Log summary
    const unavailable = Array.from(this.featureStates.values()).filter(
      f => f.status === 'unavailable'
    );

    if (unavailable.length > 0) {
      logger.info(`Feature check complete: ${unavailable.length} features unavailable`, {
        unavailable: unavailable.map(f => f.name),
      });
    }
  }

  /**
   * Check a single feature
   */
  private async checkFeature(feature: FeatureCheck): Promise<void> {
    const previousState = this.featureStates.get(feature.name);

    try {
      const available = await feature.check();

      const state: FeatureState = {
        name: feature.name,
        status: available ? 'available' : 'unavailable',
        description: feature.description,
        degradedMessage: available ? undefined : feature.userMessage,
        lastChecked: new Date().toISOString(),
        critical: feature.critical,
      };

      this.featureStates.set(feature.name, state);

      // Feature became unavailable
      if (!available && previousState?.status !== 'unavailable') {
        this.handleFeatureUnavailable(feature, state);
      }

      // Feature was restored
      if (available && previousState?.status === 'unavailable') {
        this.handleFeatureRestored(state);
      }

      // Notify listeners
      this.notifyListeners(feature.name, state);
    } catch (error) {
      const state: FeatureState = {
        name: feature.name,
        status: 'unavailable',
        description: feature.description,
        degradedMessage: feature.userMessage || 'Feature check failed.',
        lastChecked: new Date().toISOString(),
        critical: feature.critical,
      };

      this.featureStates.set(feature.name, state);

      if (previousState?.status !== 'unavailable') {
        this.handleFeatureUnavailable(feature, state);
      }
    }
  }

  private handleFeatureUnavailable(feature: FeatureCheck, state: FeatureState): void {
    // Execute fallback
    if (feature.fallback) {
      try {
        feature.fallback();
      } catch (fallbackError) {
        logger.error(`Fallback for ${feature.name} failed`, {
          error: (fallbackError as Error).message,
        });
      }
    }

    // Notify user if configured
    if (this.config.notifyUser && feature.userMessage) {
      toast.warning(feature.userMessage, { duration: 8000 });
    }

    // Notify callback
    this.config.onFeatureUnavailable?.(state);
  }

  private handleFeatureRestored(state: FeatureState): void {
    if (this.config.notifyUser) {
      toast.success(`${state.description} is now available.`, { duration: 3000 });
    }

    this.config.onFeatureRestored?.(state);
  }

  /**
   * Get the status of a specific feature
   */
  public getFeatureStatus(name: string): FeatureState | undefined {
    return this.featureStates.get(name);
  }

  /**
   * Check if a feature is available
   */
  public isFeatureAvailable(name: string): boolean {
    const state = this.featureStates.get(name);
    return state?.status === 'available';
  }

  /**
   * Get all feature states
   */
  public getAllFeatureStates(): FeatureState[] {
    return Array.from(this.featureStates.values());
  }

  /**
   * Get unavailable features
   */
  public getUnavailableFeatures(): FeatureState[] {
    return Array.from(this.featureStates.values()).filter(
      f => f.status === 'unavailable'
    );
  }

  /**
   * Register a new feature check at runtime
   */
  public registerFeature(feature: FeatureCheck): void {
    this.config.features.push(feature);
    this.checkFeature(feature);
  }

  /**
   * Subscribe to feature state changes
   */
  public onFeatureChange(featureName: string, callback: (state: FeatureState) => void): () => void {
    if (!this.listeners.has(featureName)) {
      this.listeners.set(featureName, []);
    }
    this.listeners.get(featureName)!.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(featureName);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private notifyListeners(featureName: string, state: FeatureState): void {
    const listeners = this.listeners.get(featureName);
    if (listeners) {
      listeners.forEach(cb => cb(state));
    }
  }

  private startPeriodicChecks(): void {
    if (this.checkTimer) return;

    this.checkTimer = window.setInterval(() => {
      this.checkAllFeatures();
    }, this.config.checkInterval!);
  }

  /**
   * Stop periodic feature checks
   */
  public destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.listeners.clear();
  }
}

// Singleton instance
let degradationService: GracefulDegradationService | null = null;

export function initializeGracefulDegradation(
  config?: Partial<GracefulDegradationConfig>
): GracefulDegradationService {
  degradationService = new GracefulDegradationService(config);
  return degradationService;
}

export function getGracefulDegradationService(): GracefulDegradationService {
  if (!degradationService) {
    degradationService = new GracefulDegradationService();
  }
  return degradationService;
}
