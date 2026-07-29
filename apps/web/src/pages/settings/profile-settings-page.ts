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

  private renderNotificationPreferences(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'notifications-heading');

    const categories: { key: keyof NotificationCategorySettings; label: string; description: string }[] = [
      { key: 'comments', label: 'Comments', description: 'When someone comments on your videos' },
      { key: 'mentions', label: 'Mentions', description: 'When someone mentions you in a comment' },
      { key: 'reactions', label: 'Reactions', description: 'When someone reacts to your content' },
      { key: 'projectUpdates', label: 'Project Updates', description: 'Changes to projects you belong to' },
      { key: 'teamInvitations', label: 'Team Invitations', description: 'Invitations to teams or projects' },
      { key: 'videoProcessing', label: 'Video Processing', description: 'When your videos finish processing' },
      { key: 'weeklyDigest', label: 'Weekly Digest', description: 'Weekly summary of activity' },
      { key: 'securityAlerts', label: 'Security Alerts', description: 'Important security notifications' },
    ];

    const channels: { key: keyof NotificationPreferences; label: string }[] = [
      { key: 'email', label: 'Email' },
      { key: 'push', label: 'Push' },
      { key: 'inApp', label: 'In-App' },
    ];

    let tableRows = '';
    for (const category of categories) {
      let cells = '';
      for (const channel of channels) {
        const checked = this.profileData.notificationPreferences[channel.key][category.key] ? 'checked' : '';
        const id = `notif-${channel.key}-${category.key}`;
        cells += `
          <td class="px-3 py-3 text-center">
            <input
              type="checkbox"
              id="${id}"
              data-channel="${channel.key}"
              data-category="${category.key}"
              ${checked}
              class="notification-toggle w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 cursor-pointer"
              aria-label="${category.label} via ${channel.label}"
            />
          </td>
        `;
      }
      tableRows += `
        <tr class="border-t border-gray-200 dark:border-gray-700">
          <td class="px-3 py-3">
            <div class="text-sm font-medium text-gray-900 dark:text-white">${category.label}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${category.description}</div>
          </td>
          ${cells}
        </tr>
      `;
    }

    section.innerHTML = `
      <h2 id="notifications-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Notification Preferences</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Choose how you want to be notified about activity.</p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[400px]" role="grid" aria-label="Notification preferences">
          <thead>
            <tr class="text-left">
              <th class="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Category</th>
              ${channels.map(ch => `<th class="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 text-center">${ch.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
    return section;
  }

  private renderSaveBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 -mx-4 sm:-mx-6 lg:-mx-8 flex items-center justify-between';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Save actions');

    const statusText = this.isSaving ? 'Saving...' : this.isDirty ? 'Unsaved changes' : 'All changes saved';
    const statusClass = this.isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';

    bar.innerHTML = `
      <span id="save-status" class="text-sm ${statusClass}" aria-live="polite">${statusText}</span>
      <div class="flex gap-3">
        <button
          id="discard-changes"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          ${!this.isDirty ? 'disabled' : ''}
        >
          Discard
        </button>
        <button
          id="save-profile"
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          ${!this.isDirty || this.isSaving ? 'disabled' : ''}
        >
          ${this.isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    `;
    return bar;
  }

  private setupEventListeners(): void {
    // Avatar upload
    const avatarInput = this.element.querySelector('#avatar-upload') as HTMLInputElement;
    avatarInput?.addEventListener('change', (e) => this.handleAvatarUpload(e));

    // Remove avatar
    const removeBtn = this.element.querySelector('#remove-avatar');
    removeBtn?.addEventListener('click', () => this.handleRemoveAvatar());

    // Display name input
    const displayNameInput = this.element.querySelector('#display-name') as HTMLInputElement;
    displayNameInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.profileData.displayName = value;
      this.markDirty();
      this.validateDisplayName(value);
    });

    // Bio textarea
    const bioInput = this.element.querySelector('#bio') as HTMLTextAreaElement;
    bioInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      this.profileData.bio = value;
      this.markDirty();
      this.updateBioCounter(value);
    });

    // Timezone select
    const tzSelect = this.element.querySelector('#timezone-select') as HTMLSelectElement;
    tzSelect?.addEventListener('change', (e) => {
      this.profileData.timezone = (e.target as HTMLSelectElement).value;
      this.markDirty();
    });

    // Detect timezone button
    const detectBtn = this.element.querySelector('#detect-timezone');
    detectBtn?.addEventListener('click', () => this.handleDetectTimezone());

    // Notification toggles
    const toggles = this.element.querySelectorAll('.notification-toggle') as NodeListOf<HTMLInputElement>;
    toggles.forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const channel = input.dataset.channel as keyof NotificationPreferences;
        const category = input.dataset.category as keyof NotificationCategorySettings;
        this.profileData.notificationPreferences[channel][category] = input.checked;
        this.markDirty();
      });
    });

    // Save button
    const saveBtn = this.element.querySelector('#save-profile');
    saveBtn?.addEventListener('click', () => this.handleSave());

    // Discard button
    const discardBtn = this.element.querySelector('#discard-changes');
    discardBtn?.addEventListener('click', () => this.handleDiscard());
  }

  private handleAvatarUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const validation = validateAvatarFile(file);
    const errorEl = this.element.querySelector('#avatar-error');

    if (!validation.valid) {
      if (errorEl) errorEl.textContent = validation.error || '';
      input.value = '';
      return;
    }

    if (errorEl) errorEl.textContent = '';

    // Create preview URL
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
    this.avatarPreviewUrl = URL.createObjectURL(file);
    this.pendingAvatarFile = file;
    this.markDirty();

    // Update preview
    const previewContainer = this.element.querySelector('#avatar-preview');
    if (previewContainer) {
      previewContainer.innerHTML = `<img src="${this.avatarPreviewUrl}" alt="Profile avatar preview" class="w-24 h-24 rounded-full object-cover" />`;
    }
  }

  private handleRemoveAvatar(): void {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
      this.avatarPreviewUrl = null;
    }
    this.pendingAvatarFile = null;
    this.profileData.avatarUrl = null;
    this.markDirty();
    this.render();
  }

  private handleDetectTimezone(): void {
    const detected = detectTimezone();
    this.profileData.timezone = detected;
    this.markDirty();

    const tzSelect = this.element.querySelector('#timezone-select') as HTMLSelectElement;
    if (tzSelect) {
      tzSelect.value = detected;
    }
  }

  private async handleSave(): Promise<void> {
    // Validate
    const result = this.validator.validate({
      displayName: this.profileData.displayName,
      bio: this.profileData.bio,
    });

    if (!result.isValid) {
      this.showValidationErrors(result);
      return;
    }

    this.isSaving = true;
    this.updateSaveBar();

    // Dispatch save event for external handling
    this.element.dispatchEvent(new CustomEvent('profile-save', {
      bubbles: true,
      detail: {
        profileData: this.getProfileData(),
        avatarFile: this.pendingAvatarFile,
      },
    }));

    // Simulate save completion for UI (actual save handled by parent)
    setTimeout(() => {
      this.isSaving = false;
      this.isDirty = false;
      this.pendingAvatarFile = null;
      if (this.avatarPreviewUrl) {
        this.profileData.avatarUrl = this.avatarPreviewUrl;
        this.avatarPreviewUrl = null;
      }
      this.updateSaveBar();
    }, 500);
  }

  private handleDiscard(): void {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
      this.avatarPreviewUrl = null;
    }
    this.pendingAvatarFile = null;
    this.isDirty = false;
    this.render();
  }

  private markDirty(): void {
    if (!this.isDirty) {
      this.isDirty = true;
      this.updateSaveBar();
    }
  }

  private updateSaveBar(): void {
    const statusEl = this.element.querySelector('#save-status');
    const saveBtn = this.element.querySelector('#save-profile') as HTMLButtonElement;
    const discardBtn = this.element.querySelector('#discard-changes') as HTMLButtonElement;

    if (statusEl) {
      if (this.isSaving) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'text-sm text-blue-600 dark:text-blue-400';
      } else if (this.isDirty) {
        statusEl.textContent = 'Unsaved changes';
        statusEl.className = 'text-sm text-amber-600 dark:text-amber-400';
      } else {
        statusEl.textContent = 'All changes saved';
        statusEl.className = 'text-sm text-green-600 dark:text-green-400';
      }
    }

    if (saveBtn) {
      saveBtn.disabled = !this.isDirty || this.isSaving;
      saveBtn.textContent = this.isSaving ? 'Saving...' : 'Save Changes';
    }

    if (discardBtn) {
      discardBtn.disabled = !this.isDirty;
    }
  }

  private validateDisplayName(value: string): void {
    const errorEl = this.element.querySelector('#display-name-error');
    if (!errorEl) return;

    const result = this.validator.validateField('displayName', value);
    errorEl.textContent = result.isValid ? '' : (result.firstError || '');
  }

  private updateBioCounter(value: string): void {
    const counter = this.element.querySelector('#bio-counter');
    if (!counter) return;

    const length = value.length;
    counter.textContent = `${length}/${BIO_MAX_LENGTH}`;
    counter.className = length > BIO_MAX_LENGTH
      ? 'text-xs text-red-600 dark:text-red-400'
      : 'text-xs text-gray-500 dark:text-gray-400';
  }

  private showValidationErrors(result: ValidationResult): void {
    for (const [field, errors] of Object.entries(result.errors)) {
      const errorEl = this.element.querySelector(`#${field === 'displayName' ? 'display-name' : field}-error`);
      if (errorEl && errors.length > 0) {
        errorEl.textContent = errors[0];
      }
    }
  }

  private getInitials(): string {
    const name = this.profileData.displayName.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
    this.element.innerHTML = '';
  }
}
