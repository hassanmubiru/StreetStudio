/**
 * GDPR Compliance Service
 *
 * Cookie consent banner management, data export request UI,
 * data deletion request UI, and privacy preference management.
 *
 * Requirements: 9.5
 */

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';

export type ConsentStatus = 'granted' | 'denied' | 'pending';

export interface ConsentPreferences {
  necessary: ConsentStatus;
  analytics: ConsentStatus;
  marketing: ConsentStatus;
  preferences: ConsentStatus;
  timestamp: string;
  version: string;
}

export type DataRequestType = 'export' | 'deletion';
export type DataRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DataRequest {
  id: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requestedAt: string;
  completedAt?: string;
  downloadUrl?: string;
  error?: string;
}

export interface PrivacyPreferences {
  profileVisibility: 'public' | 'organization' | 'private';
  activitySharing: boolean;
  searchIndexing: boolean;
  thirdPartyDataSharing: boolean;
  emailMarketing: boolean;
  usageAnalytics: boolean;
}

export interface GdprComplianceConfig {
  /** API endpoint for data requests */
  apiEndpoint: string;
  /** Current consent version (bump to re-show banner) */
  consentVersion: string;
  /** Callback when consent changes */
  onConsentChange?: (preferences: ConsentPreferences) => void;
  /** Callback when data request is submitted */
  onDataRequest?: (request: DataRequest) => void;
}

const CONSENT_STORAGE_KEY = 'streetstudio_cookie_consent';
const PRIVACY_PREFS_STORAGE_KEY = 'streetstudio_privacy_preferences';

const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  profileVisibility: 'organization',
  activitySharing: true,
  searchIndexing: true,
  thirdPartyDataSharing: false,
  emailMarketing: false,
  usageAnalytics: true,
};

/**
 * GDPR compliance manager handling cookie consent, data requests,
 * and privacy preferences.
 */
export class GdprComplianceService {
  private config: GdprComplianceConfig;
  private consentPreferences: ConsentPreferences | null = null;
  private privacyPreferences: PrivacyPreferences;
  private dataRequests: DataRequest[] = [];
  private bannerElement: HTMLElement | null = null;

  constructor(config: GdprComplianceConfig) {
    this.config = config;
    this.consentPreferences = this.loadConsentFromStorage();
    this.privacyPreferences = this.loadPrivacyPreferences();
  }

  // --- Cookie Consent ---

  /**
   * Check if consent has been given for a category.
   */
  public hasConsent(category: ConsentCategory): boolean {
    if (category === 'necessary') return true; // Always granted
    if (!this.consentPreferences) return false;
    return this.consentPreferences[category] === 'granted';
  }

  /**
   * Check if the consent banner should be shown.
   */
  public shouldShowBanner(): boolean {
    if (!this.consentPreferences) return true;
    if (this.consentPreferences.version !== this.config.consentVersion) return true;
    return false;
  }

  /**
   * Get current consent preferences.
   */
  public getConsentPreferences(): ConsentPreferences | null {
    return this.consentPreferences ? { ...this.consentPreferences } : null;
  }

  /**
   * Accept all cookie categories.
   */
  public acceptAll(): ConsentPreferences {
    const preferences: ConsentPreferences = {
      necessary: 'granted',
      analytics: 'granted',
      marketing: 'granted',
      preferences: 'granted',
      timestamp: new Date().toISOString(),
      version: this.config.consentVersion,
    };

    this.setConsent(preferences);
    return preferences;
  }

  /**
   * Reject all optional cookie categories (only necessary remains).
   */
  public rejectAll(): ConsentPreferences {
    const preferences: ConsentPreferences = {
      necessary: 'granted',
      analytics: 'denied',
      marketing: 'denied',
      preferences: 'denied',
      timestamp: new Date().toISOString(),
      version: this.config.consentVersion,
    };

    this.setConsent(preferences);
    return preferences;
  }

  /**
   * Set custom consent preferences.
   */
  public setCustomConsent(categories: Partial<Record<ConsentCategory, boolean>>): ConsentPreferences {
    const preferences: ConsentPreferences = {
      necessary: 'granted',
      analytics: categories.analytics ? 'granted' : 'denied',
      marketing: categories.marketing ? 'granted' : 'denied',
      preferences: categories.preferences ? 'granted' : 'denied',
      timestamp: new Date().toISOString(),
      version: this.config.consentVersion,
    };

    this.setConsent(preferences);
    return preferences;
  }

