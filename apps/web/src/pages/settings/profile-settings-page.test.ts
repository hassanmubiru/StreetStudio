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
