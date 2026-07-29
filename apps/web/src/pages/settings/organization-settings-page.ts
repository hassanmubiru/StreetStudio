/**
 * Organization Settings Page
 *
 * Comprehensive organization settings including branding customization,
 * security policy configuration, storage preferences and quota management,
 * and integration configuration for third-party services.
 *
 * Requirements: 8.6, 8.10
 */

import type { Uuid } from '@streetstudio/shared';
import { FormValidator, ValidationRules } from '../../utils/validation.js';
import { logger } from '../../app/client-logger.js';

// --- Types ---

export interface BrandingSettings {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  faviconUrl: string | null;
  customCss: string;
}

export interface SecurityPolicySettings {
  enforceSSO: boolean;
  requireMFA: boolean;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSpecialChars: boolean;
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  ipAllowlist: string[];
  dataRetentionDays: number;
  complianceMode: 'none' | 'gdpr' | 'hipaa' | 'soc2';
}

export interface StorageSettings {
  storageQuotaGB: number;
  usedStorageGB: number;
  retentionPolicy: 'indefinite' | '30days' | '90days' | '1year';
  autoDeleteProcessedOriginals: boolean;
  preferredRegion: string;
}

export interface IntegrationSettings {
  slackWebhookUrl: string;
  slackEnabled: boolean;
  teamsWebhookUrl: string;
  teamsEnabled: boolean;
  webhookEndpoints: WebhookEndpoint[];
  ssoProvider: string;
  ssoEntityId: string;
  ssoMetadataUrl: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

export interface OrganizationSettingsData {
  branding: BrandingSettings;
  security: SecurityPolicySettings;
  storage: StorageSettings;
  integrations: IntegrationSettings;
}

export interface OrganizationSettingsPageConfig {
  organizationId: Uuid;
  organizationName: string;
  isAdmin: boolean;
  initialSettings?: Partial<OrganizationSettingsData>;
}

type SettingsTab = 'branding' | 'security' | 'storage' | 'integrations';

// --- Constants ---

export const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB
export const LOGO_ALLOWED_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const CUSTOM_CSS_MAX_LENGTH = 10000;
export const MAX_WEBHOOK_ENDPOINTS = 10;
export const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

export const STORAGE_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'EU (Ireland)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
];

export const WEBHOOK_EVENTS = [
  'video.uploaded', 'video.processed', 'video.deleted',
  'comment.created', 'comment.deleted',
  'member.joined', 'member.removed',
  'project.created', 'project.deleted',
];

// --- Defaults ---

export function createDefaultBrandingSettings(): BrandingSettings {
  return {
    logoUrl: null,
    primaryColor: '#2563eb',
    accentColor: '#7c3aed',
    faviconUrl: null,
    customCss: '',
  };
}

export function createDefaultSecuritySettings(): SecurityPolicySettings {
  return {
    enforceSSO: false,
    requireMFA: false,
    passwordMinLength: 8,
    passwordRequireUppercase: true,
    passwordRequireNumbers: true,
    passwordRequireSpecialChars: false,
    sessionTimeoutMinutes: 480,
    maxLoginAttempts: 5,
    ipAllowlist: [],
    dataRetentionDays: 365,
    complianceMode: 'none',
  };
}

export function createDefaultStorageSettings(): StorageSettings {
  return {
    storageQuotaGB: 100,
    usedStorageGB: 0,
    retentionPolicy: 'indefinite',
    autoDeleteProcessedOriginals: false,
    preferredRegion: 'us-east-1',
  };
}

export function createDefaultIntegrationSettings(): IntegrationSettings {
  return {
    slackWebhookUrl: '',
    slackEnabled: false,
    teamsWebhookUrl: '',
    teamsEnabled: false,
    webhookEndpoints: [],
    ssoProvider: '',
    ssoEntityId: '',
    ssoMetadataUrl: '',
  };
}

// --- Validators ---

export function validateLogoFile(file: File): { valid: boolean; error?: string } {
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `File type "${file.type}" not supported. Use PNG, SVG, JPEG, or WebP.` };
  }
  if (file.size > LOGO_MAX_SIZE) {
    return { valid: false, error: `File size exceeds 2MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.` };
  }
  return { valid: true };
}

