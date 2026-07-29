/**
 * Profile Settings Page Tests
 * 
 * Tests for user profile settings including avatar upload, display name editing,
 * bio editing with character limits, timezone selection, and notification preferences.
 * 
 * Requirements: 9.1, 9.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProfileSettingsPage,
  validateAvatarFile,
  detectTimezone,
  getTimezoneOptions,
  createDefaultNotificationPreferences,
  createProfileValidator,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  AVATAR_MAX_SIZE,
  AVATAR_ALLOWED_TYPES,
  type ProfileData,
  type NotificationPreferences,
} from './profile-settings-page.js';

describe('ProfileSettingsPage', () => {
  let page: ProfileSettingsPage;

  const mockProfileData: ProfileData = {
    displayName: 'Jane Doe',
    bio: 'Software engineer who loves video.',
    avatarUrl: 'https://example.com/avatar.jpg',
    timezone: 'America/New_York',
    notificationPreferences: createDefaultNotificationPreferences(),
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    page?.destroy();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create page element with correct structure', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-main-content')).toBe('');
      expect(el.querySelector('h1')?.textContent).toBe('Profile Settings');
    });

    it('should render with default data when no initial data provided', () => {
      page = new ProfileSettingsPage();
      const el = page.getElement();

      expect(el.querySelector('#display-name')).toBeTruthy();
      expect(el.querySelector('#bio')).toBeTruthy();
      expect(el.querySelector('#timezone-select')).toBeTruthy();
    });

    it('should populate form with initial profile data', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const nameInput = el.querySelector('#display-name') as HTMLInputElement;
      expect(nameInput.value).toBe('Jane Doe');

      const bioArea = el.querySelector('#bio') as HTMLTextAreaElement;
      expect(bioArea.value).toBe('Software engineer who loves video.');

      const tzSelect = el.querySelector('#timezone-select') as HTMLSelectElement;
      expect(tzSelect.value).toBe('America/New_York');
    });

    it('should not be dirty on initial render', () => {
      page = new ProfileSettingsPage(mockProfileData);
      expect(page.isDirtyState()).toBe(false);
    });
  });

  describe('Avatar Section', () => {
    it('should show avatar image when avatarUrl is provided', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const img = el.querySelector('#avatar-preview img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe('https://example.com/avatar.jpg');
    });

    it('should show initials when no avatar URL', () => {
      page = new ProfileSettingsPage({ ...mockProfileData, avatarUrl: null });
      const el = page.getElement();

      const initials = el.querySelector('#avatar-preview');
      expect(initials?.textContent?.trim()).toBe('JD');
    });

    it('should show remove button when avatar exists', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      expect(el.querySelector('#remove-avatar')).toBeTruthy();
    });

    it('should not show remove button when no avatar', () => {
      page = new ProfileSettingsPage({ ...mockProfileData, avatarUrl: null });
      const el = page.getElement();

      expect(el.querySelector('#remove-avatar')).toBeFalsy();
    });

    it('should have file input with correct accept types', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const input = el.querySelector('#avatar-upload') as HTMLInputElement;
      expect(input.getAttribute('accept')).toBe(AVATAR_ALLOWED_TYPES.join(','));
    });

    it('should mark as dirty when avatar is removed', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const removeBtn = el.querySelector('#remove-avatar') as HTMLButtonElement;
      removeBtn.click();

      expect(page.isDirtyState()).toBe(true);
    });
  });

  describe('Display Name Editing', () => {
    it('should update profile data on input', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = 'New Name';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.getProfileData().displayName).toBe('New Name');
    });

    it('should mark as dirty when display name changes', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = 'Changed';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.isDirtyState()).toBe(true);
    });

    it('should show validation error for empty display name', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const error = el.querySelector('#display-name-error');
      expect(error?.textContent).toBeTruthy();
    });

    it('should show validation error for too-short display name', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = 'A';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const error = el.querySelector('#display-name-error');
      expect(error?.textContent).toContain('at least');
    });

    it('should have correct maxlength attribute', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const input = el.querySelector('#display-name') as HTMLInputElement;
      expect(input.getAttribute('maxlength')).toBe(String(DISPLAY_NAME_MAX_LENGTH));
    });
  });

  describe('Bio Editing', () => {
    it('should render bio textarea with correct content', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const bio = el.querySelector('#bio') as HTMLTextAreaElement;
      expect(bio.value).toBe(mockProfileData.bio);
    });

    it('should update character counter on input', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const bio = el.querySelector('#bio') as HTMLTextAreaElement;
      bio.value = 'Hello world';
      bio.dispatchEvent(new Event('input', { bubbles: true }));

      const counter = el.querySelector('#bio-counter');
      expect(counter?.textContent).toBe(`11/${BIO_MAX_LENGTH}`);
    });

    it('should show red counter when bio exceeds max length', () => {
      const longBio = 'x'.repeat(BIO_MAX_LENGTH + 1);
      page = new ProfileSettingsPage({ ...mockProfileData, bio: longBio });
      const el = page.getElement();

      const counter = el.querySelector('#bio-counter');
      expect(counter?.className).toContain('text-red-600');
    });

    it('should have maxlength attribute set', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const bio = el.querySelector('#bio') as HTMLTextAreaElement;
      expect(bio.getAttribute('maxlength')).toBe(String(BIO_MAX_LENGTH));
    });

    it('should mark as dirty when bio changes', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const bio = el.querySelector('#bio') as HTMLTextAreaElement;
      bio.value = 'Updated bio';
      bio.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.isDirtyState()).toBe(true);
      expect(page.getProfileData().bio).toBe('Updated bio');
    });
  });

  describe('Timezone Selection', () => {
    it('should render timezone select with correct value', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const select = el.querySelector('#timezone-select') as HTMLSelectElement;
      expect(select.value).toBe('America/New_York');
    });

    it('should group timezones by region', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const optgroups = el.querySelectorAll('#timezone-select optgroup');
      expect(optgroups.length).toBeGreaterThan(0);

      const labels = Array.from(optgroups).map(og => og.getAttribute('label'));
      expect(labels).toContain('Americas');
      expect(labels).toContain('Europe');
      expect(labels).toContain('Asia');
    });

    it('should update timezone on selection change', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const select = el.querySelector('#timezone-select') as HTMLSelectElement;
      select.value = 'Europe/London';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getProfileData().timezone).toBe('Europe/London');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should detect timezone on button click', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const detectBtn = el.querySelector('#detect-timezone') as HTMLButtonElement;
      detectBtn.click();

      // detectTimezone returns the Intl result - in test env it should be 'UTC' or detected
      const detected = detectTimezone();
      expect(page.getProfileData().timezone).toBe(detected);
    });

    it('should have detect timezone button with accessible label', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const detectBtn = el.querySelector('#detect-timezone');
      expect(detectBtn?.getAttribute('aria-label')).toBe('Automatically detect my timezone');
    });
  });

  describe('Notification Preferences', () => {
    it('should render notification table with all categories', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const toggles = el.querySelectorAll('.notification-toggle');
      // 8 categories * 3 channels = 24 toggles
      expect(toggles.length).toBe(24);
    });

    it('should render channel headers', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const headers = el.querySelectorAll('table th');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
      expect(headerTexts).toContain('Email');
      expect(headerTexts).toContain('Push');
      expect(headerTexts).toContain('In-App');
    });

    it('should reflect initial preference state in checkboxes', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const emailComments = el.querySelector('#notif-email-comments') as HTMLInputElement;
      expect(emailComments.checked).toBe(mockProfileData.notificationPreferences.email.comments);

      // reactions is false for email in default preferences
      const emailReactions = el.querySelector('#notif-email-reactions') as HTMLInputElement;
      expect(emailReactions.checked).toBe(mockProfileData.notificationPreferences.email.reactions);
    });

    it('should update notification preferences on toggle', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#notif-push-comments') as HTMLInputElement;
      const wasChecked = toggle.checked;
      toggle.checked = !wasChecked;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getProfileData().notificationPreferences.push.comments).toBe(!wasChecked);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should have accessible labels on toggles', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const toggle = el.querySelector('#notif-email-comments') as HTMLInputElement;
      expect(toggle.getAttribute('aria-label')).toBe('Comments via Email');
    });
  });

  describe('Save and Discard', () => {
    it('should disable save button when not dirty', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const saveBtn = el.querySelector('#save-profile') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable save button when dirty', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = 'Changed';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const saveBtn = el.querySelector('#save-profile') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    it('should dispatch profile-save event on save', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      const saveSpy = vi.fn();
      el.addEventListener('profile-save', saveSpy);

      // Make dirty first
      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = 'Updated Name';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const saveBtn = el.querySelector('#save-profile') as HTMLButtonElement;
      saveBtn.click();

      expect(saveSpy).toHaveBeenCalled();
      const detail = saveSpy.mock.calls[0][0].detail;
      expect(detail.profileData.displayName).toBe('Updated Name');
    });

    it('should reset dirty state on discard', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();
      document.body.appendChild(el);

      // Make dirty
      const input = el.querySelector('#display-name') as HTMLInputElement;
      input.value = 'Changed';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(page.isDirtyState()).toBe(true);

      // Discard
      const discardBtn = el.querySelector('#discard-changes') as HTMLButtonElement;
      discardBtn.click();

      expect(page.isDirtyState()).toBe(false);
    });

    it('should show status messages', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const status = el.querySelector('#save-status');
      expect(status?.textContent).toBe('All changes saved');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const h1 = el.querySelector('h1');
      expect(h1).toBeTruthy();

      const h2s = el.querySelectorAll('h2');
      expect(h2s.length).toBeGreaterThanOrEqual(4); // Avatar, Profile Info, Timezone, Notifications
    });

    it('should have aria-labelledby on sections', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const sections = el.querySelectorAll('section[aria-labelledby]');
      expect(sections.length).toBe(4);
    });

    it('should have aria-describedby on form fields', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const nameInput = el.querySelector('#display-name') as HTMLInputElement;
      expect(nameInput.getAttribute('aria-describedby')).toBe('display-name-help');

      const bioArea = el.querySelector('#bio') as HTMLTextAreaElement;
      expect(bioArea.getAttribute('aria-describedby')).toContain('bio-help');
    });

    it('should have role=alert on error containers', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const errors = el.querySelectorAll('[role="alert"]');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should have accessible notification table', () => {
      page = new ProfileSettingsPage(mockProfileData);
      const el = page.getElement();

      const table = el.querySelector('table');
      expect(table?.getAttribute('role')).toBe('grid');
      expect(table?.getAttribute('aria-label')).toBe('Notification preferences');
    });
  });
});
