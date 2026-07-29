/**
 * Security Settings Page Tests
 * 
 * Tests for account security settings including password change with strength validation,
 * two-factor authentication setup, active session management, and login history.
 * 
 * Requirements: 9.2, 9.6
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SecuritySettingsPage,
  evaluatePasswordStrength,
  createPasswordChangeValidator,
  generateTotpSecret,
  generateOtpAuthUrl,
  formatRelativeTime,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  STRENGTH_LABELS,
  type ActiveSession,
  type LoginHistoryEntry,
  type TwoFactorSetupData,
  type PasswordStrength,
} from './security-settings-page.js';

describe('SecuritySettingsPage', () => {
  let page: SecuritySettingsPage;

  const mockSessions: ActiveSession[] = [
    {
      id: 'session-1',
      deviceName: 'MacBook Pro',
      browser: 'Chrome 120',
      operatingSystem: 'macOS 14',
      ipAddress: '192.168.1.1',
      location: 'San Francisco, CA',
      lastActive: new Date().toISOString(),
      isCurrent: true,
    },
    {
      id: 'session-2',
      deviceName: 'iPhone 15',
      browser: 'Safari 17',
      operatingSystem: 'iOS 17',
      ipAddress: '10.0.0.5',
      location: 'San Francisco, CA',
      lastActive: new Date(Date.now() - 3600000).toISOString(),
      isCurrent: false,
    },
  ];
