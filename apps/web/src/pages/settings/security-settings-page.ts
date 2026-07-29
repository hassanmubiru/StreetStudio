/**
 * Security Settings Page
 * 
 * Complete account security management with password change (strength validation),
 * two-factor authentication setup (QR code), active session management (device info),
 * and login history with suspicious activity alerts.
 * 
 * Requirements: 9.2, 9.6
 */

import { FormValidator, ValidationRules, type ValidationResult } from '../../utils/validation.js';

// --- Types ---

export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface TwoFactorSetupData {
  isEnabled: boolean;
  secret?: string;
  qrCodeUrl?: string;
  recoveryCodes?: string[];
}

export interface ActiveSession {
  id: string;
  deviceName: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  location?: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface LoginHistoryEntry {
  id: string;
  timestamp: string;
  ipAddress: string;
  location?: string;
  browser: string;
  operatingSystem: string;
  success: boolean;
  suspicious: boolean;
  reason?: string;
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0-4
  feedback: string[];
}

// --- Constants ---

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const STRENGTH_COLORS: Record<PasswordStrength, string> = {
  'weak': 'bg-red-500',
  'fair': 'bg-orange-500',
  'good': 'bg-yellow-500',
  'strong': 'bg-green-500',
  'very-strong': 'bg-emerald-600',
};

export const STRENGTH_LABELS: Record<PasswordStrength, string> = {
  'weak': 'Weak',
  'fair': 'Fair',
  'good': 'Good',
  'strong': 'Strong',
  'very-strong': 'Very Strong',
};

// --- Password Strength ---

/**
 * Evaluate password strength using multiple criteria
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return { strength: 'weak', score: 0, feedback: ['Enter a password'] };
  }

  // Length check
  if (password.length >= PASSWORD_MIN_LENGTH) {
    score++;
    if (password.length >= 12) score++;
  } else {
    feedback.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  // Character variety
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (hasLower && hasUpper) {
    score++;
  } else {
    feedback.push('Use both uppercase and lowercase letters');
  }

  if (hasNumber) {
    score += 0.5;
  } else {
    feedback.push('Add at least one number');
  }

  if (hasSpecial) {
    score += 0.5;
  } else {
    feedback.push('Add a special character (!@#$%...)');
  }

  // Common patterns check
  const commonPatterns = [
    /^123/, /^abc/i, /password/i, /qwerty/i, /^(.)\1+$/,
  ];
  const hasCommonPattern = commonPatterns.some(p => p.test(password));
  if (hasCommonPattern) {
    score = Math.max(0, score - 1);
    feedback.push('Avoid common patterns');
  }

  // Map score to strength
  const finalScore = Math.min(4, Math.floor(score));
  const strengthMap: PasswordStrength[] = ['weak', 'fair', 'good', 'strong', 'very-strong'];
  const strength = strengthMap[finalScore] || 'weak';

  return { strength, score: finalScore, feedback };
}

// --- Validators ---

/**
 * Create password change form validator
 */
export function createPasswordChangeValidator(): FormValidator {
  return new FormValidator({
    currentPassword: [
      ValidationRules.required('Current password is required'),
    ],
    newPassword: [
      ValidationRules.required('New password is required'),
      ValidationRules.minLength(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
      ValidationRules.maxLength(PASSWORD_MAX_LENGTH, `Password must be no more than ${PASSWORD_MAX_LENGTH} characters`),
      ValidationRules.pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and number'
      ),
    ],
    confirmPassword: [
      ValidationRules.required('Please confirm your new password'),
    ],
  });
}

/**
 * Generate a mock TOTP secret for 2FA setup
 * In production, this would come from the backend API
 */
export function generateTotpSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 32; i++) {
    secret += chars[Math.floor(Math.random() * chars.length)];
  }
  return secret;
}

/**
 * Generate the otpauth URL used for QR code generation
 */
