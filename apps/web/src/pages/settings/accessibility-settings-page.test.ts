/**
 * Accessibility and Preference Settings Page Tests
 * 
 * Tests for high contrast mode, reduced motion, screen reader optimizations,
 * keyboard navigation preferences, and theme selection with live preview.
 * 
 * Requirements: 9.4, 9.8, 11.4, 11.7
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AccessibilitySettingsPage,
  createDefaultAccessibilityPreferences,
  getSystemReducedMotion,
  getSystemTheme,
  resolveTheme,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  applyAccessibilityPreferences,
  getAccessibilityCSS,
  STORAGE_KEY,
  type AccessibilityPreferences,
  type ThemeMode,
} from './accessibility-settings-page.js';

describe('AccessibilitySettingsPage', () => {
  let page: AccessibilitySettingsPage;

  const mockPreferences: AccessibilityPreferences = {
    highContrast: false,
    reducedMotion: false,
    screenReaderOptimizations: false,
    keyboardNavigation: {
      enabled: true,
      showFocusIndicators: true,
      skipLinkEnabled: true,
      arrowKeyNavigation: true,
    },
    theme: 'system',
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-high-contrast');
    document.documentElement.removeAttribute('data-reduced-motion');
  });

  afterEach(() => {
    page?.destroy();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  describe('Initialization', () => {
    it('should create page element with correct structure', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-main-content')).toBe('');
      expect(el.getAttribute('data-testid')).toBe('accessibility-settings');
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Accessibility & Preferences');
    });

    it('should render all settings sections', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      expect(el.querySelector('#theme-heading')).toBeTruthy();
      expect(el.querySelector('#contrast-heading')).toBeTruthy();
      expect(el.querySelector('#motion-heading')).toBeTruthy();
      expect(el.querySelector('#screenreader-heading')).toBeTruthy();
      expect(el.querySelector('#keyboard-heading')).toBeTruthy();
    });

    it('should not be dirty on initial render', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      expect(page.isDirtyState()).toBe(false);
    });

    it('should return current preferences', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const prefs = page.getPreferences();
      expect(prefs.highContrast).toBe(false);
      expect(prefs.theme).toBe('system');
    });
  });
