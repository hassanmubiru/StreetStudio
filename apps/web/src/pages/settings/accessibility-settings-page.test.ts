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

  describe('Theme Selection', () => {
    it('should render three theme options', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const cards = el.querySelectorAll('[data-theme-value]');
      expect(cards.length).toBe(3);
    });

    it('should mark system theme as selected by default', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const systemCard = el.querySelector('[data-theme-value="system"]');
      expect(systemCard?.getAttribute('aria-checked')).toBe('true');
    });

    it('should select light theme on click', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const lightCard = el.querySelector('[data-theme-value="light"]') as HTMLElement;
      lightCard.click();

      expect(page.getPreferences().theme).toBe('light');
      expect(lightCard.getAttribute('aria-checked')).toBe('true');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should select dark theme on click', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const darkCard = el.querySelector('[data-theme-value="dark"]') as HTMLElement;
      darkCard.click();

      expect(page.getPreferences().theme).toBe('dark');
      expect(darkCard.getAttribute('aria-checked')).toBe('true');
    });

    it('should apply theme to document on selection', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const darkCard = el.querySelector('[data-theme-value="dark"]') as HTMLElement;
      darkCard.click();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should support keyboard activation with Enter', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const lightCard = el.querySelector('[data-theme-value="light"]') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      lightCard.dispatchEvent(event);

      expect(page.getPreferences().theme).toBe('light');
    });

    it('should support keyboard activation with Space', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const darkCard = el.querySelector('[data-theme-value="dark"]') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      darkCard.dispatchEvent(event);

      expect(page.getPreferences().theme).toBe('dark');
    });

    it('should have radiogroup role on theme container', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const group = el.querySelector('#theme-group');
      expect(group?.getAttribute('role')).toBe('radiogroup');
    });
  });