export function validateColor(color: string): boolean {
  return COLOR_PATTERN.test(color);
}

export function validateIpAddress(ip: string): boolean {
  return IP_PATTERN.test(ip);
}

export function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createSecurityValidator(): FormValidator {
  return new FormValidator({
    passwordMinLength: [
      ValidationRules.required('Password minimum length is required'),
      ValidationRules.min(6, 'Minimum password length must be at least 6'),
      ValidationRules.max(128, 'Minimum password length cannot exceed 128'),
    ],
    sessionTimeoutMinutes: [
      ValidationRules.required('Session timeout is required'),
      ValidationRules.min(5, 'Session timeout must be at least 5 minutes'),
      ValidationRules.max(10080, 'Session timeout cannot exceed 7 days'),
    ],
    maxLoginAttempts: [
      ValidationRules.required('Max login attempts is required'),
      ValidationRules.min(3, 'Max login attempts must be at least 3'),
      ValidationRules.max(20, 'Max login attempts cannot exceed 20'),
    ],
  });
}

// --- Page Component ---

export class OrganizationSettingsPage {
  private config: OrganizationSettingsPageConfig;
  private element: HTMLElement;
  private activeTab: SettingsTab = 'branding';
  private settings: OrganizationSettingsData;
  private isDirty = false;
  private isSaving = false;
  private pendingLogoFile: File | null = null;
  private logoPreviewUrl: string | null = null;

  constructor(config: OrganizationSettingsPageConfig) {
    this.config = config;
    this.settings = {
      branding: config.initialSettings?.branding || createDefaultBrandingSettings(),
      security: config.initialSettings?.security || createDefaultSecuritySettings(),
      storage: config.initialSettings?.storage || createDefaultStorageSettings(),
      integrations: config.initialSettings?.integrations || createDefaultIntegrationSettings(),
    };

    this.element = document.createElement('div');
    this.element.className = 'p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('data-page', 'organization-settings');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getSettings(): OrganizationSettingsData {
    return JSON.parse(JSON.stringify(this.settings));
  }

  public getActiveTab(): SettingsTab {
    return this.activeTab;
  }

  public isDirtyState(): boolean {
    return this.isDirty;
  }