  /**
   * Render the cookie consent banner into the DOM.
   */
  public renderConsentBanner(container?: HTMLElement): HTMLElement {
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.setAttribute('aria-describedby', 'consent-description');
    banner.className = 'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg p-4 md:p-6';

    banner.innerHTML = `
      <div class="max-w-4xl mx-auto">
        <div class="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div class="flex-1">
            <h2 class="text-base font-semibold text-gray-900 mb-1">Cookie Preferences</h2>
            <p id="consent-description" class="text-sm text-gray-600">
              We use cookies to improve your experience, analyze traffic, and personalize content. 
              You can choose which categories to allow. Necessary cookies are always active.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              id="btn-consent-customize"
              type="button"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-expanded="false"
              aria-controls="consent-details"
            >Customize</button>
            <button
              id="btn-consent-reject"
              type="button"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >Reject All</button>
            <button
              id="btn-consent-accept"
              type="button"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >Accept All</button>
          </div>
        </div>
        <div id="consent-details" class="hidden mt-4 pt-4 border-t border-gray-200" aria-hidden="true">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
              <input type="checkbox" checked disabled class="rounded border-gray-300" aria-describedby="desc-necessary" />
              <div>
                <span class="text-sm font-medium text-gray-900">Necessary</span>
                <p id="desc-necessary" class="text-xs text-gray-500">Required for basic site functionality</p>
              </div>
            </label>
            <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
              <input type="checkbox" id="consent-analytics" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" aria-describedby="desc-analytics" />
              <div>
                <span class="text-sm font-medium text-gray-900">Analytics</span>
                <p id="desc-analytics" class="text-xs text-gray-500">Help us understand how you use the site</p>
              </div>
            </label>
            <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
              <input type="checkbox" id="consent-marketing" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" aria-describedby="desc-marketing" />
              <div>
                <span class="text-sm font-medium text-gray-900">Marketing</span>
                <p id="desc-marketing" class="text-xs text-gray-500">Personalized ads and marketing content</p>
              </div>
            </label>
            <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
              <input type="checkbox" id="consent-preferences" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" aria-describedby="desc-preferences" />
              <div>
                <span class="text-sm font-medium text-gray-900">Preferences</span>
                <p id="desc-preferences" class="text-xs text-gray-500">Remember your settings and preferences</p>
              </div>
            </label>
          </div>
          <div class="mt-3 flex justify-end">
            <button
              id="btn-consent-save"
              type="button"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >Save Preferences</button>
          </div>
        </div>
      </div>
    `;

    this.setupBannerEvents(banner);

    const target = container ?? document.body;
    target.appendChild(banner);
    this.bannerElement = banner;

    return banner;
  }

  /**
   * Remove the consent banner from the DOM.
   */
  public hideBanner(): void {
    if (this.bannerElement && this.bannerElement.parentNode) {
      this.bannerElement.parentNode.removeChild(this.bannerElement);
      this.bannerElement = null;
    }
  }

  // --- Data Export/Deletion Requests ---

