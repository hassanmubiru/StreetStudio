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

    it('should show error for incomplete verification code', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: false } });
      const el = page.getElement();
      document.body.appendChild(el);

      (el.querySelector('#enable-2fa-btn') as HTMLButtonElement).click();

      const input = el.querySelector('#verification-code') as HTMLInputElement;
      input.value = '123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      (el.querySelector('#verify-2fa-btn') as HTMLButtonElement).click();

      const error = el.querySelector('#verification-error');
      expect(error?.textContent).toContain('6-digit');
    });

    it('should dispatch two-factor-enable event on valid verification', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: false } });
      const el = page.getElement();
      document.body.appendChild(el);

      const handler = vi.fn();
      el.addEventListener('two-factor-enable', handler);

      (el.querySelector('#enable-2fa-btn') as HTMLButtonElement).click();

      const input = el.querySelector('#verification-code') as HTMLInputElement;
      input.value = '123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      (el.querySelector('#verify-2fa-btn') as HTMLButtonElement).click();

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail.verificationCode).toBe('123456');
      expect(handler.mock.calls[0][0].detail.secret).toBeTruthy();
    });

    it('should dispatch two-factor-disable event when disabling', () => {
      page = new SecuritySettingsPage({ twoFactor: { isEnabled: true } });
      const el = page.getElement();
      document.body.appendChild(el);

      const handler = vi.fn();
      el.addEventListener('two-factor-disable', handler);

      (el.querySelector('#disable-2fa-btn') as HTMLButtonElement).click();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Active Sessions Section', () => {
    it('should display all sessions', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const items = el.querySelectorAll('[data-session-id]');
      expect(items.length).toBe(2);
    });

    it('should mark current session', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const currentItem = el.querySelector('[data-session-id="session-1"]');
      expect(currentItem?.textContent).toContain('Current');
    });

    it('should not show revoke button for current session', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const currentItem = el.querySelector('[data-session-id="session-1"]');
      expect(currentItem?.querySelector('.revoke-session-btn')).toBeFalsy();
    });

    it('should show revoke button for other sessions', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const otherItem = el.querySelector('[data-session-id="session-2"]');
      expect(otherItem?.querySelector('.revoke-session-btn')).toBeTruthy();
    });

    it('should dispatch session-revoke event when revoking', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();
      document.body.appendChild(el);

      const handler = vi.fn();
      el.addEventListener('session-revoke', handler);

      const revokeBtn = el.querySelector('[data-session-id="session-2"] .revoke-session-btn') as HTMLButtonElement;
      revokeBtn.click();

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail.sessionId).toBe('session-2');
    });

    it('should remove session from list after revoke', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();
      document.body.appendChild(el);

      const revokeBtn = el.querySelector('[data-session-id="session-2"] .revoke-session-btn') as HTMLButtonElement;
      revokeBtn.click();

      expect(el.querySelector('[data-session-id="session-2"]')).toBeFalsy();
    });

    it('should show revoke all button when multiple sessions exist', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      expect(el.querySelector('#revoke-all-sessions-btn')).toBeTruthy();
    });

    it('should keep only current session after revoke all', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();
      document.body.appendChild(el);

      (el.querySelector('#revoke-all-sessions-btn') as HTMLButtonElement).click();

      const items = el.querySelectorAll('[data-session-id]');
      expect(items.length).toBe(1);
      expect(items[0].getAttribute('data-session-id')).toBe('session-1');
    });

    it('should display device information', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const session1 = el.querySelector('[data-session-id="session-1"]');
      expect(session1?.textContent).toContain('MacBook Pro');
      expect(session1?.textContent).toContain('Chrome 120');
      expect(session1?.textContent).toContain('macOS 14');
      expect(session1?.textContent).toContain('San Francisco, CA');
    });

    it('should show empty message when no sessions', () => {
      page = new SecuritySettingsPage({ sessions: [] });
      const el = page.getElement();

      expect(el.textContent).toContain('No active sessions');
    });
  });

  describe('Login History Section', () => {
    it('should display login history entries', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      const rows = el.querySelectorAll('table[aria-label="Login history"] tbody tr');
      expect(rows.length).toBe(2);
    });

    it('should show suspicious activity alert banner', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      const alert = el.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('suspicious');
    });

    it('should not show alert banner when no suspicious entries', () => {
      const safeHistory = [mockLoginHistory[0]];
      page = new SecuritySettingsPage({ loginHistory: safeHistory });
      const el = page.getElement();

      const alerts = el.querySelectorAll('section[aria-labelledby="login-history-heading"] [role="alert"]');
      expect(alerts.length).toBe(0);
    });

    it('should highlight suspicious entries', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      const rows = el.querySelectorAll('table tbody tr');
      const suspiciousRow = rows[1];
      expect(suspiciousRow.className).toContain('bg-red-50');
    });

    it('should show status icons for success and failure', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      const rows = el.querySelectorAll('table tbody tr');
      expect(rows[0].textContent).toContain('Success');
      expect(rows[1].textContent).toContain('Suspicious');
    });

    it('should display location and IP information', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      expect(el.textContent).toContain('San Francisco, CA');
      expect(el.textContent).toContain('192.168.1.1');
      expect(el.textContent).toContain('Moscow, Russia');
    });

    it('should show reason for suspicious entries', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      expect(el.textContent).toContain('Unusual location');
    });

    it('should show empty message when no login history', () => {
      page = new SecuritySettingsPage({ loginHistory: [] });
      const el = page.getElement();

      expect(el.textContent).toContain('No login history');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions, loginHistory: mockLoginHistory });
      const el = page.getElement();

      const h1 = el.querySelector('h1');
      expect(h1).toBeTruthy();

      const h2s = el.querySelectorAll('h2');
      expect(h2s.length).toBe(4);
    });

    it('should have aria-labelledby on sections', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions, loginHistory: mockLoginHistory });
      const el = page.getElement();

      const sections = el.querySelectorAll('section[aria-labelledby]');
      expect(sections.length).toBe(4);
    });

    it('should have role="alert" on error containers', () => {
      page = new SecuritySettingsPage();
      const el = page.getElement();

      const alerts = el.querySelectorAll('#password-form [role="alert"]');
      expect(alerts.length).toBe(3);
    });

    it('should have accessible session list', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const list = el.querySelector('[role="list"]');
      expect(list).toBeTruthy();
      expect(list?.getAttribute('aria-label')).toBe('Active sessions');
    });

    it('should have accessible login history table', () => {
      page = new SecuritySettingsPage({ loginHistory: mockLoginHistory });
      const el = page.getElement();

      const table = el.querySelector('table[role="table"]');
      expect(table).toBeTruthy();
      expect(table?.getAttribute('aria-label')).toBe('Login history');
    });

    it('should have accessible revoke buttons with labels', () => {
      page = new SecuritySettingsPage({ sessions: mockSessions });
      const el = page.getElement();

      const revokeBtn = el.querySelector('.revoke-session-btn');
      expect(revokeBtn?.getAttribute('aria-label')).toContain('Revoke session on');
    });
  });
});

