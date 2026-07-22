/**
 * Storage Service
 * 
 * Provides safe localStorage/sessionStorage access with error handling,
 * quota management, and graceful degradation when storage is unavailable.
 */

import { handleError } from '../app/error-handler.js';
import { logger } from '../app/client-logger.js';

export interface StorageOptions {
  prefix?: string;
  expiration?: number; // in milliseconds
  fallbackToMemory?: boolean;
  encryptSensitive?: boolean;
  quotaWarningThreshold?: number; // percentage
}

export interface StoredItem<T = any> {
  value: T;
  timestamp: number;
  expiration?: number;
  encrypted?: boolean;
}

export enum StorageType {
  Local = 'local',
  Session = 'session',
  Memory = 'memory',
}

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] || null;
  }

  get length(): number {
    return this.data.size;
  }
}

export class StorageManager {
  private storage: Storage | MemoryStorage;
  private storageType: StorageType;
  private options: Required<StorageOptions>;
  private memoryFallback = new MemoryStorage();

  constructor(storageType: StorageType = StorageType.Local, options: StorageOptions = {}) {
    this.storageType = storageType;
    this.options = {
      prefix: 'streetstudio_',
      expiration: 0, // No expiration by default
      fallbackToMemory: true,
      encryptSensitive: false,
      quotaWarningThreshold: 80,
      ...options,
    };

    this.storage = this.initializeStorage();
    this.cleanupExpiredItems();
  }

  private initializeStorage(): Storage | MemoryStorage {
    try {
      let nativeStorage: Storage;
      
      switch (this.storageType) {
        case StorageType.Local:
          nativeStorage = window.localStorage;
          break;
        case StorageType.Session:
          nativeStorage = window.sessionStorage;
          break;
        case StorageType.Memory:
          return new MemoryStorage();
        default:
          throw new Error(`Unknown storage type: ${this.storageType}`);
      }

      // Test storage availability
      const testKey = '__storage_test__';
      nativeStorage.setItem(testKey, 'test');
      nativeStorage.removeItem(testKey);
      
      return nativeStorage;

    } catch (error) {
      logger.warn(`${this.storageType} storage not available, falling back to memory storage`, {
        error: (error as Error).message,
        storageType: this.storageType,
      });

      if (this.options.fallbackToMemory) {
        this.storageType = StorageType.Memory;
        return this.memoryFallback;
      } else {
        handleError(error as Error, 'component', {
          feature: 'local-storage',
          storageType: this.storageType,
        });
        throw error;
      }
    }
  }

