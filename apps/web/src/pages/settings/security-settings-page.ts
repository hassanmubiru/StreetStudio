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
