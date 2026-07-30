/**
 * Privacy and Data Management Settings Page Tests
 * 
 * Tests for profile visibility controls, data export with progress tracking,
 * data deletion with multi-step confirmation, and activity sharing preferences.
 * 
 * Requirements: 9.5, 9.9
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PrivacySettingsPage,
  createDefaultPrivacySettings,
  createDefaultActivitySharing,
  createDefaultExportState,
  createDefaultDeletionState,
  loadPrivacySettings,
  savePrivacySettings,
  formatSeconds,
  PRIVACY_STORAGE_KEY,
  DELETION_CONFIRMATION_TEXT,
  VISIBILITY_OPTIONS,
  type PrivacySettings,
  type ProfileVisibility,
  type DataExportState,
  type DataDeletionState,
} from './privacy-settings-page.js';

describe('PrivacySettingsPage', () => {
  let page: PrivacySettingsPage;

  const mockSettings: PrivacySettings = {
    profileVisibility: 'organization',
    activitySharing: createDefaultActivitySharing(),
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    page?.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create page element with correct structure', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-main-content')).toBe('');
      expect(el.getAttribute('data-testid')).toBe('privacy-settings');
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Privacy & Data Management');
    });

    it('should render all settings sections', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      expect(el.querySelector('#visibility-heading')).toBeTruthy();
      expect(el.querySelector('#activity-sharing-heading')).toBeTruthy();
      expect(el.querySelector('#data-export-heading')).toBeTruthy();
      expect(el.querySelector('#data-deletion-heading')).toBeTruthy();
    });

    it('should not be dirty on initial render', () => {
      page = new PrivacySettingsPage(mockSettings);
      expect(page.isDirtyState()).toBe(false);
    });

    it('should return current settings', () => {
      page = new PrivacySettingsPage(mockSettings);
      const settings = page.getSettings();
      expect(settings.profileVisibility).toBe('organization');
      expect(settings.activitySharing.showOnlineStatus).toBe(true);
    });

    it('should load from localStorage when no initial settings provided', () => {
      const stored: PrivacySettings = {
        profileVisibility: 'private',
        activitySharing: { ...createDefaultActivitySharing(), showOnlineStatus: false },
      };
      localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(stored));

      page = new PrivacySettingsPage();
      const settings = page.getSettings();
      expect(settings.profileVisibility).toBe('private');
      expect(settings.activitySharing.showOnlineStatus).toBe(false);
    });
  });

  describe('Profile Visibility', () => {
    it('should render three visibility options', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const cards = el.querySelectorAll('[data-visibility-value]');
      expect(cards.length).toBe(3);
    });

    it('should mark organization as selected by default', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const orgCard = el.querySelector('[data-visibility-value="organization"]');
      expect(orgCard?.getAttribute('aria-checked')).toBe('true');
    });

    it('should select public visibility on click', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const publicCard = el.querySelector('[data-visibility-value="public"]') as HTMLElement;
      publicCard.click();

      expect(page.getSettings().profileVisibility).toBe('public');
      expect(publicCard.getAttribute('aria-checked')).toBe('true');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should select private visibility on click', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const privateCard = el.querySelector('[data-visibility-value="private"]') as HTMLElement;
      privateCard.click();

      expect(page.getSettings().profileVisibility).toBe('private');
    });

    it('should support keyboard activation with Enter', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const publicCard = el.querySelector('[data-visibility-value="public"]') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      publicCard.dispatchEvent(event);

      expect(page.getSettings().profileVisibility).toBe('public');
    });

    it('should support keyboard activation with Space', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const privateCard = el.querySelector('[data-visibility-value="private"]') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      privateCard.dispatchEvent(event);

      expect(page.getSettings().profileVisibility).toBe('private');
    });

    it('should have radiogroup role on visibility container', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const group = el.querySelector('#visibility-group');
      expect(group?.getAttribute('role')).toBe('radiogroup');
    });

    it('should update aria-checked when selection changes', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const publicCard = el.querySelector('[data-visibility-value="public"]') as HTMLElement;
      const orgCard = el.querySelector('[data-visibility-value="organization"]') as HTMLElement;

      publicCard.click();

      expect(publicCard.getAttribute('aria-checked')).toBe('true');
      expect(orgCard.getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('Activity Sharing Preferences', () => {
    it('should render all activity sharing toggles', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      expect(el.querySelector('#show-online-status')).toBeTruthy();
      expect(el.querySelector('#show-recent-activity')).toBeTruthy();
      expect(el.querySelector('#show-video-history')).toBeTruthy();
      expect(el.querySelector('#show-project-membership')).toBeTruthy();
      expect(el.querySelector('#allow-activity-feed')).toBeTruthy();
    });

    it('should reflect initial preferences in checkboxes', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const onlineToggle = el.querySelector('#show-online-status') as HTMLInputElement;
      expect(onlineToggle.checked).toBe(true);
    });

    it('should update showOnlineStatus on toggle', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#show-online-status') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().activitySharing.showOnlineStatus).toBe(false);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should update showRecentActivity on toggle', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#show-recent-activity') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().activitySharing.showRecentActivity).toBe(false);
    });

    it('should update showVideoHistory on toggle', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#show-video-history') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().activitySharing.showVideoHistory).toBe(false);
    });

    it('should update showProjectMembership on toggle', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#show-project-membership') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().activitySharing.showProjectMembership).toBe(false);
    });

    it('should update allowActivityFeed on toggle', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#allow-activity-feed') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().activitySharing.allowActivityFeed).toBe(false);
    });

    it('should show disabled state when initialized with false values', () => {
      const settings: PrivacySettings = {
        ...mockSettings,
        activitySharing: {
          showOnlineStatus: false,
          showRecentActivity: false,
          showVideoHistory: false,
          showProjectMembership: true,
          allowActivityFeed: true,
        },
      };
      page = new PrivacySettingsPage(settings);
      const el = page.getElement();

      const onlineToggle = el.querySelector('#show-online-status') as HTMLInputElement;
      expect(onlineToggle.checked).toBe(false);

      const recentToggle = el.querySelector('#show-recent-activity') as HTMLInputElement;
      expect(recentToggle.checked).toBe(false);
    });
  });

  describe('Data Export', () => {
    it('should show idle state initially', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      expect(el.querySelector('#start-export-btn')).toBeTruthy();
      expect(page.getExportState().status).toBe('idle');
    });

    it('should start export on button click', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const startBtn = el.querySelector('#start-export-btn') as HTMLButtonElement;
      startBtn.click();

      expect(page.getExportState().status).toBe('preparing');
      expect(page.getExportState().progress).toBe(0);
    });

    it('should dispatch privacy-export-start event', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const spy = vi.fn();
      el.addEventListener('privacy-export-start', spy);

      const startBtn = el.querySelector('#start-export-btn') as HTMLButtonElement;
      startBtn.click();

      expect(spy).toHaveBeenCalled();
    });

    it('should show progress bar during export', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const startBtn = el.querySelector('#start-export-btn') as HTMLButtonElement;
      startBtn.click();

      const progressbar = el.querySelector('[role="progressbar"]');
      expect(progressbar).toBeTruthy();
      expect(progressbar?.getAttribute('aria-valuemin')).toBe('0');
      expect(progressbar?.getAttribute('aria-valuemax')).toBe('100');
    });

    it('should show cancel button during export', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const startBtn = el.querySelector('#start-export-btn') as HTMLButtonElement;
      startBtn.click();

      expect(el.querySelector('#cancel-export-btn')).toBeTruthy();
    });

    it('should cancel export and return to idle', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      page.startExport();
      page.cancelExport();

      expect(page.getExportState().status).toBe('idle');
      expect(el.querySelector('#start-export-btn')).toBeTruthy();
    });

    it('should update export state programmatically', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      page.updateExportState({ status: 'completed', progress: 100, downloadUrl: '/download' });

      expect(page.getExportState().status).toBe('completed');
      expect(el.querySelector('#download-export-btn')).toBeTruthy();
    });

    it('should show download button when export is completed', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      page.updateExportState({ status: 'completed', progress: 100, downloadUrl: '/download' });

      expect(el.querySelector('#download-export-btn')).toBeTruthy();
      expect(el.querySelector('#new-export-btn')).toBeTruthy();
    });

    it('should show error state with retry button on failure', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      page.updateExportState({ status: 'failed', error: 'Server timeout' });

      expect(page.getExportState().status).toBe('failed');
      expect(el.querySelector('#retry-export-btn')).toBeTruthy();
    });

    it('should dispatch download event', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      page.updateExportState({ status: 'completed', progress: 100, downloadUrl: '/download' });

      const spy = vi.fn();
      el.addEventListener('privacy-export-download', spy);

      const downloadBtn = el.querySelector('#download-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]![0].detail.downloadUrl).toBe('/download');
    });
  });

  describe('Data Deletion', () => {
    it('should show initial state with delete button', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      expect(el.querySelector('#begin-deletion-btn')).toBeTruthy();
      expect(page.getDeletionState().step).toBe('initial');
    });

    it('should advance to confirm step on delete button click', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const beginBtn = el.querySelector('#begin-deletion-btn') as HTMLButtonElement;
      beginBtn.click();

      expect(page.getDeletionState().step).toBe('confirm');
      expect(el.querySelector('#confirm-deletion-btn')).toBeTruthy();
      expect(el.querySelector('#cancel-deletion-btn')).toBeTruthy();
    });

    it('should show what will be deleted in confirm step', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const beginBtn = el.querySelector('#begin-deletion-btn') as HTMLButtonElement;
      beginBtn.click();

      const content = el.querySelector('#deletion-container')?.textContent || '';
      expect(content).toContain('profile and account information');
      expect(content).toContain('videos and recordings');
      expect(content).toContain('comments and reactions');
    });

    it('should advance to verify step on confirm', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      // Go to confirm
      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      // Go to verify
      (el.querySelector('#confirm-deletion-btn') as HTMLButtonElement).click();

      expect(page.getDeletionState().step).toBe('verify');
      expect(el.querySelector('#deletion-confirm-input')).toBeTruthy();
      expect(el.querySelector('#execute-deletion-btn')).toBeTruthy();
    });

    it('should show error when confirmation text is wrong', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      // Advance to verify step
      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#confirm-deletion-btn') as HTMLButtonElement).click();

      // Type wrong text
      const input = el.querySelector('#deletion-confirm-input') as HTMLInputElement;
      input.value = 'WRONG TEXT';

      // Try to execute
      (el.querySelector('#execute-deletion-btn') as HTMLButtonElement).click();

      expect(page.getDeletionState().step).toBe('verify');
      const errorEl = el.querySelector('#deletion-verify-error');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.textContent).toContain(DELETION_CONFIRMATION_TEXT);
    });

    it('should execute deletion when confirmation text matches', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      // Advance to verify step
      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#confirm-deletion-btn') as HTMLButtonElement).click();

      // Type correct text
      const input = el.querySelector('#deletion-confirm-input') as HTMLInputElement;
      input.value = DELETION_CONFIRMATION_TEXT;

      // Execute
      (el.querySelector('#execute-deletion-btn') as HTMLButtonElement).click();

      expect(page.getDeletionState().isProcessing).toBe(true);
    });

    it('should show completion state after deletion processing', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      // Go through all steps
      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#confirm-deletion-btn') as HTMLButtonElement).click();

      const input = el.querySelector('#deletion-confirm-input') as HTMLInputElement;
      input.value = DELETION_CONFIRMATION_TEXT;
      (el.querySelector('#execute-deletion-btn') as HTMLButtonElement).click();

      // Advance timer
      vi.advanceTimersByTime(2000);

      expect(page.getDeletionState().step).toBe('complete');
      const content = el.querySelector('#deletion-container')?.textContent || '';
      expect(content).toContain('deletion request has been submitted');
    });

    it('should reset to initial on cancel from confirm step', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#cancel-deletion-btn') as HTMLButtonElement).click();

      expect(page.getDeletionState().step).toBe('initial');
      expect(el.querySelector('#begin-deletion-btn')).toBeTruthy();
    });

    it('should reset to initial on cancel from verify step', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#confirm-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#cancel-deletion-btn') as HTMLButtonElement).click();

      expect(page.getDeletionState().step).toBe('initial');
    });

    it('should dispatch privacy-deletion-execute event', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const spy = vi.fn();
      el.addEventListener('privacy-deletion-execute', spy);

      // Go through all steps
      (el.querySelector('#begin-deletion-btn') as HTMLButtonElement).click();
      (el.querySelector('#confirm-deletion-btn') as HTMLButtonElement).click();

      const input = el.querySelector('#deletion-confirm-input') as HTMLInputElement;
      input.value = DELETION_CONFIRMATION_TEXT;
      (el.querySelector('#execute-deletion-btn') as HTMLButtonElement).click();

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]![0].detail.confirmed).toBe(true);
    });
  });

  describe('Save and Discard', () => {
    it('should disable save button when not dirty', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const saveBtn = el.querySelector('#privacy-save-settings') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable save button when dirty', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#show-online-status') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      const saveBtn = el.querySelector('#privacy-save-settings') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    it('should save settings to localStorage on save', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      // Make a change
      const publicCard = el.querySelector('[data-visibility-value="public"]') as HTMLElement;
      publicCard.click();

      // Save
      const saveBtn = el.querySelector('#privacy-save-settings') as HTMLButtonElement;
      saveBtn.click();
      vi.advanceTimersByTime(500);

      const stored = localStorage.getItem(PRIVACY_STORAGE_KEY);
      expect(stored).toBeTruthy();
      expect(stored).toContain('"profileVisibility":"public"');
    });

    it('should dispatch privacy-settings-save event on save', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const saveSpy = vi.fn();
      el.addEventListener('privacy-settings-save', saveSpy);

      // Make a change
      const toggle = el.querySelector('#show-online-status') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));

      // Save
      const saveBtn = el.querySelector('#privacy-save-settings') as HTMLButtonElement;
      saveBtn.click();

      expect(saveSpy).toHaveBeenCalled();
      expect(saveSpy.mock.calls[0]![0].detail.settings.activitySharing.showOnlineStatus).toBe(false);
    });

    it('should reset dirty state after save completes', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const publicCard = el.querySelector('[data-visibility-value="public"]') as HTMLElement;
      publicCard.click();
      expect(page.isDirtyState()).toBe(true);

      const saveBtn = el.querySelector('#privacy-save-settings') as HTMLButtonElement;
      saveBtn.click();
      vi.advanceTimersByTime(500);

      expect(page.isDirtyState()).toBe(false);
    });

    it('should reset dirty state on discard', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      const toggle = el.querySelector('#show-online-status') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      expect(page.isDirtyState()).toBe(true);

      const discardBtn = el.querySelector('#privacy-discard-changes') as HTMLButtonElement;
      discardBtn.click();

      expect(page.isDirtyState()).toBe(false);
    });

    it('should show save status messages', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const status = el.querySelector('#privacy-save-status');
      expect(status?.textContent).toBe('All changes saved');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const h1 = el.querySelector('h1');
      expect(h1).toBeTruthy();

      const h2s = el.querySelectorAll('h2');
      expect(h2s.length).toBe(4); // Visibility, Activity Sharing, Export, Deletion
    });

    it('should have aria-labelledby on sections', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const sections = el.querySelectorAll('section[aria-labelledby]');
      expect(sections.length).toBe(4);
    });

    it('should have radio role on visibility cards', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const cards = el.querySelectorAll('[role="radio"]');
      expect(cards.length).toBe(3);
    });

    it('should have toolbar role on save bar', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const toolbar = el.querySelector('[role="toolbar"]');
      expect(toolbar).toBeTruthy();
      expect(toolbar?.getAttribute('aria-label')).toBe('Save actions');
    });

    it('should have live region for status updates', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();

      const status = el.querySelector('#privacy-save-status');
      expect(status?.getAttribute('aria-live')).toBe('polite');
    });

    it('should have progressbar role during export', () => {
      page = new PrivacySettingsPage(mockSettings);
      const el = page.getElement();
      document.body.appendChild(el);

      page.startExport();
      const progressbar = el.querySelector('[role="progressbar"]');
      expect(progressbar).toBeTruthy();
      expect(progressbar?.getAttribute('aria-label')).toBe('Data export progress');
    });
  });
});

describe('createDefaultPrivacySettings', () => {
  it('should return organization visibility by default', () => {
    const settings = createDefaultPrivacySettings();
    expect(settings.profileVisibility).toBe('organization');
  });

  it('should have all activity sharing enabled by default', () => {
    const settings = createDefaultPrivacySettings();
    expect(settings.activitySharing.showOnlineStatus).toBe(true);
    expect(settings.activitySharing.showRecentActivity).toBe(true);
    expect(settings.activitySharing.showVideoHistory).toBe(true);
    expect(settings.activitySharing.showProjectMembership).toBe(true);
    expect(settings.activitySharing.allowActivityFeed).toBe(true);
  });
});

describe('loadPrivacySettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return defaults when nothing stored', () => {
    const settings = loadPrivacySettings();
    expect(settings.profileVisibility).toBe('organization');
  });

  it('should parse stored settings', () => {
    const stored: PrivacySettings = {
      profileVisibility: 'private',
      activitySharing: { ...createDefaultActivitySharing(), showOnlineStatus: false },
    };
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(stored));
    const settings = loadPrivacySettings();
    expect(settings.profileVisibility).toBe('private');
    expect(settings.activitySharing.showOnlineStatus).toBe(false);
  });

  it('should handle invalid JSON gracefully', () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, 'invalid json{');
    const settings = loadPrivacySettings();
    expect(settings.profileVisibility).toBe('organization');
  });
});

describe('savePrivacySettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save settings to localStorage', () => {
    const settings = createDefaultPrivacySettings();
    settings.profileVisibility = 'public';
    savePrivacySettings(settings);

    const stored = localStorage.getItem(PRIVACY_STORAGE_KEY);
    expect(stored).toBe(JSON.stringify(settings));
  });
});

describe('formatSeconds', () => {
  it('should format seconds below 60', () => {
    expect(formatSeconds(30)).toBe('30 seconds');
    expect(formatSeconds(1)).toBe('1 seconds');
  });

  it('should format minutes', () => {
    expect(formatSeconds(60)).toBe('1 minute');
    expect(formatSeconds(120)).toBe('2 minutes');
  });

  it('should format minutes with remaining seconds', () => {
    expect(formatSeconds(90)).toBe('1m 30s');
    expect(formatSeconds(150)).toBe('2m 30s');
  });
});

describe('VISIBILITY_OPTIONS', () => {
  it('should have three options', () => {
    expect(VISIBILITY_OPTIONS.length).toBe(3);
  });

  it('should include public, organization, and private', () => {
    const values = VISIBILITY_OPTIONS.map(o => o.value);
    expect(values).toContain('public');
    expect(values).toContain('organization');
    expect(values).toContain('private');
  });

  it('should have labels and descriptions for each option', () => {
    for (const opt of VISIBILITY_OPTIONS) {
      expect(opt.label).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });
});
