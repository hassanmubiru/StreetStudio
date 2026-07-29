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

  describe('Save and Discard', () => {
    it('should disable save button when not dirty', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const saveBtn = el.querySelector('#a11y-save-settings') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable save button when dirty', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      const saveBtn = el.querySelector('#a11y-save-settings') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    it('should save preferences to localStorage on save', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      const saveBtn = el.querySelector('#a11y-save-settings') as HTMLButtonElement;
      saveBtn.click();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"highContrast":true')
      );
    });

    it('should dispatch accessibility-settings-save event on save', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const saveSpy = vi.fn();
      el.addEventListener('accessibility-settings-save', saveSpy);

      const toggle = el.querySelector('#reduced-motion-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      const saveBtn = el.querySelector('#a11y-save-settings') as HTMLButtonElement;
      saveBtn.click();

      expect(saveSpy).toHaveBeenCalled();
      expect(saveSpy.mock.calls[0][0].detail.preferences.reducedMotion).toBe(true);
    });

    it('should reset dirty state after discard', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#high-contrast-toggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      expect(page.isDirtyState()).toBe(true);

      const discardBtn = el.querySelector('#a11y-discard-changes') as HTMLButtonElement;
      discardBtn.click();

      expect(page.isDirtyState()).toBe(false);
    });

    it('should show save status messages', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const status = el.querySelector('#a11y-save-status');
      expect(status?.textContent).toBe('All changes saved');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const h1 = el.querySelector('h1');
      expect(h1).toBeTruthy();

      const h2s = el.querySelectorAll('h2');
      expect(h2s.length).toBe(5); // Theme, High Contrast, Reduced Motion, Screen Reader, Keyboard
    });

    it('should have aria-labelledby on sections', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const sections = el.querySelectorAll('section[aria-labelledby]');
      expect(sections.length).toBe(5);
    });

    it('should have radio role on theme cards', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const cards = el.querySelectorAll('[role="radio"]');
      expect(cards.length).toBe(3);
    });

    it('should have toolbar role on save bar', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const toolbar = el.querySelector('[role="toolbar"]');
      expect(toolbar).toBeTruthy();
      expect(toolbar?.getAttribute('aria-label')).toBe('Save actions');
    });

    it('should have live region for status updates', () => {
      page = new AccessibilitySettingsPage(mockPreferences);
      const el = page.getElement();

      const status = el.querySelector('#a11y-save-status');
      expect(status?.getAttribute('aria-live')).toBe('polite');
    });
  });
});

describe('createDefaultAccessibilityPreferences', () => {
  it('should return correct default preferences', () => {
    const prefs = createDefaultAccessibilityPreferences();
    expect(prefs.highContrast).toBe(false);
    expect(prefs.screenReaderOptimizations).toBe(false);
    expect(prefs.theme).toBe('system');
    expect(prefs.keyboardNavigation.enabled).toBe(true);
    expect(prefs.keyboardNavigation.showFocusIndicators).toBe(true);
    expect(prefs.keyboardNavigation.skipLinkEnabled).toBe(true);
    expect(prefs.keyboardNavigation.arrowKeyNavigation).toBe(true);
  });
});

describe('resolveTheme', () => {
  it('should return light for light theme', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  it('should return dark for dark theme', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('should resolve system theme based on media query', () => {
    const result = resolveTheme('system');
    expect(['light', 'dark']).toContain(result);
  });
});

describe('loadAccessibilityPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return defaults when nothing stored', () => {
    const prefs = loadAccessibilityPreferences();
    expect(prefs.theme).toBe('system');
    expect(prefs.highContrast).toBe(false);
  });

  it('should parse stored preferences', () => {
    const stored: AccessibilityPreferences = {
      ...createDefaultAccessibilityPreferences(),
      highContrast: true,
      theme: 'dark',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const prefs = loadAccessibilityPreferences();
    expect(prefs.highContrast).toBe(true);
    expect(prefs.theme).toBe('dark');
  });

  it('should handle invalid JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid json{');
    const prefs = loadAccessibilityPreferences();
    expect(prefs.theme).toBe('system');
  });
});

describe('saveAccessibilityPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save preferences to localStorage', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.highContrast = true;
    saveAccessibilityPreferences(prefs);

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBe(JSON.stringify(prefs));
  });
});

describe('applyAccessibilityPreferences', () => {
  it('should add high-contrast class when enabled', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.highContrast = true;
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
    expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true');
  });

  it('should remove high-contrast class when disabled', () => {
    document.documentElement.classList.add('high-contrast');
    const prefs = createDefaultAccessibilityPreferences();
    prefs.highContrast = false;
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
    expect(document.documentElement.getAttribute('data-high-contrast')).toBe('false');
  });

  it('should add reduced-motion class when enabled', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.reducedMotion = true;
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
  });

  it('should set dark class for dark theme', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.theme = 'dark';
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should set light class for light theme', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.theme = 'light';
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should set keyboard-nav class when enabled', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.keyboardNavigation.enabled = true;
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('keyboard-nav')).toBe(true);
  });

  it('should set show-focus class when focus indicators enabled', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.keyboardNavigation.showFocusIndicators = true;
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.classList.contains('show-focus')).toBe(true);
  });

  it('should store theme preference as data attribute', () => {
    const prefs = createDefaultAccessibilityPreferences();
    prefs.theme = 'system';
    applyAccessibilityPreferences(prefs);

    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('system');
  });
});

describe('getAccessibilityCSS', () => {
  it('should return non-empty CSS string', () => {
    const css = getAccessibilityCSS();
    expect(css.length).toBeGreaterThan(0);
  });

  it('should include high-contrast rules', () => {
    const css = getAccessibilityCSS();
    expect(css).toContain('.high-contrast');
  });

  it('should include reduced-motion rules', () => {
    const css = getAccessibilityCSS();
    expect(css).toContain('.reduced-motion');
  });

  it('should include focus indicator rules', () => {
    const css = getAccessibilityCSS();
    expect(css).toContain('.show-focus');
  });

  it('should include theme preview card styles', () => {
    const css = getAccessibilityCSS();
    expect(css).toContain('.theme-preview-card');
  });
});