export function generateOtpAuthUrl(secret: string, email: string, issuer = 'StreetStudio'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Format a timestamp to a human-readable relative time
 */
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// --- Main Page Class ---

export class SecuritySettingsPage {
  private element: HTMLElement;
  private passwordData: PasswordChangeData;
  private twoFactorData: TwoFactorSetupData;
  private sessions: ActiveSession[];
  private loginHistory: LoginHistoryEntry[];
  private passwordStrengthResult: PasswordStrengthResult;
  private validator: FormValidator;
  private isSaving = false;
  private showTwoFactorSetup = false;
  private verificationCode = '';

  constructor(options?: {
    twoFactor?: TwoFactorSetupData;
    sessions?: ActiveSession[];
    loginHistory?: LoginHistoryEntry[];
  }) {
    this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.twoFactorData = options?.twoFactor || { isEnabled: false };
    this.sessions = options?.sessions || [];
    this.loginHistory = options?.loginHistory || [];
    this.passwordStrengthResult = { strength: 'weak', score: 0, feedback: [] };
    this.validator = createPasswordChangeValidator();

    this.element = document.createElement('div');
    this.element.className = 'p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getPasswordData(): PasswordChangeData {
    return { ...this.passwordData };
  }

  public getTwoFactorData(): TwoFactorSetupData {
    return { ...this.twoFactorData };
  }

  public getSessions(): ActiveSession[] {
    return [...this.sessions];
  }

  public getLoginHistory(): LoginHistoryEntry[] {
    return [...this.loginHistory];
  }

  public updateSessions(sessions: ActiveSession[]): void {
    this.sessions = sessions;
    this.render();
  }

  public updateLoginHistory(history: LoginHistoryEntry[]): void {
    this.loginHistory = history;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderPasswordSection());
    this.element.appendChild(this.renderTwoFactorSection());
    this.element.appendChild(this.renderSessionsSection());
    this.element.appendChild(this.renderLoginHistorySection());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mb-8';
    header.innerHTML = `
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Security Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your password, two-factor authentication, and monitor account activity.
      </p>
    `;
    return header;
  }

  private renderPasswordSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'password-heading');

    const strengthBar = this.renderStrengthBar();

    section.innerHTML = `
      <h2 id="password-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Change Password</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Choose a strong password to protect your account. You'll need your current password to make changes.
      </p>
      <form id="password-form" novalidate class="space-y-4">
        <div>
          <label for="current-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Current Password <span class="text-red-500">*</span>
          </label>
          <input
            id="current-password"
            type="password"
            name="currentPassword"
            autocomplete="current-password"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            aria-describedby="current-password-help"
          />
          <div id="current-password-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
        <div>
          <label for="new-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            New Password <span class="text-red-500">*</span>
          </label>
          <input
            id="new-password"
            type="password"
            name="newPassword"
            autocomplete="new-password"
            required
            minlength="${PASSWORD_MIN_LENGTH}"
            maxlength="${PASSWORD_MAX_LENGTH}"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            aria-describedby="password-strength-desc new-password-error"
          />
          <div id="password-strength-indicator" class="mt-2">${strengthBar}</div>
          <div id="password-strength-desc" class="mt-1 text-xs text-gray-500 dark:text-gray-400" aria-live="polite"></div>
          <div id="new-password-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
        <div>
          <label for="confirm-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Confirm New Password <span class="text-red-500">*</span>
          </label>
          <input
            id="confirm-password"
            type="password"
            name="confirmPassword"
            autocomplete="new-password"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            aria-describedby="confirm-password-error"
          />
          <div id="confirm-password-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
        <div class="pt-2">
          <button
            id="change-password-btn"
            type="submit"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Update Password
          </button>
        </div>
      </form>
    `;
    return section;
  }

  private renderStrengthBar(): string {
    const { strength, score } = this.passwordStrengthResult;
    if (!this.passwordData.newPassword) {
      return `<div class="flex gap-1"><span class="h-1 flex-1 rounded bg-gray-200 dark:bg-gray-600"></span><span class="h-1 flex-1 rounded bg-gray-200 dark:bg-gray-600"></span><span class="h-1 flex-1 rounded bg-gray-200 dark:bg-gray-600"></span><span class="h-1 flex-1 rounded bg-gray-200 dark:bg-gray-600"></span></div>`;
    }
    const color = STRENGTH_COLORS[strength];
    const label = STRENGTH_LABELS[strength];
    const bars = Array.from({ length: 4 }, (_, i) =>
      `<span class="h-1 flex-1 rounded ${i <= score ? color : 'bg-gray-200 dark:bg-gray-600'}"></span>`
    ).join('');
    return `
      <div class="flex gap-1">${bars}</div>
      <div class="flex justify-between items-center mt-1">
        <span class="text-xs font-medium ${color.replace('bg-', 'text-')}">${label}</span>
      </div>
    `;
  }

  private renderTwoFactorSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'two-factor-heading');

    let content: string;
    if (this.twoFactorData.isEnabled) {
      content = this.renderTwoFactorEnabled();
    } else if (this.showTwoFactorSetup) {
      content = this.renderTwoFactorSetupFlow();
    } else {
      content = this.renderTwoFactorDisabled();
    }

    section.innerHTML = `
      <h2 id="two-factor-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Two-Factor Authentication</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Add an extra layer of security to your account by requiring a verification code in addition to your password.
      </p>
      ${content}
    `;
    return section;
  }

  private renderTwoFactorDisabled(): string {
    return `
      <div class="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
        <svg class="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
        <span class="text-sm text-yellow-800 dark:text-yellow-200">Two-factor authentication is not enabled. Your account is less secure.</span>
      </div>
      <button
        id="enable-2fa-btn"
        type="button"
        class="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        Enable Two-Factor Authentication
      </button>
    `;
  }

  private renderTwoFactorEnabled(): string {
    return `
      <div class="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-4">
        <svg class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
        </svg>
        <span class="text-sm text-green-800 dark:text-green-200">Two-factor authentication is enabled.</span>
      </div>
      <button
        id="disable-2fa-btn"
        type="button"
        class="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      >
        Disable Two-Factor Authentication
      </button>
    `;
  }

  private renderTwoFactorSetupFlow(): string {
    const secret = this.twoFactorData.secret || generateTotpSecret();
    if (!this.twoFactorData.secret) {
      this.twoFactorData.secret = secret;
    }
    const otpUrl = generateOtpAuthUrl(secret, 'user@example.com');
    this.twoFactorData.qrCodeUrl = otpUrl;

    // Format secret with spaces for readability
    const formattedSecret = secret.match(/.{1,4}/g)?.join(' ') || secret;

    return `
      <div class="space-y-6">
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Step 1: Scan QR Code</h3>
          <p class="text-xs text-blue-700 dark:text-blue-300 mb-3">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
          </p>
          <div id="qr-code-display" class="flex justify-center p-4 bg-white rounded-lg mb-3" aria-label="QR code for two-factor authentication setup" role="img">
            <div class="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs text-center">
              QR Code<br/>${otpUrl.substring(0, 30)}...
            </div>
          </div>
          <details class="text-xs">
            <summary class="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">Can't scan? Enter manually</summary>
            <div class="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <p class="text-gray-600 dark:text-gray-300 mb-1">Secret key:</p>
              <code id="totp-secret" class="text-sm font-mono text-gray-900 dark:text-white select-all">${formattedSecret}</code>
            </div>
          </details>
        </div>
        <div>
          <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Step 2: Enter Verification Code</h3>
          <div class="flex items-center gap-3">
            <input
              id="verification-code"
              type="text"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="000000"
              class="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center font-mono text-lg tracking-widest"
              aria-label="Six-digit verification code"
              aria-describedby="verification-code-help"
            />
            <button
              id="verify-2fa-btn"
              type="button"
              class="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              Verify & Enable
            </button>
          </div>
          <p id="verification-code-help" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Enter the 6-digit code from your authenticator app.
          </p>
          <div id="verification-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
        <button
          id="cancel-2fa-btn"
          type="button"
          class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-500 transition-colors"
        >
          Cancel setup
        </button>
      </div>
    `;
  }

  private renderSessionsSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'sessions-heading');

    let sessionsHtml: string;
    if (this.sessions.length === 0) {
      sessionsHtml = `<p class="text-sm text-gray-500 dark:text-gray-400">No active sessions found.</p>`;
    } else {
      sessionsHtml = `
        <ul class="divide-y divide-gray-200 dark:divide-gray-700" role="list" aria-label="Active sessions">
          ${this.sessions.map(session => this.renderSessionItem(session)).join('')}
        </ul>
      `;
    }

    section.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 id="sessions-heading" class="text-lg font-medium text-gray-900 dark:text-white">Active Sessions</h2>
        ${this.sessions.length > 1 ? `
          <button
            id="revoke-all-sessions-btn"
            type="button"
            class="text-sm text-red-600 dark:text-red-400 hover:text-red-500 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
          >
            Revoke All Other Sessions
          </button>
        ` : ''}
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        These are the devices currently logged into your account.
      </p>
      ${sessionsHtml}
    `;
    return section;
  }

  private renderSessionItem(session: ActiveSession): string {
    const deviceIcon = this.getDeviceIcon(session.operatingSystem);
    const currentBadge = session.isCurrent
      ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Current</span>'
      : '';

    return `
      <li class="py-4 flex items-center justify-between" data-session-id="${session.id}">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            ${deviceIcon}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">${this.escapeHtml(session.deviceName)}</span>
              ${currentBadge}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              ${this.escapeHtml(session.browser)} on ${this.escapeHtml(session.operatingSystem)}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              ${session.location ? `${this.escapeHtml(session.location)} · ` : ''}${session.ipAddress} · ${formatRelativeTime(session.lastActive)}
            </p>
          </div>
        </div>
        ${!session.isCurrent ? `
          <button
            type="button"
            class="revoke-session-btn text-sm text-red-600 dark:text-red-400 hover:text-red-500 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
            data-session-id="${session.id}"
            aria-label="Revoke session on ${this.escapeHtml(session.deviceName)}"
          >
            Revoke
          </button>
        ` : ''}
      </li>
    `;
  }

  private getDeviceIcon(os: string): string {
    const osLower = os.toLowerCase();
    if (osLower.includes('windows')) {
      return '<svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M3 12V6.75l8-1.25V12H3zm0 .5h8v6.5l-8-1.25V12.5zM11.5 12V5.25l9.5-1.5V12h-9.5zm0 .5h9.5v8.25l-9.5-1.5V12.5z"/></svg>';
    }
    if (osLower.includes('mac') || osLower.includes('ios')) {
      return '<svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>';
    }
    if (osLower.includes('linux')) {
      return '<svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
    }
    if (osLower.includes('android')) {
      return '<svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25S6.31 12.75 7 12.75s1.25.56 1.25 1.25S7.69 15.25 7 15.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/></svg>';
    }
    // Default device icon
    return '<svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>';
  }

  private renderLoginHistorySection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'login-history-heading');

    const suspiciousCount = this.loginHistory.filter(e => e.suspicious).length;
    const alertBanner = suspiciousCount > 0 ? `
      <div class="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4" role="alert">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
        <span class="text-sm text-red-800 dark:text-red-200">
          ${suspiciousCount} suspicious login attempt${suspiciousCount > 1 ? 's' : ''} detected. Review your recent activity below.
        </span>
      </div>
    ` : '';

    let historyHtml: string;
    if (this.loginHistory.length === 0) {
      historyHtml = `<p class="text-sm text-gray-500 dark:text-gray-400">No login history available.</p>`;
    } else {
      historyHtml = `
        <div class="overflow-x-auto">
          <table class="w-full min-w-[500px]" role="table" aria-label="Login history">
            <thead>
              <tr class="text-left border-b border-gray-200 dark:border-gray-700">
                <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date & Time</th>
                <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Location</th>
                <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Device</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              ${this.loginHistory.map(entry => this.renderLoginHistoryRow(entry)).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    section.innerHTML = `
      <h2 id="login-history-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Login History</h2>
      ${alertBanner}
      ${historyHtml}
    `;
    return section;
  }

  private renderLoginHistoryRow(entry: LoginHistoryEntry): string {
    const statusIcon = entry.suspicious
      ? '<span class="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>Suspicious</span>'
      : entry.success
        ? '<span class="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>Success</span>'
        : '<span class="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>Failed</span>';

    const date = new Date(entry.timestamp);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const rowClass = entry.suspicious ? 'bg-red-50 dark:bg-red-900/10' : '';

    return `
      <tr class="${rowClass}" ${entry.suspicious ? 'aria-label="Suspicious login attempt"' : ''}>
        <td class="px-3 py-3 text-sm">${statusIcon}</td>
        <td class="px-3 py-3 text-sm text-gray-900 dark:text-white">${formattedDate}</td>
        <td class="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">
          ${entry.location ? this.escapeHtml(entry.location) : 'Unknown'}
          <span class="text-xs text-gray-400 dark:text-gray-500 block">${entry.ipAddress}</span>
        </td>
        <td class="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">
          ${this.escapeHtml(entry.browser)} on ${this.escapeHtml(entry.operatingSystem)}
          ${entry.reason ? `<span class="text-xs text-red-500 dark:text-red-400 block">${this.escapeHtml(entry.reason)}</span>` : ''}
        </td>
      </tr>
    `;
  }

  private setupEventListeners(): void {
    // Password form
    const passwordForm = this.element.querySelector('#password-form') as HTMLFormElement;
    passwordForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handlePasswordSubmit();
    });

    // New password input (strength indicator)
    const newPasswordInput = this.element.querySelector('#new-password') as HTMLInputElement;
    newPasswordInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.passwordData.newPassword = value;
      this.passwordStrengthResult = evaluatePasswordStrength(value);
      this.updateStrengthIndicator();
    });

    // Current password
    const currentPasswordInput = this.element.querySelector('#current-password') as HTMLInputElement;
    currentPasswordInput?.addEventListener('input', (e) => {
      this.passwordData.currentPassword = (e.target as HTMLInputElement).value;
    });

    // Confirm password
    const confirmPasswordInput = this.element.querySelector('#confirm-password') as HTMLInputElement;
    confirmPasswordInput?.addEventListener('input', (e) => {
      this.passwordData.confirmPassword = (e.target as HTMLInputElement).value;
      this.validatePasswordMatch();
    });

    // 2FA Enable button
    const enable2faBtn = this.element.querySelector('#enable-2fa-btn');
    enable2faBtn?.addEventListener('click', () => {
      this.showTwoFactorSetup = true;
      this.render();
    });

    // 2FA Cancel button
    const cancel2faBtn = this.element.querySelector('#cancel-2fa-btn');
    cancel2faBtn?.addEventListener('click', () => {
      this.showTwoFactorSetup = false;
      this.twoFactorData.secret = undefined;
      this.twoFactorData.qrCodeUrl = undefined;
      this.render();
    });

    // 2FA Verify button
    const verify2faBtn = this.element.querySelector('#verify-2fa-btn');
    verify2faBtn?.addEventListener('click', () => {
      this.handleVerify2FA();
    });

    // 2FA Disable button
    const disable2faBtn = this.element.querySelector('#disable-2fa-btn');
    disable2faBtn?.addEventListener('click', () => {
      this.handleDisable2FA();
    });

    // Verification code input
    const verificationInput = this.element.querySelector('#verification-code') as HTMLInputElement;
    verificationInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value.replace(/\D/g, '');
      (e.target as HTMLInputElement).value = value;
      this.verificationCode = value;
    });

    // Session revoke buttons
    const revokeButtons = this.element.querySelectorAll('.revoke-session-btn');
    revokeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = (e.currentTarget as HTMLElement).dataset.sessionId;
        if (sessionId) this.handleRevokeSession(sessionId);
      });
    });

    // Revoke all sessions
    const revokeAllBtn = this.element.querySelector('#revoke-all-sessions-btn');
    revokeAllBtn?.addEventListener('click', () => {
      this.handleRevokeAllSessions();
    });
  }
