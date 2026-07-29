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

  private renderAvatarSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'avatar-heading');

    const displayUrl = this.avatarPreviewUrl || this.profileData.avatarUrl;
    const avatarContent = displayUrl
      ? `<img src="${displayUrl}" alt="Profile avatar" class="w-24 h-24 rounded-full object-cover" />`
      : `<div class="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
           <span class="text-2xl font-bold text-blue-600 dark:text-blue-300">${this.getInitials()}</span>
         </div>`;

    section.innerHTML = `
      <h2 id="avatar-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Avatar</h2>
      <div class="flex items-center gap-6">
        <div id="avatar-preview" class="flex-shrink-0">
          ${avatarContent}
        </div>
        <div>
          <label for="avatar-upload" class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 transition-colors">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            Upload Photo
            <input id="avatar-upload" type="file" class="sr-only" accept="${AVATAR_ALLOWED_TYPES.join(',')}" aria-describedby="avatar-help" />
          </label>
          ${displayUrl ? '<button id="remove-avatar" class="ml-3 text-sm text-red-600 dark:text-red-400 hover:text-red-500 transition-colors">Remove</button>' : ''}
          <p id="avatar-help" class="mt-2 text-xs text-gray-500 dark:text-gray-400">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
          <div id="avatar-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
      </div>
    `;
    return section;
  }

  private renderProfileForm(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'profile-heading');

    const bioLength = this.profileData.bio.length;
    const bioCountClass = bioLength > BIO_MAX_LENGTH ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';

    section.innerHTML = `
      <h2 id="profile-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Profile Information</h2>
      <div class="space-y-6">
        <div>
          <label for="display-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Display Name <span class="text-red-500">*</span>
          </label>
          <input
            id="display-name"
            type="text"
            name="displayName"
            value="${this.escapeHtml(this.profileData.displayName)}"
            minlength="${DISPLAY_NAME_MIN_LENGTH}"
            maxlength="${DISPLAY_NAME_MAX_LENGTH}"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            aria-describedby="display-name-help"
          />
          <p id="display-name-help" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters. This is how others see you.
          </p>
          <div id="display-name-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>

        <div>
          <label for="bio" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
          <textarea
            id="bio"
            name="bio"
            rows="4"
            maxlength="${BIO_MAX_LENGTH}"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y transition-colors"
            aria-describedby="bio-help bio-counter"
            placeholder="Tell others a bit about yourself..."
          >${this.escapeHtml(this.profileData.bio)}</textarea>
          <div class="flex justify-between mt-1">
            <p id="bio-help" class="text-xs text-gray-500 dark:text-gray-400">Supports plain text.</p>
            <span id="bio-counter" class="text-xs ${bioCountClass}" aria-live="polite" aria-atomic="true">
              ${bioLength}/${BIO_MAX_LENGTH}
            </span>
          </div>
          <div id="bio-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
      </div>
    `;
    return section;
  }

  private renderTimezoneSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'timezone-heading');

    const timezones = getTimezoneOptions();
    const detectedTz = detectTimezone();
    const regions = [...new Set(timezones.map(tz => tz.region))];

    let optionsHtml = '';
    for (const region of regions) {
      const regionTimezones = timezones.filter(tz => tz.region === region);
      optionsHtml += `<optgroup label="${region}">`;
      for (const tz of regionTimezones) {
        const selected = tz.value === this.profileData.timezone ? 'selected' : '';
        optionsHtml += `<option value="${tz.value}" ${selected}>${tz.label}</option>`;
      }
      optionsHtml += '</optgroup>';
    }

    section.innerHTML = `
      <h2 id="timezone-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Timezone</h2>
      <div class="space-y-4">
        <div>
          <label for="timezone-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Your Timezone
          </label>
          <select
            id="timezone-select"
            name="timezone"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            aria-describedby="timezone-help"
          >
            ${optionsHtml}
          </select>
          <p id="timezone-help" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Used for scheduling and displaying times.
          </p>
        </div>
        <button
          id="detect-timezone"
          type="button"
          class="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Automatically detect my timezone"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Detect automatically${detectedTz !== this.profileData.timezone ? ` (${detectedTz})` : ''}
        </button>
      </div>
    `;
    return section;
  }
