/**
 * Preference Manager
 *
 * Manages user preferences with local storage persistence, quota awareness,
 * schema validation, and migration support. Provides a typed interface for
 * reading/writing user settings with change notifications.
 *
 * Requirements: 12.3, 12.6
 */

import { logger } from '../app/client-logger.js';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  highContrast: boolean;
  fontSize: 'small' | 'medium' | 'large';
  sidebarCollapsed: boolean;
  videoQuality: 'auto' | 'low' | 'medium' | 'high';
  autoplay: boolean;
  captionsEnabled: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  recordingQuality: 'standard' | 'high' | 'ultra';
  cursorHighlight: boolean;
  cursorHighlightColor: string;
  recentSearches: string[];
  lastOrganizationId: string | null;
  lastProjectId: string | null;
  dashboardLayout: 'grid' | 'list';
  editorZoomLevel: number;
}

export type PreferenceKey = keyof UserPreferences;
export type PreferenceChangeListener<K extends PreferenceKey = PreferenceKey> = (
  key: K,
  value: UserPreferences[K],
  previousValue: UserPreferences[K]
) => void;

export interface PreferenceManagerConfig {
  storageKey: string;
  version: number;
  maxRecentSearches: number;
  quotaWarningThreshold: number; // percentage
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  reducedMotion: false,
  highContrast: false,
  fontSize: 'medium',
  sidebarCollapsed: false,
  videoQuality: 'auto',
  autoplay: true,
  captionsEnabled: false,
  notificationsEnabled: true,
  soundEnabled: true,
  recordingQuality: 'high',
  cursorHighlight: true,
  cursorHighlightColor: '#FFFF00',
  recentSearches: [],
  lastOrganizationId: null,
  lastProjectId: null,
  dashboardLayout: 'grid',
  editorZoomLevel: 1,
};

const DEFAULT_CONFIG: PreferenceManagerConfig = {
  storageKey: 'streetstudio_preferences',
  version: 1,
  maxRecentSearches: 20,
  quotaWarningThreshold: 80,
};

interface StoredPreferenceData {
  version: number;
  preferences: UserPreferences;
  updatedAt: number;
}