  public switchTab(tab: SettingsTab): void {
    this.activeTab = tab;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderTabs());
    this.element.appendChild(this.renderActiveSection());
    this.element.appendChild(this.renderSaveBar());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mb-6';
    header.innerHTML = `
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Organization Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage settings for <strong>${this.escapeHtml(this.config.organizationName)}</strong>.
      </p>
    `;
    return header;
  }

  private renderTabs(): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'border-b border-gray-200 dark:border-gray-700 mb-6';
    nav.setAttribute('aria-label', 'Settings tabs');

    const tabs: { key: SettingsTab; label: string; icon: string }[] = [
      { key: 'branding', label: 'Branding', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
      { key: 'security', label: 'Security', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
      { key: 'storage', label: 'Storage', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
      { key: 'integrations', label: 'Integrations', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    ];

    const tabList = document.createElement('div');
    tabList.className = 'flex -mb-px space-x-6 overflow-x-auto';
    tabList.setAttribute('role', 'tablist');

    for (const tab of tabs) {
      const isActive = this.activeTab === tab.key;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('aria-controls', `panel-${tab.key}`);
      button.id = `tab-${tab.key}`;
      button.dataset.tab = tab.key;
      button.className = `flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
        isActive
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
      }`;
      button.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${tab.icon}"></path>
        </svg>
        ${tab.label}
      `;
      tabList.appendChild(button);
    }

    nav.appendChild(tabList);
    return nav;
  }

  private renderActiveSection(): HTMLElement {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${this.activeTab}`);
    panel.id = `panel-${this.activeTab}`;

    switch (this.activeTab) {
      case 'branding':
        panel.appendChild(this.renderBrandingSection());
        break;
      case 'security':
        panel.appendChild(this.renderSecuritySection());
        break;
      case 'storage':
        panel.appendChild(this.renderStorageSection());
        break;
      case 'integrations':
        panel.appendChild(this.renderIntegrationsSection());
        break;
    }

    return panel;
  }

  // --- Branding Section ---

  private renderBrandingSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'space-y-6';

    const logoUrl = this.logoPreviewUrl || this.settings.branding.logoUrl;
    const logoContent = logoUrl
      ? `<img src="${logoUrl}" alt="Organization logo" class="w-32 h-32 object-contain border border-gray-200 dark:border-gray-700 rounded-lg p-2" />`
      : `<div class="w-32 h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center">
           <span class="text-sm text-gray-400">No logo</span>
         </div>`;

    section.innerHTML = `
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="branding-logo-heading">
        <h2 id="branding-logo-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Logo</h2>
        <div class="flex items-start gap-6">
          <div id="logo-preview">${logoContent}</div>
          <div>
            <label for="logo-upload" class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors">
              Upload Logo
              <input id="logo-upload" type="file" class="sr-only" accept="${LOGO_ALLOWED_TYPES.join(',')}" aria-describedby="logo-help" />
            </label>
            ${logoUrl ? '<button id="remove-logo" type="button" class="ml-3 text-sm text-red-600 dark:text-red-400 hover:text-red-500">Remove</button>' : ''}
            <p id="logo-help" class="mt-2 text-xs text-gray-500 dark:text-gray-400">PNG, SVG, JPEG, or WebP. Max 2MB. Recommended 256×256.</p>
            <div id="logo-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
          </div>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="branding-colors-heading">
        <h2 id="branding-colors-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Brand Colors</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label for="primary-color" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Color</label>
            <div class="flex items-center gap-3">
              <input id="primary-color" type="color" value="${this.settings.branding.primaryColor}" class="w-10 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer" />
              <input id="primary-color-hex" type="text" value="${this.settings.branding.primaryColor}" maxlength="7" class="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700" aria-label="Primary color hex value" />
            </div>
            <div id="primary-color-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
          </div>
          <div>
            <label for="accent-color" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Accent Color</label>
            <div class="flex items-center gap-3">
              <input id="accent-color" type="color" value="${this.settings.branding.accentColor}" class="w-10 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer" />
              <input id="accent-color-hex" type="text" value="${this.settings.branding.accentColor}" maxlength="7" class="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700" aria-label="Accent color hex value" />
            </div>
            <div id="accent-color-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
          </div>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="branding-css-heading">
        <h2 id="branding-css-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Custom CSS</h2>
        <textarea id="custom-css" rows="6" maxlength="${CUSTOM_CSS_MAX_LENGTH}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 resize-y" aria-describedby="css-help" placeholder="/* Custom styles for your organization */">${this.escapeHtml(this.settings.branding.customCss)}</textarea>
        <p id="css-help" class="mt-1 text-xs text-gray-500 dark:text-gray-400">Custom CSS for white-label branding. Max ${CUSTOM_CSS_MAX_LENGTH} characters.</p>
      </section>
    `;
    return section;
  }

  // --- Security Section ---

  private renderSecuritySection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'space-y-6';
    const sec = this.settings.security;

    section.innerHTML = `
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="security-auth-heading">
        <h2 id="security-auth-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Authentication Policies</h2>
        <div class="space-y-4">
          <label class="flex items-center gap-3 cursor-pointer">
            <input id="enforce-sso" type="checkbox" ${sec.enforceSSO ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <div>
              <span class="text-sm font-medium text-gray-900 dark:text-white">Enforce SSO</span>
              <p class="text-xs text-gray-500 dark:text-gray-400">Require all members to authenticate via Single Sign-On.</p>
            </div>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input id="require-mfa" type="checkbox" ${sec.requireMFA ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <div>
              <span class="text-sm font-medium text-gray-900 dark:text-white">Require Multi-Factor Authentication</span>
              <p class="text-xs text-gray-500 dark:text-gray-400">All members must enable MFA for their accounts.</p>
            </div>
          </label>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="security-password-heading">
        <h2 id="security-password-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Password Policy</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label for="password-min-length" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Password Length</label>
            <input id="password-min-length" type="number" min="6" max="128" value="${sec.passwordMinLength}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label for="max-login-attempts" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Login Attempts</label>
            <input id="max-login-attempts" type="number" min="3" max="20" value="${sec.maxLoginAttempts}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div class="mt-4 space-y-3">
          <label class="flex items-center gap-3 cursor-pointer">
            <input id="require-uppercase" type="checkbox" ${sec.passwordRequireUppercase ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span class="text-sm text-gray-700 dark:text-gray-300">Require uppercase letter</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input id="require-numbers" type="checkbox" ${sec.passwordRequireNumbers ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span class="text-sm text-gray-700 dark:text-gray-300">Require number</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input id="require-special" type="checkbox" ${sec.passwordRequireSpecialChars ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span class="text-sm text-gray-700 dark:text-gray-300">Require special character</span>
          </label>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="security-session-heading">
        <h2 id="security-session-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Session &amp; Compliance</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label for="session-timeout" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Session Timeout (minutes)</label>
            <input id="session-timeout" type="number" min="5" max="10080" value="${sec.sessionTimeoutMinutes}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label for="data-retention" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Retention (days)</label>
            <input id="data-retention" type="number" min="30" max="3650" value="${sec.dataRetentionDays}" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div class="mt-4">
          <label for="compliance-mode" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Compliance Mode</label>
          <select id="compliance-mode" class="w-full sm:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500">
            <option value="none" ${sec.complianceMode === 'none' ? 'selected' : ''}>None</option>
            <option value="gdpr" ${sec.complianceMode === 'gdpr' ? 'selected' : ''}>GDPR</option>
            <option value="hipaa" ${sec.complianceMode === 'hipaa' ? 'selected' : ''}>HIPAA</option>
            <option value="soc2" ${sec.complianceMode === 'soc2' ? 'selected' : ''}>SOC 2</option>
          </select>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="security-ip-heading">
        <h2 id="security-ip-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">IP Allowlist</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Restrict access to specific IP addresses or CIDR ranges.</p>
        <div id="ip-allowlist-container" class="space-y-2">
          ${sec.ipAllowlist.map((ip, i) => `
            <div class="flex items-center gap-2" data-ip-index="${i}">
              <input type="text" value="${ip}" class="ip-input flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700" placeholder="192.168.1.0/24" />
              <button type="button" class="remove-ip text-red-500 hover:text-red-700 p-1" aria-label="Remove IP ${ip}">✕</button>
            </div>
          `).join('')}
        </div>
        <button id="add-ip" type="button" class="mt-3 inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-md transition-colors">
          + Add IP Address
        </button>
        <div id="ip-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
      </section>
    `;
    return section;
  }

  // --- Storage Section ---

  private renderStorageSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'space-y-6';
    const stor = this.settings.storage;
    const usagePercent = stor.storageQuotaGB > 0
      ? Math.min(100, Math.round((stor.usedStorageGB / stor.storageQuotaGB) * 100))
      : 0;
    const usageColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-blue-500';

    const regionOptions = STORAGE_REGIONS.map(r =>
      `<option value="${r.value}" ${r.value === stor.preferredRegion ? 'selected' : ''}>${r.label}</option>`
    ).join('');

    section.innerHTML = `
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="storage-quota-heading">
        <h2 id="storage-quota-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Storage Usage</h2>
        <div class="mb-4">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-700 dark:text-gray-300">${stor.usedStorageGB.toFixed(1)} GB used</span>
            <span class="text-gray-500 dark:text-gray-400">${stor.storageQuotaGB} GB quota</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3" role="progressbar" aria-valuenow="${usagePercent}" aria-valuemin="0" aria-valuemax="100" aria-label="Storage usage">
            <div class="${usageColor} rounded-full h-3 transition-all" style="width: ${usagePercent}%"></div>
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">${usagePercent}% of storage quota used</p>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="storage-prefs-heading">
        <h2 id="storage-prefs-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Storage Preferences</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label for="retention-policy" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Retention Policy</label>
            <select id="retention-policy" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500">
              <option value="indefinite" ${stor.retentionPolicy === 'indefinite' ? 'selected' : ''}>Keep indefinitely</option>
              <option value="30days" ${stor.retentionPolicy === '30days' ? 'selected' : ''}>30 days</option>
              <option value="90days" ${stor.retentionPolicy === '90days' ? 'selected' : ''}>90 days</option>
              <option value="1year" ${stor.retentionPolicy === '1year' ? 'selected' : ''}>1 year</option>
            </select>
          </div>
          <div>
            <label for="preferred-region" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Region</label>
            <select id="preferred-region" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500">
              ${regionOptions}
            </select>
          </div>
        </div>
        <div class="mt-4">
          <label class="flex items-center gap-3 cursor-pointer">
            <input id="auto-delete-originals" type="checkbox" ${stor.autoDeleteProcessedOriginals ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <div>
              <span class="text-sm font-medium text-gray-900 dark:text-white">Auto-delete processed originals</span>
              <p class="text-xs text-gray-500 dark:text-gray-400">Remove original uploads after processing to save storage.</p>
            </div>
          </label>
        </div>
      </section>
    `;
    return section;
  }

  // --- Integrations Section ---

  private renderIntegrationsSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'space-y-6';
    const integ = this.settings.integrations;

    const webhookRows = integ.webhookEndpoints.map((ep, i) => `
      <tr class="border-t border-gray-200 dark:border-gray-700" data-webhook-index="${i}">
        <td class="px-3 py-2 text-sm text-gray-900 dark:text-white truncate max-w-[200px]">${this.escapeHtml(ep.url)}</td>
        <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">${ep.events.length} events</td>
        <td class="px-3 py-2"><span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ep.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'}">${ep.active ? 'Active' : 'Inactive'}</span></td>
        <td class="px-3 py-2"><button type="button" class="remove-webhook text-red-500 hover:text-red-700 text-sm" aria-label="Remove webhook ${this.escapeHtml(ep.url)}">Remove</button></td>
      </tr>
    `).join('');

    section.innerHTML = `
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="integrations-slack-heading">
        <h2 id="integrations-slack-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Slack Integration</h2>
        <label class="flex items-center gap-3 mb-4 cursor-pointer">
          <input id="slack-enabled" type="checkbox" ${integ.slackEnabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
          <span class="text-sm font-medium text-gray-900 dark:text-white">Enable Slack notifications</span>
        </label>
        <div>
          <label for="slack-webhook-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook URL</label>
          <input id="slack-webhook-url" type="url" value="${this.escapeHtml(integ.slackWebhookUrl)}" placeholder="https://hooks.slack.com/services/..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" ${!integ.slackEnabled ? 'disabled' : ''} />
          <div id="slack-url-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="integrations-teams-heading">
        <h2 id="integrations-teams-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Microsoft Teams Integration</h2>
        <label class="flex items-center gap-3 mb-4 cursor-pointer">
          <input id="teams-enabled" type="checkbox" ${integ.teamsEnabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
          <span class="text-sm font-medium text-gray-900 dark:text-white">Enable Teams notifications</span>
        </label>
        <div>
          <label for="teams-webhook-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook URL</label>
          <input id="teams-webhook-url" type="url" value="${this.escapeHtml(integ.teamsWebhookUrl)}" placeholder="https://outlook.office.com/webhook/..." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" ${!integ.teamsEnabled ? 'disabled' : ''} />
          <div id="teams-url-error" class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></div>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="integrations-sso-heading">
        <h2 id="integrations-sso-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">SSO Configuration</h2>
        <div class="space-y-4">
          <div>
            <label for="sso-provider" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SSO Provider</label>
            <select id="sso-provider" class="w-full sm:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500">
              <option value="" ${!integ.ssoProvider ? 'selected' : ''}>None</option>
              <option value="okta" ${integ.ssoProvider === 'okta' ? 'selected' : ''}>Okta</option>
              <option value="azure-ad" ${integ.ssoProvider === 'azure-ad' ? 'selected' : ''}>Azure AD</option>
              <option value="google" ${integ.ssoProvider === 'google' ? 'selected' : ''}>Google Workspace</option>
              <option value="onelogin" ${integ.ssoProvider === 'onelogin' ? 'selected' : ''}>OneLogin</option>
              <option value="custom-saml" ${integ.ssoProvider === 'custom-saml' ? 'selected' : ''}>Custom SAML</option>
            </select>
          </div>
          <div>
            <label for="sso-entity-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entity ID</label>
            <input id="sso-entity-id" type="text" value="${this.escapeHtml(integ.ssoEntityId)}" placeholder="https://your-idp.example.com/entity-id" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label for="sso-metadata-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Metadata URL</label>
            <input id="sso-metadata-url" type="url" value="${this.escapeHtml(integ.ssoMetadataUrl)}" placeholder="https://your-idp.example.com/metadata.xml" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6" aria-labelledby="integrations-webhooks-heading">
        <h2 id="integrations-webhooks-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Webhook Endpoints</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Configure webhook endpoints to receive event notifications. Max ${MAX_WEBHOOK_ENDPOINTS} endpoints.</p>
        ${integ.webhookEndpoints.length > 0 ? `
          <div class="overflow-x-auto mb-4">
            <table class="w-full text-left" aria-label="Webhook endpoints">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">URL</th>
                  <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Events</th>
                  <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th class="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>${webhookRows}</tbody>
            </table>
          </div>
        ` : '<p class="text-sm text-gray-400 dark:text-gray-500 mb-4 italic">No webhook endpoints configured.</p>'}
        ${integ.webhookEndpoints.length < MAX_WEBHOOK_ENDPOINTS ? `
          <button id="add-webhook" type="button" class="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-md transition-colors">
            + Add Webhook Endpoint
          </button>
        ` : ''}
      </section>
    `;
    return section;
  }

  // --- Save Bar ---

  private renderSaveBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 mt-6 -mx-4 sm:-mx-6 lg:-mx-8 flex items-center justify-between';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Save actions');

    const statusText = this.isSaving ? 'Saving...' : this.isDirty ? 'Unsaved changes' : 'All changes saved';
    const statusClass = this.isSaving ? 'text-blue-600 dark:text-blue-400' : this.isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';

    bar.innerHTML = `
      <span id="save-status" class="text-sm ${statusClass}" aria-live="polite">${statusText}</span>
      <div class="flex gap-3">
        <button id="discard-settings" type="button" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50" ${!this.isDirty ? 'disabled' : ''}>
          Discard
        </button>
        <button id="save-settings" type="button" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" ${!this.isDirty || this.isSaving ? 'disabled' : ''}>
          ${this.isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    `;
    return bar;
  }

  // --- Event Handling ---

  private setupEventListeners(): void {
    // Tab switching
    const tabs = this.element.querySelectorAll('[role="tab"]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabKey = (tab as HTMLElement).dataset.tab as SettingsTab;
        if (tabKey && tabKey !== this.activeTab) {
          this.activeTab = tabKey;
          this.render();
        }
      });
    });

    // Save / Discard
    this.element.querySelector('#save-settings')?.addEventListener('click', () => this.handleSave());
    this.element.querySelector('#discard-settings')?.addEventListener('click', () => this.handleDiscard());

    // Section-specific listeners
    switch (this.activeTab) {
      case 'branding':
        this.setupBrandingListeners();
        break;
      case 'security':
        this.setupSecurityListeners();
        break;
      case 'storage':
        this.setupStorageListeners();
        break;
      case 'integrations':
        this.setupIntegrationListeners();
        break;
    }
  }

  private setupBrandingListeners(): void {
    // Logo upload
    const logoInput = this.element.querySelector('#logo-upload') as HTMLInputElement;
    logoInput?.addEventListener('change', (e) => this.handleLogoUpload(e));

    const removeLogoBtn = this.element.querySelector('#remove-logo');
    removeLogoBtn?.addEventListener('click', () => this.handleRemoveLogo());

    // Color pickers
    const primaryColor = this.element.querySelector('#primary-color') as HTMLInputElement;
    const primaryHex = this.element.querySelector('#primary-color-hex') as HTMLInputElement;
    primaryColor?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.settings.branding.primaryColor = value;
      if (primaryHex) primaryHex.value = value;
      this.markDirty();
    });
    primaryHex?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      if (validateColor(value)) {
        this.settings.branding.primaryColor = value;
        if (primaryColor) primaryColor.value = value;
        this.clearError('primary-color-error');
      } else if (value.length === 7) {
        this.showError('primary-color-error', 'Invalid hex color (e.g., #2563eb)');
      }
      this.markDirty();
    });

    const accentColor = this.element.querySelector('#accent-color') as HTMLInputElement;
    const accentHex = this.element.querySelector('#accent-color-hex') as HTMLInputElement;
    accentColor?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.settings.branding.accentColor = value;
      if (accentHex) accentHex.value = value;
      this.markDirty();
    });
    accentHex?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      if (validateColor(value)) {
        this.settings.branding.accentColor = value;
        if (accentColor) accentColor.value = value;
        this.clearError('accent-color-error');
      } else if (value.length === 7) {
        this.showError('accent-color-error', 'Invalid hex color (e.g., #7c3aed)');
      }
      this.markDirty();
    });

    // Custom CSS
    const cssInput = this.element.querySelector('#custom-css') as HTMLTextAreaElement;
    cssInput?.addEventListener('input', (e) => {
      this.settings.branding.customCss = (e.target as HTMLTextAreaElement).value;
      this.markDirty();
    });
  }

  private setupSecurityListeners(): void {
    const bindCheckbox = (id: string, key: keyof SecurityPolicySettings) => {
      const el = this.element.querySelector(`#${id}`) as HTMLInputElement;
      el?.addEventListener('change', (e) => {
        (this.settings.security as any)[key] = (e.target as HTMLInputElement).checked;
        this.markDirty();
      });
    };

    const bindNumber = (id: string, key: keyof SecurityPolicySettings) => {
      const el = this.element.querySelector(`#${id}`) as HTMLInputElement;
      el?.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(value)) {
          (this.settings.security as any)[key] = value;
          this.markDirty();
        }
      });
    };

    bindCheckbox('enforce-sso', 'enforceSSO');
    bindCheckbox('require-mfa', 'requireMFA');
    bindCheckbox('require-uppercase', 'passwordRequireUppercase');
    bindCheckbox('require-numbers', 'passwordRequireNumbers');
    bindCheckbox('require-special', 'passwordRequireSpecialChars');
    bindNumber('password-min-length', 'passwordMinLength');
    bindNumber('max-login-attempts', 'maxLoginAttempts');
    bindNumber('session-timeout', 'sessionTimeoutMinutes');
    bindNumber('data-retention', 'dataRetentionDays');

    // Compliance mode
    const complianceSelect = this.element.querySelector('#compliance-mode') as HTMLSelectElement;
    complianceSelect?.addEventListener('change', (e) => {
      this.settings.security.complianceMode = (e.target as HTMLSelectElement).value as SecurityPolicySettings['complianceMode'];
      this.markDirty();
    });

    // IP allowlist
    this.element.querySelector('#add-ip')?.addEventListener('click', () => this.handleAddIp());
    this.element.querySelectorAll('.remove-ip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = (e.target as HTMLElement).closest('[data-ip-index]') as HTMLElement;
        const index = parseInt(row.dataset.ipIndex || '0', 10);
        this.settings.security.ipAllowlist.splice(index, 1);
        this.markDirty();
        this.render();
      });
    });
    this.element.querySelectorAll('.ip-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const row = (e.target as HTMLElement).closest('[data-ip-index]') as HTMLElement;
        const index = parseInt(row.dataset.ipIndex || '0', 10);
        this.settings.security.ipAllowlist[index] = (e.target as HTMLInputElement).value;
        this.markDirty();
      });
    });
  }
