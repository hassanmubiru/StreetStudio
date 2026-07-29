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

  describe('High Contrast', () => {
    it('should render high contrast toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      expect(toggle).toBeTruthy();
      expect(toggle.checked).toBe(false);
    });

    it('should toggle high contrast on change', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().highContrast).toBe(true);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should apply high contrast class to document', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true');
    });

    it('should show checked when initialized with highContrast true', () => {
      page = new AccessibilitySettingsPage({ ...mockPreferences, highContrast: true });
      const el = page.getElement();

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });
  });

  describe('Reduced Motion', () => {
    it('should render reduced motion toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const toggle = el.querySelector('#reduced-motion-toggle') as HTMLInputElement;
      expect(toggle).toBeTruthy();
      expect(toggle.checked).toBe(false);
    });

    it('should toggle reduced motion on change', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#reduced-motion-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().reducedMotion).toBe(true);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should apply reduced-motion class to document', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#reduced-motion-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
      expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    });
  });

  describe('Screen Reader Optimizations', () => {
    it('should render screen reader toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const toggle = el.querySelector('#screen-reader-toggle') as HTMLInputElement;
      expect(toggle).toBeTruthy();
      expect(toggle.checked).toBe(false);
    });

    it('should toggle screen reader optimizations on change', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#screen-reader-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().screenReaderOptimizations).toBe(true);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should set data attribute on document', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#screen-reader-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(document.documentElement.getAttribute('data-screen-reader-optimized')).toBe('true');
    });
  });

  describe('Keyboard Navigation Preferences', () => {
    it('should render all keyboard navigation toggles', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      expect(el.querySelector('#kb-enabled')).toBeTruthy();
      expect(el.querySelector('#kb-focus-indicators')).toBeTruthy();
      expect(el.querySelector('#kb-skip-link')).toBeTruthy();
      expect(el.querySelector('#kb-arrow-nav')).toBeTruthy();
    });

    it('should reflect initial keyboard preferences', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const enabled = el.querySelector('#kb-enabled') as HTMLInputElement;
      const focus = el.querySelector('#kb-focus-indicators') as HTMLInputElement;
      const skip = el.querySelector('#kb-skip-link') as HTMLInputElement;
      const arrow = el.querySelector('#kb-arrow-nav') as HTMLInputElement;

      expect(enabled.checked).toBe(true);
      expect(focus.checked).toBe(true);
      expect(skip.checked).toBe(true);
      expect(arrow.checked).toBe(true);
    });

    it('should update keyboard enabled preference on toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const enabled = el.querySelector('#kb-enabled') as HTMLInputElement;
      enabled.checked = false;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().keyboardNavigation.enabled).toBe(false);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should update focus indicators preference on toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const focus = el.querySelector('#kb-focus-indicators') as HTMLInputElement;
      focus.checked = false;
      focus.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().keyboardNavigation.showFocusIndicators).toBe(false);
    });

    it('should update skip link preference on toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const skip = el.querySelector('#kb-skip-link') as HTMLInputElement;
      skip.checked = false;
      skip.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().keyboardNavigation.skipLinkEnabled).toBe(false);
    });

    it('should update arrow navigation preference on toggle', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const arrow = el.querySelector('#kb-arrow-nav') as HTMLInputElement;
      arrow.checked = false;
      arrow.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getPreferences().keyboardNavigation.arrowKeyNavigation).toBe(false);
    });

    it('should apply keyboard-nav class to document', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      expect(document.documentElement.classList.contains('keyboard-nav')).toBe(true);

      const enabled = el.querySelector('#kb-enabled') as HTMLInputElement;
      enabled.checked = false;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));

      expect(document.documentElement.classList.contains('keyboard-nav')).toBe(false);
    });
  });