  /**
   * Store an item with optional expiration
   */
  public setItem<T>(key: string, value: T, options?: { expiration?: number; encrypt?: boolean }): boolean {
    try {
      const fullKey = this.getFullKey(key);
      const expiration = options?.expiration || this.options.expiration;
      
      const storedItem: StoredItem<T> = {
        value,
        timestamp: Date.now(),
        expiration: expiration > 0 ? Date.now() + expiration : undefined,
        encrypted: options?.encrypt || this.options.encryptSensitive,
      };

      let serializedValue = JSON.stringify(storedItem);

      // Simple encryption for sensitive data (in production, use proper encryption)
      if (storedItem.encrypted) {
        serializedValue = btoa(serializedValue);
      }

      // Check quota before storing
      this.checkQuotaUsage();

      this.storage.setItem(fullKey, serializedValue);

      logger.debug(`Stored item: ${key}`, {
        key: fullKey,
        size: serializedValue.length,
        expiration: storedItem.expiration,
      });

      return true;

    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this.handleQuotaExceeded(key);
      } else {
        logger.error(`Failed to store item: ${key}`, {
          error: error.message,
          storageType: this.storageType,
        });

        handleError(error as Error, 'component', {
          feature: 'local-storage',
          operation: 'setItem',
          key,
        });
      }
      return false;
    }
  }

  /**
   * Retrieve an item with expiration check
   */
  public getItem<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const fullKey = this.getFullKey(key);
      const serializedValue = this.storage.getItem(fullKey);

      if (!serializedValue) {
        return defaultValue;
      }

      let deserializedValue = serializedValue;

      // Try to detect and decrypt encrypted values
      if (serializedValue.startsWith('eyJ') || serializedValue.length % 4 === 0) {
        try {
          deserializedValue = atob(serializedValue);
        } catch {
          // Not base64 encoded, use as-is
        }
      }

      const storedItem: StoredItem<T> = JSON.parse(deserializedValue);

      // Check expiration
      if (storedItem.expiration && Date.now() > storedItem.expiration) {
        this.removeItem(key);
        logger.debug(`Expired item removed: ${key}`);
        return defaultValue;
      }

      return storedItem.value;

    } catch (error) {
      logger.warn(`Failed to retrieve item: ${key}`, {
        error: error.message,
        storageType: this.storageType,
      });

      // Try to remove corrupted item
      this.removeItem(key);
      
      return defaultValue;
    }
  }

  /**
   * Remove an item
   */
  public removeItem(key: string): boolean {
    try {
      const fullKey = this.getFullKey(key);
      this.storage.removeItem(fullKey);
      
      logger.debug(`Removed item: ${key}`, {
        key: fullKey,
      });
      
      return true;

    } catch (error) {
      logger.error(`Failed to remove item: ${key}`, {
        error: error.message,
        storageType: this.storageType,
      });
      return false;
    }
  }

  /**
   * Clear all items with our prefix
   */
  public clear(): boolean {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.options.prefix)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => this.storage.removeItem(key));
      
      logger.info(`Cleared ${keysToRemove.length} items from storage`, {
        storageType: this.storageType,
      });
      
      return true;

    } catch (error) {
      logger.error('Failed to clear storage', {
        error: error.message,
        storageType: this.storageType,
      });
      return false;
    }
  }

  /**
   * Get all keys with our prefix
   */
  public getKeys(): string[] {
    try {
      const keys: string[] = [];
      
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.options.prefix)) {
          keys.push(key.substring(this.options.prefix.length));
        }
      }
      
      return keys;

    } catch (error) {
      logger.error('Failed to get keys from storage', {
        error: error.message,
        storageType: this.storageType,
      });
      return [];
    }
  }

  /**
   * Check if an item exists
   */
  public hasItem(key: string): boolean {
    const fullKey = this.getFullKey(key);
    return this.storage.getItem(fullKey) !== null;
  }

  /**
   * Get storage usage information
   */
  public getUsageInfo(): { used: number; total: number; percentage: number } {
    try {
      if (this.storageType === StorageType.Memory) {
        // Estimate memory usage
        let used = 0;
        this.getKeys().forEach(key => {
          const item = this.storage.getItem(this.getFullKey(key));
          if (item) {
            used += item.length * 2; // Rough estimate (UTF-16)
          }
        });
        
        return {
          used,
          total: Infinity,
          percentage: 0,
        };
      }

      // For localStorage/sessionStorage, estimate quota usage
      let used = 0;
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key) {
          const value = this.storage.getItem(key);
          if (value) {
            used += key.length + value.length;
          }
        }
      }

      // Rough estimate of total quota (browsers vary, but ~5-10MB is common)
      const estimatedTotal = 5 * 1024 * 1024; // 5MB
      const percentage = (used / estimatedTotal) * 100;

      return {
        used,
        total: estimatedTotal,
        percentage: Math.min(percentage, 100),
      };

    } catch (error) {
      logger.warn('Failed to get storage usage info', {
        error: error.message,
        storageType: this.storageType,
      });

      return { used: 0, total: 0, percentage: 0 };
    }
  }

  private getFullKey(key: string): string {
    return `${this.options.prefix}${key}`;
  }

  private checkQuotaUsage(): void {
    const usage = this.getUsageInfo();
    
    if (usage.percentage > this.options.quotaWarningThreshold) {
      logger.warn(`Storage usage is ${usage.percentage.toFixed(1)}%`, {
        used: usage.used,
        total: usage.total,
        storageType: this.storageType,
      });

      // Clean up expired items if usage is high
      if (usage.percentage > 90) {
        this.cleanupExpiredItems();
      }
    }
  }

  private handleQuotaExceeded(attemptedKey: string): void {
    logger.error('Storage quota exceeded', {
      attemptedKey,
      storageType: this.storageType,
    });

    // Try to clean up expired items
    const cleanedCount = this.cleanupExpiredItems();
    
    if (cleanedCount === 0) {
      // Clean up oldest items if no expired items found
      this.cleanupOldestItems(5);
    }

    handleError(new Error('Storage quota exceeded'), 'component', {
      feature: 'local-storage',
      storageType: this.storageType,
      attemptedKey,
      cleanedItems: cleanedCount,
    });
  }

  private cleanupExpiredItems(): number {
    let cleanedCount = 0;
    
    try {
      const keysToCheck = this.getKeys();
      
      keysToCheck.forEach(key => {
        try {
          const fullKey = this.getFullKey(key);
          const serializedValue = this.storage.getItem(fullKey);
          
          if (serializedValue) {
            const storedItem: StoredItem = JSON.parse(serializedValue);
            
            if (storedItem.expiration && Date.now() > storedItem.expiration) {
              this.storage.removeItem(fullKey);
              cleanedCount++;
            }
          }
        } catch {
          // Remove corrupted items
          this.removeItem(key);
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired/corrupted items`, {
          storageType: this.storageType,
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup expired items', {
        error: error.message,
        storageType: this.storageType,
      });
    }

    return cleanedCount;
  }

  private cleanupOldestItems(count: number): number {
    try {
      const items: Array<{ key: string; timestamp: number }> = [];
      
      this.getKeys().forEach(key => {
        try {
          const fullKey = this.getFullKey(key);
          const serializedValue = this.storage.getItem(fullKey);
          
          if (serializedValue) {
            const storedItem: StoredItem = JSON.parse(serializedValue);
            items.push({ key, timestamp: storedItem.timestamp });
          }
        } catch {
          // Remove corrupted items
          items.push({ key, timestamp: 0 });
        }
      });

      // Sort by timestamp (oldest first)
      items.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest items
      const itemsToRemove = items.slice(0, count);
      itemsToRemove.forEach(item => this.removeItem(item.key));

      logger.info(`Cleaned up ${itemsToRemove.length} oldest items`, {
        storageType: this.storageType,
      });

      return itemsToRemove.length;

    } catch (error) {
      logger.error('Failed to cleanup oldest items', {
        error: error.message,
        storageType: this.storageType,
      });
      return 0;
    }
  }
}

// Create default storage instances
export const localStorage = new StorageManager(StorageType.Local, {
  prefix: 'streetstudio_',
});

export const sessionStorage = new StorageManager(StorageType.Session, {
  prefix: 'streetstudio_session_',
});

export const memoryStorage = new StorageManager(StorageType.Memory, {
  prefix: 'streetstudio_memory_',
});

// Convenience functions for common storage operations
export function setUserPreference<T>(key: string, value: T): boolean {
  return localStorage.setItem(`pref_${key}`, value);
}

export function getUserPreference<T>(key: string, defaultValue?: T): T | undefined {
  return localStorage.getItem(`pref_${key}`, defaultValue);
}

export function setSessionData<T>(key: string, value: T): boolean {
  return sessionStorage.setItem(key, value);
}

export function getSessionData<T>(key: string, defaultValue?: T): T | undefined {
  return sessionStorage.getItem(key, defaultValue);
}

export function setCachedData<T>(key: string, value: T, expirationMs = 300000): boolean {
  // Cache for 5 minutes by default
  return localStorage.setItem(`cache_${key}`, value, { expiration: expirationMs });
}

export function getCachedData<T>(key: string, defaultValue?: T): T | undefined {
  return localStorage.getItem(`cache_${key}`, defaultValue);
}

// Auth token storage with encryption
export function setAuthToken(token: string): boolean {
  return localStorage.setItem('auth_token', token, { encrypt: true });
}

export function getAuthToken(): string | undefined {
  return localStorage.getItem('auth_token');
}

export function clearAuthToken(): boolean {
  return localStorage.removeItem('auth_token');
}