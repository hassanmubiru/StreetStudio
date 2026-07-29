/**
 * Profile Settings Page
 * 
 * Complete user profile management with avatar upload, display name editing,
 * bio editing with character limits, timezone selection with automatic detection,
 * and granular notification preference controls.
 * 
 * Requirements: 9.1, 9.3
 */

import { FormValidator, ValidationRules, type ValidationResult } from '../../utils/validation.js';

export interface ProfileData {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  timezone: string;
  notificationPreferences: NotificationPreferences;
}

export interface NotificationPreferences {
  email: NotificationCategorySettings;
  push: NotificationCategorySettings;
  inApp: NotificationCategorySettings;
}

export interface NotificationCategorySettings {
  comments: boolean;
  mentions: boolean;
  reactions: boolean;
  projectUpdates: boolean;
  teamInvitations: boolean;
  videoProcessing: boolean;
  weeklyDigest: boolean;
  securityAlerts: boolean;
}

export const BIO_MAX_LENGTH = 500;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 50;

export const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5MB
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Get list of common timezones grouped by region
 */
export function getTimezoneOptions(): { label: string; value: string; region: string }[] {
  const timezones = [
    { value: 'America/New_York', label: 'Eastern Time (US & Canada)', region: 'Americas' },
    { value: 'America/Chicago', label: 'Central Time (US & Canada)', region: 'Americas' },
    { value: 'America/Denver', label: 'Mountain Time (US & Canada)', region: 'Americas' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)', region: 'Americas' },
    { value: 'America/Anchorage', label: 'Alaska', region: 'Americas' },
    { value: 'Pacific/Honolulu', label: 'Hawaii', region: 'Americas' },
    { value: 'America/Toronto', label: 'Eastern Time (Canada)', region: 'Americas' },
    { value: 'America/Sao_Paulo', label: 'Brasilia', region: 'Americas' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', region: 'Americas' },
    { value: 'Europe/London', label: 'London (GMT/BST)', region: 'Europe' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)', region: 'Europe' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)', region: 'Europe' },
    { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)', region: 'Europe' },
    { value: 'Europe/Moscow', label: 'Moscow (MSK)', region: 'Europe' },
    { value: 'Europe/Istanbul', label: 'Istanbul (TRT)', region: 'Europe' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)', region: 'Asia' },
    { value: 'Asia/Kolkata', label: 'Mumbai/Kolkata (IST)', region: 'Asia' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)', region: 'Asia' },
    { value: 'Asia/Shanghai', label: 'Beijing/Shanghai (CST)', region: 'Asia' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)', region: 'Asia' },
    { value: 'Asia/Seoul', label: 'Seoul (KST)', region: 'Asia' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)', region: 'Pacific' },
    { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)', region: 'Pacific' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)', region: 'Pacific' },
  ];
  return timezones;
}

/**
 * Detect user's timezone using the browser's Intl API
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Create default notification preferences with all enabled
 */
export function createDefaultNotificationPreferences(): NotificationPreferences {
  const defaultCategory: NotificationCategorySettings = {
    comments: true,
    mentions: true,
    reactions: true,
    projectUpdates: true,
    teamInvitations: true,
    videoProcessing: true,
    weeklyDigest: true,
    securityAlerts: true,
  };

  return {
    email: { ...defaultCategory, reactions: false, weeklyDigest: true },
    push: { ...defaultCategory, weeklyDigest: false },
    inApp: { ...defaultCategory },
  };
}

/**
 * Validate avatar file before upload
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" not supported. Use JPEG, PNG, GIF, or WebP.`,
    };
  }
  if (file.size > AVATAR_MAX_SIZE) {
    return {
      valid: false,
      error: `File size exceeds 5MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
    };
  }
  return { valid: true };
}

/**
 * Profile form validation schema
 */
export function createProfileValidator(): FormValidator {
  return new FormValidator({
    displayName: [
      ValidationRules.required('Display name is required'),
      ValidationRules.minLength(DISPLAY_NAME_MIN_LENGTH, `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters`),
      ValidationRules.maxLength(DISPLAY_NAME_MAX_LENGTH, `Display name must be no more than ${DISPLAY_NAME_MAX_LENGTH} characters`),
    ],
    bio: [
      ValidationRules.maxLength(BIO_MAX_LENGTH, `Bio must be no more than ${BIO_MAX_LENGTH} characters`),
    ],
  });
}

export class ProfileSettingsPage {
  private element: HTMLElement;
  private profileData: ProfileData;
  private validator: FormValidator;
  private isDirty = false;
  private isSaving = false;
  private avatarPreviewUrl: string | null = null;
  private pendingAvatarFile: File | null = null;

  constructor(initialData?: Partial<ProfileData>) {
    this.profileData = {
      displayName: initialData?.displayName || '',
      bio: initialData?.bio || '',
      avatarUrl: initialData?.avatarUrl || null,
      timezone: initialData?.timezone || detectTimezone(),
      notificationPreferences: initialData?.notificationPreferences || createDefaultNotificationPreferences(),
    };

    this.validator = createProfileValidator();
    this.element = document.createElement('div');
    this.element.className = 'p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getProfileData(): ProfileData {
    return { ...this.profileData };
  }

  public isDirtyState(): boolean {
    return this.isDirty;
  }

  /**
   * Update profile data externally (e.g., after successful save)
   */
  public updateData(data: Partial<ProfileData>): void {
    this.profileData = { ...this.profileData, ...data };
    this.isDirty = false;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderAvatarSection());
    this.element.appendChild(this.renderProfileForm());
    this.element.appendChild(this.renderTimezoneSection());
    this.element.appendChild(this.renderNotificationPreferences());
    this.element.appendChild(this.renderSaveBar());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mb-8';
    header.innerHTML = `
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your profile information, timezone, and notification preferences.
      </p>
    `;
    return header;
  }