export class PreferenceManager {
  private preferences: UserPreferences;
  private config: PreferenceManagerConfig;
  private listeners = new Map<PreferenceKey | '*', Set<PreferenceChangeListener<any>>>();
  private isDirty = false;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<PreferenceManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.preferences = this.loadPreferences();
  }

  /**
   * Get a preference value
   */
  public get<K extends PreferenceKey>(key: K): UserPreferences[K] {
    return this.preferences[key];
  }

  /**
   * Get all preferences
   */
  public getAll(): Readonly<UserPreferences> {
    return { ...this.preferences };
  }

  /**
   * Set a preference value
   */
  public set<K extends PreferenceKey>(key: K, value: UserPreferences[K]): void {
    const previousValue = this.preferences[key];

    if (previousValue === value) return;

    // Validate the value
    if (!this.validatePreference(key, value)) {
      logger.warn('Invalid preference value', { key, value });
      return;
    }

    this.preferences[key] = value;
    this.isDirty = true;
    this.scheduleSave();
    this.notifyListeners(key, value, previousValue);

    logger.debug('Preference updated', { key, value });
  }

  /**
   * Set multiple preferences at once
   */
  public setMultiple(updates: Partial<UserPreferences>): void {
    for (const [key, value] of Object.entries(updates)) {
      if (key in DEFAULT_PREFERENCES) {
        this.set(key as PreferenceKey, value as any);
      }
    }
  }

  /**
   * Reset a preference to its default value
   */
  public reset<K extends PreferenceKey>(key: K): void {
    this.set(key, DEFAULT_PREFERENCES[key]);
  }

  /**
   * Reset all preferences to defaults
   */
  public resetAll(): void {
    const previousPrefs = { ...this.preferences };
    this.preferences = { ...DEFAULT_PREFERENCES };
    this.isDirty = true;
    this.saveNow();

    // Notify for each changed key
    for (const key of Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[]) {
      if (previousPrefs[key] !== this.preferences[key]) {
        this.notifyListeners(key, this.preferences[key], previousPrefs[key]);
      }
    }

    logger.info('All preferences reset to defaults');
  }

  /**
   * Subscribe to preference changes
   */
  public onChange<K extends PreferenceKey>(
    key: K | '*',
    listener: PreferenceChangeListener<K>
  ): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  /**
   * Add a recent search term (maintains max count)
   */
  public addRecentSearch(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    const searches = [...this.preferences.recentSearches];
    // Remove duplicates
    const filtered = searches.filter((s) => s !== trimmed);
    // Add to front
    filtered.unshift(trimmed);
    // Trim to max
    const limited = filtered.slice(0, this.config.maxRecentSearches);

    this.set('recentSearches', limited);
  }

  /**
   * Clear recent searches
   */
  public clearRecentSearches(): void {
    this.set('recentSearches', []);
  }

  /**
   * Get storage usage info for preferences
   */
  public getStorageUsage(): { bytes: number; percentage: number } {
    try {
      const data = localStorage.getItem(this.config.storageKey);
      const bytes = data ? new Blob([data]).size : 0;
      // Rough estimate: localStorage quota is ~5MB
      const percentage = (bytes / (5 * 1024 * 1024)) * 100;
      return { bytes, percentage };
    } catch {
      return { bytes: 0, percentage: 0 };
    }
  }

  /**
   * Force save preferences to storage immediately
   */
  public saveNow(): boolean {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    return this.persistToStorage();
  }

  /**
   * Export preferences as JSON (for backup/transfer)
   */
  public export(): string {
    return JSON.stringify(this.preferences, null, 2);
  }

  /**
   * Import preferences from JSON (with validation)
   */
  public import(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== 'object' || parsed === null) return false;

      // Only import valid keys with valid values
      for (const [key, value] of Object.entries(parsed)) {
        if (key in DEFAULT_PREFERENCES && this.validatePreference(key as PreferenceKey, value)) {
          this.preferences[key as PreferenceKey] = value as any;
        }
      }

      this.isDirty = true;
      this.saveNow();
      logger.info('Preferences imported');
      return true;
    } catch (error) {
      logger.error('Failed to import preferences', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  private validatePreference(key: PreferenceKey, value: unknown): boolean {
    switch (key) {
      case 'theme':
        return ['light', 'dark', 'system'].includes(value as string);
      case 'fontSize':
        return ['small', 'medium', 'large'].includes(value as string);
      case 'videoQuality':
        return ['auto', 'low', 'medium', 'high'].includes(value as string);
      case 'recordingQuality':
        return ['standard', 'high', 'ultra'].includes(value as string);
      case 'dashboardLayout':
        return ['grid', 'list'].includes(value as string);
      case 'reducedMotion':
      case 'highContrast':
      case 'sidebarCollapsed':
      case 'autoplay':
      case 'captionsEnabled':
      case 'notificationsEnabled':
      case 'soundEnabled':
      case 'cursorHighlight':
        return typeof value === 'boolean';
      case 'cursorHighlightColor':
        return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
      case 'editorZoomLevel':
        return typeof value === 'number' && value >= 0.25 && value <= 4;
      case 'recentSearches':
        return Array.isArray(value) && value.every((v) => typeof v === 'string');
      case 'lastOrganizationId':
      case 'lastProjectId':
        return value === null || typeof value === 'string';
      default:
        return true;
    }
  }

  private loadPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (!stored) return { ...DEFAULT_PREFERENCES };

      const data: StoredPreferenceData = JSON.parse(stored);

      // Handle version migration
      if (data.version < this.config.version) {
        return this.migratePreferences(data);
      }

      // Merge with defaults to handle new keys added in code
      return { ...DEFAULT_PREFERENCES, ...data.preferences };
    } catch (error) {
      logger.warn('Failed to load preferences, using defaults', {
        error: (error as Error).message,
      });
      return { ...DEFAULT_PREFERENCES };
    }
  }

  private migratePreferences(data: StoredPreferenceData): UserPreferences {
    logger.info('Migrating preferences', {
      from: data.version,
      to: this.config.version,
    });

    // Merge old preferences with new defaults
    const migrated = { ...DEFAULT_PREFERENCES, ...data.preferences };

    // Persist the migrated version
    this.preferences = migrated;
    this.isDirty = true;
    this.saveNow();

    return migrated;
  }

  private persistToStorage(): boolean {
    if (!this.isDirty) return true;

    try {
      const data: StoredPreferenceData = {
        version: this.config.version,
        preferences: this.preferences,
        updatedAt: Date.now(),
      };

      const serialized = JSON.stringify(data);

      // Check quota before writing
      const usage = this.getStorageUsage();
      if (usage.percentage > this.config.quotaWarningThreshold) {
        logger.warn('Storage quota warning for preferences', { usage });
      }

      localStorage.setItem(this.config.storageKey, serialized);
      this.isDirty = false;
      return true;
    } catch (error) {
      if ((error as any)?.name === 'QuotaExceededError') {
        logger.error('Storage quota exceeded for preferences');
        // Try to trim recent searches to free space
        this.preferences.recentSearches = this.preferences.recentSearches.slice(0, 5);
        try {
          const data: StoredPreferenceData = {
            version: this.config.version,
            preferences: this.preferences,
            updatedAt: Date.now(),
          };
          localStorage.setItem(this.config.storageKey, JSON.stringify(data));
          this.isDirty = false;
          return true;
        } catch {
          return false;
        }
      }
      logger.error('Failed to persist preferences', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  private scheduleSave(): void {
    if (this.saveDebounceTimer) return;
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.persistToStorage();
    }, 300);
  }

  private notifyListeners<K extends PreferenceKey>(
    key: K,
    value: UserPreferences[K],
    previousValue: UserPreferences[K]
  ): void {
    // Notify specific-key listeners
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      for (const listener of keyListeners) {
        try {
          listener(key, value, previousValue);
        } catch (error) {
          logger.error('Preference listener error', {
            key,
            error: (error as Error).message,
          });
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(key, value, previousValue);
        } catch (error) {
          logger.error('Preference wildcard listener error', {
            key,
            error: (error as Error).message,
          });
        }
      }
    }
  }
}

// Singleton instance
let globalPreferenceManager: PreferenceManager | null = null;

export function getPreferenceManager(): PreferenceManager {
  if (!globalPreferenceManager) {
    globalPreferenceManager = new PreferenceManager();
  }
  return globalPreferenceManager;
}

export function initializePreferenceManager(
  config: Partial<PreferenceManagerConfig> = {}
): PreferenceManager {
  globalPreferenceManager = new PreferenceManager(config);
  return globalPreferenceManager;
}
