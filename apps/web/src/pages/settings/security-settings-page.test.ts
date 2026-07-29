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

  const mockLoginHistory: LoginHistoryEntry[] = [
    {
      id: 'login-1',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.1',
      location: 'San Francisco, CA',
      browser: 'Chrome 120',
      operatingSystem: 'macOS 14',
      success: true,
      suspicious: false,
    },
    {
      id: 'login-2',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      ipAddress: '45.33.21.100',
      location: 'Moscow, Russia',
      browser: 'Firefox 110',
      operatingSystem: 'Windows 11',
      success: false,
      suspicious: true,
      reason: 'Unusual location',
    },
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    page?.destroy();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create page element with correct structure', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-main-content')).toBe('');
      expect(el.querySelector('h1')?.textContent).toBe('Security Settings');
    });

    it('should render all main sections', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions, loginHistory: mockLoginHistory });
      const el = page.getElement();

      expect(el.querySelector('#password-heading')).toBeTruthy();
      expect(el.querySelector('#two-factor-heading')).toBeTruthy();
      expect(el.querySelector('#sessions-heading')).toBeTruthy();
      expect(el.querySelector('#login-history-heading')).toBeTruthy();
    });
  });

  describe('Password Change Section', () => {
    it('should render password form with required fields', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();

      expect(el.querySelector('#current-password')).toBeTruthy();
      expect(el.querySelector('#new-password')).toBeTruthy();
      expect(el.querySelector('#confirm-password')).toBeTruthy();
      expect(el.querySelector('#change-password-btn')).toBeTruthy();
    });

    it('should have correct autocomplete attributes', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();

      const currentPw = el.querySelector('#current-password') as HTMLInputElement;
      expect(currentPw.getAttribute('autocomplete')).toBe('current-password');

      const newPw = el.querySelector('#new-password') as HTMLInputElement;
      expect(newPw.getAttribute('autocomplete')).toBe('new-password');
    });

    it('should update password strength indicator on new password input', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();
      document.body.appendChild(el);

      const newPw = el.querySelector('#new-password') as HTMLInputElement;
      newPw.value = 'StrongPass1!';
      newPw.dispatchEvent(new Event('input', { bubbles: true }));

      const indicator = el.querySelector('#password-strength-indicator');
      expect(indicator?.innerHTML).toContain('Strong');
    });

    it('should show strength feedback for weak passwords', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();
      document.body.appendChild(el);

      const newPw = el.querySelector('#new-password') as HTMLInputElement;
      newPw.value = 'abc';
      newPw.dispatchEvent(new Event('input', { bubbles: true }));

      const desc = el.querySelector('#password-strength-desc');
      expect(desc?.textContent).toContain('at least');
    });

    it('should validate password match on confirm input', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();
      document.body.appendChild(el);

      const newPw = el.querySelector('#new-password') as HTMLInputElement;
      newPw.value = 'MyPassword1!';
      newPw.dispatchEvent(new Event('input', { bubbles: true }));

      const confirmPw = el.querySelector('#confirm-password') as HTMLInputElement;
      confirmPw.value = 'Different1!';
      confirmPw.dispatchEvent(new Event('input', { bubbles: true }));

      const error = el.querySelector('#confirm-password-error');
      expect(error?.textContent).toBe('Passwords do not match');
    });

    it('should clear mismatch error when passwords match', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();
      document.body.appendChild(el);

      const newPw = el.querySelector('#new-password') as HTMLInputElement;
      newPw.value = 'MyPassword1!';
      newPw.dispatchEvent(new Event('input', { bubbles: true }));

      const confirmPw = el.querySelector('#confirm-password') as HTMLInputElement;
      confirmPw.value = 'MyPassword1!';
      confirmPw.dispatchEvent(new Event('input', { bubbles: true }));

      const error = el.querySelector('#confirm-password-error');
      expect(error?.textContent).toBe('');
    });

    it('should dispatch password-change event on valid submit', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();
      document.body.appendChild(el);

      const handler = vi.fn();
      el.addEventListener('password-change', handler);

      // Fill fields
      const currentPw = el.querySelector('#current-password') as HTMLInputElement;
      currentPw.value = 'OldPassword1';
      currentPw.dispatchEvent(new Event('input', { bubbles: true }));

      const newPw = el.querySelector('#new-password') as HTMLInputElement;
      newPw.value = 'NewStrong1!';
      newPw.dispatchEvent(new Event('input', { bubbles: true }));

      const confirmPw = el.querySelector('#confirm-password') as HTMLInputElement;
      confirmPw.value = 'NewStrong1!';
      confirmPw.dispatchEvent(new Event('input', { bubbles: true }));

      // Submit
      const form = el.querySelector('#password-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail.passwordData.newPassword).toBe('NewStrong1!');
    });

    it('should show validation error when current password is empty', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();
      document.body.appendChild(el);

      const form = el.querySelector('#password-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { bubbles: true }));

      const error = el.querySelector('#current-password-error');
      expect(error?.textContent).toContain('required');
    });
  });

  describe('Two-Factor Authentication Section', () => {
    it('should show disabled state when 2FA is not enabled', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: false } });
      const el = page.getElement();

      expect(el.querySelector('#enable-2fa-btn')).toBeTruthy();
      expect(el.textContent).toContain('not enabled');
    });

    it('should show enabled state when 2FA is active', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: true } });
      const el = page.getElement();

      expect(el.querySelector('#disable-2fa-btn')).toBeTruthy();
      expect(el.textContent).toContain('is enabled');
    });

    it('should show setup flow when enable button is clicked', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: false } });
      const el = page.getElement();
      document.body.appendChild(el);

      const enableBtn = el.querySelector('#enable-2fa-btn') as HTMLButtonElement;
      enableBtn.click();

      expect(el.querySelector('#qr-code-display')).toBeTruthy();
      expect(el.querySelector('#verification-code')).toBeTruthy();
      expect(el.querySelector('#verify-2fa-btn')).toBeTruthy();
      expect(el.querySelector('#totp-secret')).toBeTruthy();
    });

    it('should cancel setup flow when cancel is clicked', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: false } });
      const el = page.getElement();
      document.body.appendChild(el);

      // Start setup
      (el.querySelector('#enable-2fa-btn') as HTMLButtonElement).click();
      expect(el.querySelector('#qr-code-display')).toBeTruthy();

      // Cancel
      (el.querySelector('#cancel-2fa-btn') as HTMLButtonElement).click();
      expect(el.querySelector('#qr-code-display')).toBeFalsy();
      expect(el.querySelector('#enable-2fa-btn')).toBeTruthy();
    });

    it('should restrict verification code to 6 digits', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: false } });
      const el = page.getElement();
      document.body.appendChild(el);

      (el.querySelector('#enable-2fa-btn') as HTMLButtonElement).click();

      const input = el.querySelector('#verification-code') as HTMLInputElement;
      expect(input.getAttribute('maxlength')).toBe('6');
      expect(input.getAttribute('inputmode')).toBe('numeric');
    });
