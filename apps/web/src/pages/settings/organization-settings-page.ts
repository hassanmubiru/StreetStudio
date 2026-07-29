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