describe('evaluatePasswordStrength', () => {
  it('should return weak for empty password', () => {
    const result = evaluatePasswordStrength('');
    expect(result.strength).toBe('weak');
    expect(result.score).toBe(0);
  });

  it('should return weak for short password', () => {
    const result = evaluatePasswordStrength('abc');
    expect(result.strength).toBe('weak');
    expect(result.feedback).toContain(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  });

  it('should return fair for password meeting basic criteria', () => {
    const result = evaluatePasswordStrength('password1');
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it('should return strong for password with mixed case, numbers, and symbols', () => {
    const result = evaluatePasswordStrength('MyStr0ng!Pass');
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(['strong', 'very-strong']).toContain(result.strength);
  });

  it('should penalize common patterns', () => {
    const withPattern = evaluatePasswordStrength('123abcABC!');
    const withoutPattern = evaluatePasswordStrength('xY7abcABC!');
    expect(withPattern.score).toBeLessThanOrEqual(withoutPattern.score);
  });

  it('should give feedback for missing uppercase', () => {
    const result = evaluatePasswordStrength('lowercase1!');
    expect(result.feedback.some(f => f.toLowerCase().includes('uppercase'))).toBe(true);
  });

  it('should give feedback for missing numbers', () => {
    const result = evaluatePasswordStrength('NoNumbers!');
    expect(result.feedback.some(f => f.toLowerCase().includes('number'))).toBe(true);
  });

  it('should give feedback for missing special characters', () => {
    const result = evaluatePasswordStrength('NoSpecial1A');
    expect(result.feedback.some(f => f.toLowerCase().includes('special'))).toBe(true);
  });

  it('should reward longer passwords', () => {
    const short = evaluatePasswordStrength('Abc1!def');
    const long = evaluatePasswordStrength('Abc1!defghijklmn');
    expect(long.score).toBeGreaterThanOrEqual(short.score);
  });
});

describe('generateTotpSecret', () => {
  it('should return a 32-character string', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBe(32);
  });

  it('should only contain base32 characters', () => {
    const secret = generateTotpSecret();
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('should generate unique secrets', () => {
    const secret1 = generateTotpSecret();
    const secret2 = generateTotpSecret();
    expect(secret1).not.toBe(secret2);
  });
});

describe('generateOtpAuthUrl', () => {
  it('should generate valid otpauth URL', () => {
    const url = generateOtpAuthUrl('JBSWY3DPEHPK3PXP', 'user@example.com');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('user%40example.com');
  });

  it('should include issuer parameter', () => {
    const url = generateOtpAuthUrl('SECRET', 'user@test.com', 'MyApp');
    expect(url).toContain('issuer=MyApp');
  });

  it('should default issuer to StreetStudio', () => {
    const url = generateOtpAuthUrl('SECRET', 'user@test.com');
    expect(url).toContain('issuer=StreetStudio');
  });

  it('should include algorithm and period', () => {
    const url = generateOtpAuthUrl('SECRET', 'user@test.com');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });
});
