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