  /**
   * Submit a data export request.
   */
  public async requestDataExport(): Promise<DataRequest> {
    const request: DataRequest = {
      id: generateRequestId(),
      type: 'export',
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(`${this.config.apiEndpoint}/data-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'export' }),
      });

      if (!response.ok) {
        throw new Error(`Data export request failed: ${response.status}`);
      }

      const data = await response.json();
      request.id = data.id ?? request.id;
      request.status = 'processing';
    } catch (error) {
      request.status = 'failed';
      request.error = error instanceof Error ? error.message : 'Unknown error';
    }

    this.dataRequests.push(request);
    this.config.onDataRequest?.(request);

    return request;
  }

  /**
   * Submit a data deletion request.
   */
  public async requestDataDeletion(): Promise<DataRequest> {
    const request: DataRequest = {
      id: generateRequestId(),
      type: 'deletion',
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(`${this.config.apiEndpoint}/data-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'deletion' }),
      });

      if (!response.ok) {
        throw new Error(`Data deletion request failed: ${response.status}`);
      }

      const data = await response.json();
      request.id = data.id ?? request.id;
      request.status = 'processing';
    } catch (error) {
      request.status = 'failed';
      request.error = error instanceof Error ? error.message : 'Unknown error';
    }

    this.dataRequests.push(request);
    this.config.onDataRequest?.(request);

    return request;
  }

  /**
   * Get all data requests for display.
   */
  public getDataRequests(): ReadonlyArray<DataRequest> {
    return [...this.dataRequests];
  }

  // --- Privacy Preferences ---

  /**
   * Get current privacy preferences.
   */
  public getPrivacyPreferences(): PrivacyPreferences {
    return { ...this.privacyPreferences };
  }

  /**
   * Update privacy preferences.
   */
  public updatePrivacyPreferences(updates: Partial<PrivacyPreferences>): PrivacyPreferences {
    this.privacyPreferences = {
      ...this.privacyPreferences,
      ...updates,
    };

    this.savePrivacyPreferences();
    return { ...this.privacyPreferences };
  }

  /**
   * Reset privacy preferences to defaults.
   */
  public resetPrivacyPreferences(): PrivacyPreferences {
    this.privacyPreferences = { ...DEFAULT_PRIVACY_PREFERENCES };
    this.savePrivacyPreferences();
    return { ...this.privacyPreferences };
  }

  /**
   * Withdraw all consent and clear stored preferences.
   */
  public withdrawConsent(): void {
    this.consentPreferences = null;
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  }

  /**
   * Clean up resources.
   */
  public destroy(): void {
    this.hideBanner();
    this.dataRequests = [];
  }

  // --- Private Helpers ---

  private setConsent(preferences: ConsentPreferences): void {
    this.consentPreferences = preferences;
    this.saveConsentToStorage(preferences);
    this.hideBanner();
    this.config.onConsentChange?.(preferences);
  }

  private setupBannerEvents(banner: HTMLElement): void {
    // Accept All
    banner.querySelector('#btn-consent-accept')?.addEventListener('click', () => {
      this.acceptAll();
    });

    // Reject All
    banner.querySelector('#btn-consent-reject')?.addEventListener('click', () => {
      this.rejectAll();
    });

    // Customize toggle
    const customizeBtn = banner.querySelector('#btn-consent-customize');
    const details = banner.querySelector('#consent-details');
    customizeBtn?.addEventListener('click', () => {
      const isExpanded = customizeBtn.getAttribute('aria-expanded') === 'true';
      customizeBtn.setAttribute('aria-expanded', String(!isExpanded));
      details?.classList.toggle('hidden');
      details?.setAttribute('aria-hidden', String(isExpanded));
    });

    // Save custom preferences
    banner.querySelector('#btn-consent-save')?.addEventListener('click', () => {
      const analytics = (banner.querySelector('#consent-analytics') as HTMLInputElement)?.checked ?? false;
      const marketing = (banner.querySelector('#consent-marketing') as HTMLInputElement)?.checked ?? false;
      const preferences = (banner.querySelector('#consent-preferences') as HTMLInputElement)?.checked ?? false;

      this.setCustomConsent({ analytics, marketing, preferences });
    });
  }

  private loadConsentFromStorage(): ConsentPreferences | null {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as ConsentPreferences;
      // Validate structure
      if (parsed && parsed.timestamp && parsed.version) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveConsentToStorage(preferences: ConsentPreferences): void {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage unavailable
    }
  }

  private loadPrivacyPreferences(): PrivacyPreferences {
    try {
      const stored = localStorage.getItem(PRIVACY_PREFS_STORAGE_KEY);
      if (!stored) return { ...DEFAULT_PRIVACY_PREFERENCES };
      const parsed = JSON.parse(stored) as PrivacyPreferences;
      return { ...DEFAULT_PRIVACY_PREFERENCES, ...parsed };
    } catch {
      return { ...DEFAULT_PRIVACY_PREFERENCES };
    }
  }

  private savePrivacyPreferences(): void {
    try {
      localStorage.setItem(PRIVACY_PREFS_STORAGE_KEY, JSON.stringify(this.privacyPreferences));
    } catch {
      // Storage unavailable
    }
  }
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
