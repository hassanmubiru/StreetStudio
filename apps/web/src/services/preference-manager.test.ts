/**
 * Preference Manager Tests
 *
 * Tests for user preference storage, validation, and change notifications.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PreferenceManager } from './preference-manager.js';

describe('PreferenceManager', () => {
  let preferenceManager: PreferenceManager;

  beforeEach(() => {
    localStorage.clear();
    preferenceManager = new PreferenceManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get and set', () => {
    it('returns default values for unset preferences', () => {
      expect(preferenceManager.get('theme')).toBe('system');
      expect(preferenceManager.get('reducedMotion')).toBe(false);
      expect(preferenceManager.get('videoQuality')).toBe('auto');
      expect(preferenceManager.get('recentSearches')).toEqual([]);
    });

    it('sets and retrieves preference values', () => {
      preferenceManager.set('theme', 'dark');
      expect(preferenceManager.get('theme')).toBe('dark');

      preferenceManager.set('reducedMotion', true);
      expect(preferenceManager.get('reducedMotion')).toBe(true);
    });

    it('sets multiple preferences at once', () => {
      preferenceManager.setMultiple({
        theme: 'light',
        highContrast: true,
        fontSize: 'large',
      });

      expect(preferenceManager.get('theme')).toBe('light');
      expect(preferenceManager.get('highContrast')).toBe(true);
      expect(preferenceManager.get('fontSize')).toBe('large');
    });

    it('returns all preferences via getAll()', () => {
      preferenceManager.set('theme', 'dark');
      const all = preferenceManager.getAll();

      expect(all.theme).toBe('dark');
      expect(all.reducedMotion).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects invalid theme values', () => {
      preferenceManager.set('theme', 'invalid' as any);
      expect(preferenceManager.get('theme')).toBe('system'); // unchanged
    });

    it('rejects invalid boolean values', () => {
      preferenceManager.set('reducedMotion', 'yes' as any);
      expect(preferenceManager.get('reducedMotion')).toBe(false); // unchanged
    });

    it('rejects invalid hex color values', () => {
      preferenceManager.set('cursorHighlightColor', 'not-a-color');
      expect(preferenceManager.get('cursorHighlightColor')).toBe('#FFFF00'); // default
    });

    it('rejects out-of-range editor zoom level', () => {
      preferenceManager.set('editorZoomLevel', 10);
      expect(preferenceManager.get('editorZoomLevel')).toBe(1); // default

      preferenceManager.set('editorZoomLevel', 0.1);
      expect(preferenceManager.get('editorZoomLevel')).toBe(1); // default
    });

    it('accepts valid hex color', () => {
      preferenceManager.set('cursorHighlightColor', '#FF0000');
      expect(preferenceManager.get('cursorHighlightColor')).toBe('#FF0000');
    });

    it('accepts valid editor zoom level', () => {
      preferenceManager.set('editorZoomLevel', 2.5);
      expect(preferenceManager.get('editorZoomLevel')).toBe(2.5);
    });
  });

  describe('reset', () => {
    it('resets a single preference to default', () => {
      preferenceManager.set('theme', 'dark');
      preferenceManager.reset('theme');
      expect(preferenceManager.get('theme')).toBe('system');
    });

    it('resets all preferences to defaults', () => {
      preferenceManager.set('theme', 'dark');
      preferenceManager.set('fontSize', 'large');

      preferenceManager.resetAll();

      expect(preferenceManager.get('theme')).toBe('system');
      expect(preferenceManager.get('fontSize')).toBe('medium');
    });
  });

  describe('change listeners', () => {
    it('notifies listeners on preference change', () => {
      const listener = vi.fn();
      preferenceManager.onChange('theme', listener);

      preferenceManager.set('theme', 'dark');

      expect(listener).toHaveBeenCalledWith('theme', 'dark', 'system');
    });

    it('does not notify when value does not change', () => {
      const listener = vi.fn();
      preferenceManager.onChange('theme', listener);

      preferenceManager.set('theme', 'system'); // Same as default

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports wildcard listener for all changes', () => {
      const listener = vi.fn();
      preferenceManager.onChange('*', listener);

      preferenceManager.set('theme', 'dark');
      preferenceManager.set('fontSize', 'large');

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('supports unsubscribing', () => {
      const listener = vi.fn();
      const unsub = preferenceManager.onChange('theme', listener);

      unsub();
      preferenceManager.set('theme', 'dark');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('recent searches', () => {
    it('adds and retrieves recent searches', () => {
      preferenceManager.addRecentSearch('test query');
      preferenceManager.addRecentSearch('another search');

      const searches = preferenceManager.get('recentSearches');
      expect(searches[0]).toBe('another search');
      expect(searches[1]).toBe('test query');
    });

    it('removes duplicates when adding', () => {
      preferenceManager.addRecentSearch('query');
      preferenceManager.addRecentSearch('other');
      preferenceManager.addRecentSearch('query'); // duplicate

      const searches = preferenceManager.get('recentSearches');
      expect(searches).toEqual(['query', 'other']);
    });

    it('limits recent searches to configured max', () => {
      const manager = new PreferenceManager({ maxRecentSearches: 3 });
      manager.addRecentSearch('a');
      manager.addRecentSearch('b');
      manager.addRecentSearch('c');
      manager.addRecentSearch('d');

      expect(manager.get('recentSearches').length).toBe(3);
      expect(manager.get('recentSearches')).toEqual(['d', 'c', 'b']);
    });

    it('ignores empty search strings', () => {
      preferenceManager.addRecentSearch('');
      preferenceManager.addRecentSearch('   ');
      expect(preferenceManager.get('recentSearches')).toEqual([]);
    });

    it('clears recent searches', () => {
      preferenceManager.addRecentSearch('test');
      preferenceManager.clearRecentSearches();
      expect(preferenceManager.get('recentSearches')).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('persists preferences to localStorage', () => {
      preferenceManager.set('theme', 'dark');
      preferenceManager.saveNow();

      const newManager = new PreferenceManager();
      expect(newManager.get('theme')).toBe('dark');
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('streetstudio_preferences', 'not-json');
      const manager = new PreferenceManager();
      // Should fall back to defaults
      expect(manager.get('theme')).toBe('system');
    });
  });

  describe('export and import', () => {
    it('exports preferences as JSON', () => {
      preferenceManager.set('theme', 'dark');
      const exported = preferenceManager.export();
      const parsed = JSON.parse(exported);
      expect(parsed.theme).toBe('dark');
    });

    it('imports valid preferences from JSON', () => {
      const json = JSON.stringify({ theme: 'light', fontSize: 'large' });
      const success = preferenceManager.import(json);

      expect(success).toBe(true);
      expect(preferenceManager.get('theme')).toBe('light');
      expect(preferenceManager.get('fontSize')).toBe('large');
    });

    it('rejects invalid JSON on import', () => {
      const success = preferenceManager.import('not json');
      expect(success).toBe(false);
    });

    it('ignores invalid values during import', () => {
      const json = JSON.stringify({ theme: 'invalid_theme', fontSize: 'large' });
      preferenceManager.import(json);

      // theme unchanged (invalid), fontSize updated (valid)
      expect(preferenceManager.get('theme')).toBe('system');
      expect(preferenceManager.get('fontSize')).toBe('large');
    });
  });

  describe('storage usage', () => {
    it('returns storage usage information', () => {
      preferenceManager.set('theme', 'dark');
      preferenceManager.saveNow();

      const usage = preferenceManager.getStorageUsage();
      expect(usage.bytes).toBeGreaterThan(0);
      expect(usage.percentage).toBeGreaterThanOrEqual(0);
    });
  });
});
