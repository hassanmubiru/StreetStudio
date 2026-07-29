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
