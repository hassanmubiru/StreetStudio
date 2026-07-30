/**
 * Unit Tests: GDPR Compliance Service
 *
 * Tests cookie consent management, data export/deletion requests,
 * and privacy preference controls.
 *
 * Validates: Requirements 9.5
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GdprComplianceService, type GdprComplianceConfig } from './gdpr-compliance.js';

describe('GdprComplianceService', () => {
  let gdpr: GdprComplianceService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const defaultConfig: GdprComplianceConfig = {
    apiEndpoint: '/api/privacy',
    consentVersion: '1.0',
  };

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'req-123' }),
    });
    global.fetch = fetchMock;
    localStorage.clear();
    gdpr = new GdprComplianceService(defaultConfig);
  });

  afterEach(() => {
    gdpr.destroy();
    vi.restoreAllMocks();
  });

  describe('Cookie Consent', () => {
    describe('shouldShowBanner', () => {
      it('returns true when no consent has been given', () => {
        expect(gdpr.shouldShowBanner()).toBe(true);
      });

      it('returns false after consent is given', () => {
        gdpr.acceptAll();
        expect(gdpr.shouldShowBanner()).toBe(false);
      });

      it('returns true when consent version changes', () => {
        gdpr.acceptAll();
        const newGdpr = new GdprComplianceService({ ...defaultConfig, consentVersion: '2.0' });
        expect(newGdpr.shouldShowBanner()).toBe(true);
        newGdpr.destroy();
      });

      it('returns false when consent version matches stored version', () => {
        gdpr.acceptAll();
        const sameGdpr = new GdprComplianceService(defaultConfig);
        expect(sameGdpr.shouldShowBanner()).toBe(false);
        sameGdpr.destroy();
      });
    });

    describe('hasConsent', () => {
      it('always returns true for necessary category', () => {
        expect(gdpr.hasConsent('necessary')).toBe(true);
      });

      it('returns false for optional categories before consent', () => {
        expect(gdpr.hasConsent('analytics')).toBe(false);
        expect(gdpr.hasConsent('marketing')).toBe(false);
        expect(gdpr.hasConsent('preferences')).toBe(false);
      });

      it('returns true for all categories after acceptAll', () => {
        gdpr.acceptAll();
        expect(gdpr.hasConsent('analytics')).toBe(true);
        expect(gdpr.hasConsent('marketing')).toBe(true);
        expect(gdpr.hasConsent('preferences')).toBe(true);
      });

      it('returns false for optional categories after rejectAll', () => {
        gdpr.rejectAll();
        expect(gdpr.hasConsent('necessary')).toBe(true);
        expect(gdpr.hasConsent('analytics')).toBe(false);
        expect(gdpr.hasConsent('marketing')).toBe(false);
        expect(gdpr.hasConsent('preferences')).toBe(false);
      });
    });

    describe('acceptAll', () => {
      it('grants all consent categories', () => {
        const prefs = gdpr.acceptAll();
        expect(prefs.necessary).toBe('granted');
        expect(prefs.analytics).toBe('granted');
        expect(prefs.marketing).toBe('granted');
        expect(prefs.preferences).toBe('granted');
      });

      it('includes timestamp and version', () => {
        const prefs = gdpr.acceptAll();
        expect(prefs.timestamp).toBeTruthy();
        expect(prefs.version).toBe('1.0');
      });

      it('persists consent to localStorage', () => {
        gdpr.acceptAll();
        const stored = localStorage.getItem('streetstudio_cookie_consent');
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored!);
        expect(parsed.analytics).toBe('granted');
      });

      it('calls onConsentChange callback', () => {
        const onChange = vi.fn();
        const callbackGdpr = new GdprComplianceService({ ...defaultConfig, onConsentChange: onChange });
        callbackGdpr.acceptAll();
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ analytics: 'granted' }));
        callbackGdpr.destroy();
      });
    });

    describe('rejectAll', () => {
      it('denies all optional categories', () => {
        const prefs = gdpr.rejectAll();
        expect(prefs.necessary).toBe('granted');
        expect(prefs.analytics).toBe('denied');
        expect(prefs.marketing).toBe('denied');
        expect(prefs.preferences).toBe('denied');
      });

      it('persists rejection to localStorage', () => {
        gdpr.rejectAll();
        const stored = localStorage.getItem('streetstudio_cookie_consent');
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored!);
        expect(parsed.analytics).toBe('denied');
      });
    });

    describe('setCustomConsent', () => {
      it('allows selective consent', () => {
        const prefs = gdpr.setCustomConsent({ analytics: true, marketing: false, preferences: true });
        expect(prefs.analytics).toBe('granted');
        expect(prefs.marketing).toBe('denied');
        expect(prefs.preferences).toBe('granted');
      });

      it('defaults missing categories to denied', () => {
        const prefs = gdpr.setCustomConsent({ analytics: true });
        expect(prefs.marketing).toBe('denied');
        expect(prefs.preferences).toBe('denied');
      });
    });

    describe('getConsentPreferences', () => {
      it('returns null before consent is given', () => {
        expect(gdpr.getConsentPreferences()).toBeNull();
      });

      it('returns current preferences after consent', () => {
        gdpr.acceptAll();
        const prefs = gdpr.getConsentPreferences();
        expect(prefs).not.toBeNull();
        expect(prefs!.analytics).toBe('granted');
      });

      it('returns a copy, not a reference', () => {
        gdpr.acceptAll();
        const prefs = gdpr.getConsentPreferences();
        (prefs as any).analytics = 'denied';
        expect(gdpr.getConsentPreferences()!.analytics).toBe('granted');
      });
    });

    describe('withdrawConsent', () => {
      it('clears stored consent', () => {
        gdpr.acceptAll();
        gdpr.withdrawConsent();
        expect(gdpr.getConsentPreferences()).toBeNull();
        expect(localStorage.getItem('streetstudio_cookie_consent')).toBeNull();
      });

      it('causes shouldShowBanner to return true', () => {
        gdpr.acceptAll();
        gdpr.withdrawConsent();
        expect(gdpr.shouldShowBanner()).toBe(true);
      });
    });
  });

  describe('Consent Banner', () => {
    it('renders a banner element with correct role', () => {
      const banner = gdpr.renderConsentBanner();
      expect(banner.getAttribute('role')).toBe('dialog');
      expect(banner.getAttribute('aria-label')).toBe('Cookie consent');
    });

    it('renders accept, reject, and customize buttons', () => {
      const banner = gdpr.renderConsentBanner();
      expect(banner.querySelector('#btn-consent-accept')).not.toBeNull();
      expect(banner.querySelector('#btn-consent-reject')).not.toBeNull();
      expect(banner.querySelector('#btn-consent-customize')).not.toBeNull();
    });

    it('accept button grants all consent', () => {
      const banner = gdpr.renderConsentBanner();
      const acceptBtn = banner.querySelector('#btn-consent-accept') as HTMLButtonElement;
      acceptBtn.click();
      expect(gdpr.hasConsent('analytics')).toBe(true);
      expect(gdpr.hasConsent('marketing')).toBe(true);
    });

    it('reject button denies optional consent', () => {
      const banner = gdpr.renderConsentBanner();
      const rejectBtn = banner.querySelector('#btn-consent-reject') as HTMLButtonElement;
      rejectBtn.click();
      expect(gdpr.hasConsent('analytics')).toBe(false);
      expect(gdpr.hasConsent('marketing')).toBe(false);
    });

    it('customize button toggles details section', () => {
      const banner = gdpr.renderConsentBanner();
      const customizeBtn = banner.querySelector('#btn-consent-customize') as HTMLButtonElement;
      const details = banner.querySelector('#consent-details') as HTMLElement;

      expect(details.classList.contains('hidden')).toBe(true);
      customizeBtn.click();
      expect(details.classList.contains('hidden')).toBe(false);
    });

    it('hideBanner removes the banner from DOM', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      gdpr.renderConsentBanner(container);
      expect(container.querySelector('#cookie-consent-banner')).not.toBeNull();

      gdpr.hideBanner();
      expect(container.querySelector('#cookie-consent-banner')).toBeNull();
      document.body.removeChild(container);
    });
  });

  describe('Data Requests', () => {
    describe('requestDataExport', () => {
      it('submits a data export request to the API', async () => {
        await gdpr.requestDataExport();
        expect(fetchMock).toHaveBeenCalledWith('/api/privacy/data-requests', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ type: 'export' }),
        }));
      });

      it('returns a data request object', async () => {
        const request = await gdpr.requestDataExport();
        expect(request.type).toBe('export');
        expect(request.status).toBe('processing');
        expect(request.requestedAt).toBeTruthy();
      });

      it('handles API failure gracefully', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network error'));
        const request = await gdpr.requestDataExport();
        expect(request.status).toBe('failed');
        expect(request.error).toContain('Network error');
      });

      it('calls onDataRequest callback', async () => {
        const onRequest = vi.fn();
        const callbackGdpr = new GdprComplianceService({ ...defaultConfig, onDataRequest: onRequest });
        await callbackGdpr.requestDataExport();
        expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ type: 'export' }));
        callbackGdpr.destroy();
      });
    });

    describe('requestDataDeletion', () => {
      it('submits a data deletion request to the API', async () => {
        await gdpr.requestDataDeletion();
        expect(fetchMock).toHaveBeenCalledWith('/api/privacy/data-requests', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ type: 'deletion' }),
        }));
      });

      it('returns a data request object', async () => {
        const request = await gdpr.requestDataDeletion();
        expect(request.type).toBe('deletion');
        expect(request.status).toBe('processing');
      });

      it('handles API failure gracefully', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
        const request = await gdpr.requestDataDeletion();
        expect(request.status).toBe('failed');
      });
    });

    describe('getDataRequests', () => {
      it('returns empty array initially', () => {
        expect(gdpr.getDataRequests()).toEqual([]);
      });

      it('accumulates submitted requests', async () => {
        await gdpr.requestDataExport();
        await gdpr.requestDataDeletion();
        expect(gdpr.getDataRequests()).toHaveLength(2);
      });
    });
  });

  describe('Privacy Preferences', () => {
    describe('getPrivacyPreferences', () => {
      it('returns default preferences initially', () => {
        const prefs = gdpr.getPrivacyPreferences();
        expect(prefs.profileVisibility).toBe('organization');
        expect(prefs.activitySharing).toBe(true);
        expect(prefs.thirdPartyDataSharing).toBe(false);
        expect(prefs.emailMarketing).toBe(false);
      });

      it('returns a copy, not a reference', () => {
        const prefs = gdpr.getPrivacyPreferences();
        prefs.profileVisibility = 'private';
        expect(gdpr.getPrivacyPreferences().profileVisibility).toBe('organization');
      });
    });

    describe('updatePrivacyPreferences', () => {
      it('updates specified preferences', () => {
        const updated = gdpr.updatePrivacyPreferences({ profileVisibility: 'private' });
        expect(updated.profileVisibility).toBe('private');
        expect(updated.activitySharing).toBe(true); // Unchanged
      });

      it('persists updated preferences to localStorage', () => {
        gdpr.updatePrivacyPreferences({ emailMarketing: true });
        const stored = localStorage.getItem('streetstudio_privacy_preferences');
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored!);
        expect(parsed.emailMarketing).toBe(true);
      });

      it('loads persisted preferences on construction', () => {
        gdpr.updatePrivacyPreferences({ profileVisibility: 'public' });
        const newGdpr = new GdprComplianceService(defaultConfig);
        expect(newGdpr.getPrivacyPreferences().profileVisibility).toBe('public');
        newGdpr.destroy();
      });
    });

    describe('resetPrivacyPreferences', () => {
      it('resets all preferences to defaults', () => {
        gdpr.updatePrivacyPreferences({ profileVisibility: 'private', emailMarketing: true });
        const reset = gdpr.resetPrivacyPreferences();
        expect(reset.profileVisibility).toBe('organization');
        expect(reset.emailMarketing).toBe(false);
      });
    });
  });

  describe('destroy', () => {
    it('removes banner and clears data requests', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      gdpr.renderConsentBanner(container);
      gdpr.destroy();
      expect(container.querySelector('#cookie-consent-banner')).toBeNull();
      expect(gdpr.getDataRequests()).toEqual([]);
      document.body.removeChild(container);
    });
  });
});
