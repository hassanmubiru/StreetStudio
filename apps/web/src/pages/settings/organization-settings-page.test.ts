/**
 * Organization Settings Page Tests
 *
 * Tests for branding customization, security policy configuration,
 * storage quota management, and integration configuration.
 *
 * Validates: Requirements 8.6, 8.10
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OrganizationSettingsPage,
  validateLogoFile,
  validateColor,
  validateIpAddress,
  validateWebhookUrl,
  createSecurityValidator,
  createDefaultBrandingSettings,
  createDefaultSecuritySettings,
  createDefaultStorageSettings,
  createDefaultIntegrationSettings,
  LOGO_MAX_SIZE,
  LOGO_ALLOWED_TYPES,
  COLOR_PATTERN,
  CUSTOM_CSS_MAX_LENGTH,
  MAX_WEBHOOK_ENDPOINTS,
  STORAGE_REGIONS,
  WEBHOOK_EVENTS,
  type OrganizationSettingsPageConfig,
  type OrganizationSettingsData,
  type BrandingSettings,
  type SecurityPolicySettings,
  type StorageSettings,
  type IntegrationSettings,
  type WebhookEndpoint,
} from './organization-settings-page.js';

// Mock crypto.randomUUID for test environment
if (!globalThis.crypto) {
  (globalThis as any).crypto = { randomUUID: () => 'test-uuid-1234' };
}

function createTestConfig(overrides?: Partial<OrganizationSettingsPageConfig>): OrganizationSettingsPageConfig {
  return {
    organizationId: 'org-123' as any,
    organizationName: 'Test Organization',
    isAdmin: true,
    ...overrides,
  };
}

function createTestConfigWithSettings(settings?: Partial<OrganizationSettingsData>): OrganizationSettingsPageConfig {
  return {
    organizationId: 'org-123' as any,
    organizationName: 'Test Organization',
    isAdmin: true,
    initialSettings: settings,
  };
}

describe('OrganizationSettingsPage', () => {
  let page: OrganizationSettingsPage;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    page?.destroy();
    document.body.removeChild(container);
  });

  describe('Initialization', () => {
    it('should create page element with correct structure', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-main-content')).toBe('');
      expect(el.getAttribute('data-page')).toBe('organization-settings');
      expect(el.querySelector('h1')?.textContent).toContain('Organization Settings');
    });

    it('should display organization name in subtitle', () => {
      page = new OrganizationSettingsPage(createTestConfig({ organizationName: 'Acme Corp' }));
      const el = page.getElement();

      expect(el.textContent).toContain('Acme Corp');
    });

    it('should render with default settings when no initial settings provided', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const settings = page.getSettings();

      expect(settings.branding).toEqual(createDefaultBrandingSettings());
      expect(settings.security).toEqual(createDefaultSecuritySettings());
      expect(settings.storage).toEqual(createDefaultStorageSettings());
      expect(settings.integrations).toEqual(createDefaultIntegrationSettings());
    });

    it('should start on branding tab by default', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      expect(page.getActiveTab()).toBe('branding');
    });

    it('should not be dirty on initial render', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      expect(page.isDirtyState()).toBe(false);
    });
  });

  describe('Tab Navigation', () => {
    it('should render all four tabs', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const tabs = el.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBe(4);

      const tabLabels = Array.from(tabs).map(t => t.textContent?.trim());
      expect(tabLabels).toContain('Branding');
      expect(tabLabels).toContain('Security');
      expect(tabLabels).toContain('Storage');
      expect(tabLabels).toContain('Integrations');
    });

    it('should mark branding tab as active by default', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const brandingTab = el.querySelector('#tab-branding');
      expect(brandingTab?.getAttribute('aria-selected')).toBe('true');
    });

    it('should switch tab when clicking a tab button', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const securityTab = el.querySelector('[data-tab="security"]') as HTMLButtonElement;
      securityTab.click();

      expect(page.getActiveTab()).toBe('security');
    });

    it('should update aria-selected on tab switch', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      page.switchTab('storage');

      const storageTab = el.querySelector('#tab-storage');
      expect(storageTab?.getAttribute('aria-selected')).toBe('true');
    });

    it('should show correct panel for active tab', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      page.switchTab('integrations');

      const panel = el.querySelector('#panel-integrations');
      expect(panel).toBeTruthy();
    });
  });

  describe('Branding Section', () => {
    it('should render logo upload area', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#logo-upload')).toBeTruthy();
      expect(el.querySelector('#logo-preview')).toBeTruthy();
    });

    it('should show "No logo" placeholder when no logo URL', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const preview = el.querySelector('#logo-preview');
      expect(preview?.textContent).toContain('No logo');
    });

    it('should show logo image when logoUrl is set', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        branding: { ...createDefaultBrandingSettings(), logoUrl: 'https://example.com/logo.png' },
      }));
      const el = page.getElement();
      container.appendChild(el);

      const img = el.querySelector('#logo-preview img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe('https://example.com/logo.png');
    });

    it('should render color pickers with default values', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const primaryColor = el.querySelector('#primary-color') as HTMLInputElement;
      const accentColor = el.querySelector('#accent-color') as HTMLInputElement;
      expect(primaryColor.value).toBe('#2563eb');
      expect(accentColor.value).toBe('#7c3aed');
    });

    it('should update primary color on color picker change', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const primaryColor = el.querySelector('#primary-color') as HTMLInputElement;
      primaryColor.value = '#ff0000';
      primaryColor.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.getSettings().branding.primaryColor).toBe('#ff0000');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should sync hex input with color picker', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const primaryColor = el.querySelector('#primary-color') as HTMLInputElement;
      primaryColor.value = '#00ff00';
      primaryColor.dispatchEvent(new Event('input', { bubbles: true }));

      const hexInput = el.querySelector('#primary-color-hex') as HTMLInputElement;
      expect(hexInput.value).toBe('#00ff00');
    });

    it('should show error for invalid hex color input', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const hexInput = el.querySelector('#primary-color-hex') as HTMLInputElement;
      hexInput.value = '#gggggg';
      hexInput.dispatchEvent(new Event('input', { bubbles: true }));

      const error = el.querySelector('#primary-color-error');
      expect(error?.textContent).toContain('Invalid hex color');
    });

    it('should render custom CSS textarea', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        branding: { ...createDefaultBrandingSettings(), customCss: '.test { color: red; }' },
      }));
      const el = page.getElement();
      container.appendChild(el);

      const textarea = el.querySelector('#custom-css') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toBe('.test { color: red; }');
      expect(textarea.getAttribute('maxlength')).toBe(String(CUSTOM_CSS_MAX_LENGTH));
    });

    it('should update custom CSS setting on input', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const textarea = el.querySelector('#custom-css') as HTMLTextAreaElement;
      textarea.value = 'body { background: blue; }';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.getSettings().branding.customCss).toBe('body { background: blue; }');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should validate logo file on upload', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);

      const input = el.querySelector('#logo-upload') as HTMLInputElement;
      const invalidFile = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
      Object.defineProperty(input, 'files', { value: [invalidFile] });
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const error = el.querySelector('#logo-error');
      expect(error?.textContent).toContain('not supported');
    });

    it('should show remove button when logo exists', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        branding: { ...createDefaultBrandingSettings(), logoUrl: 'https://example.com/logo.png' },
      }));
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#remove-logo')).toBeTruthy();
    });
  });

  describe('Security Section', () => {
    it('should render authentication policy controls', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      expect(el.querySelector('#enforce-sso')).toBeTruthy();
      expect(el.querySelector('#require-mfa')).toBeTruthy();
    });

    it('should render password policy fields', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      expect(el.querySelector('#password-min-length')).toBeTruthy();
      expect(el.querySelector('#max-login-attempts')).toBeTruthy();
      expect(el.querySelector('#require-uppercase')).toBeTruthy();
      expect(el.querySelector('#require-numbers')).toBeTruthy();
      expect(el.querySelector('#require-special')).toBeTruthy();
    });

    it('should render session and compliance controls', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      expect(el.querySelector('#session-timeout')).toBeTruthy();
      expect(el.querySelector('#data-retention')).toBeTruthy();
      expect(el.querySelector('#compliance-mode')).toBeTruthy();
    });

    it('should update enforce SSO on toggle', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      const checkbox = el.querySelector('#enforce-sso') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().security.enforceSSO).toBe(true);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should update password min length', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      const input = el.querySelector('#password-min-length') as HTMLInputElement;
      input.value = '12';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.getSettings().security.passwordMinLength).toBe(12);
    });

    it('should update compliance mode', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      const select = el.querySelector('#compliance-mode') as HTMLSelectElement;
      select.value = 'gdpr';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().security.complianceMode).toBe('gdpr');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should add IP address to allowlist', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      const addBtn = el.querySelector('#add-ip') as HTMLButtonElement;
      addBtn.click();

      expect(page.getSettings().security.ipAllowlist.length).toBe(1);
    });

    it('should render existing IP allowlist entries', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        security: { ...createDefaultSecuritySettings(), ipAllowlist: ['192.168.1.0/24', '10.0.0.1'] },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      const inputs = el.querySelectorAll('.ip-input');
      expect(inputs.length).toBe(2);
    });

    it('should remove IP from allowlist', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        security: { ...createDefaultSecuritySettings(), ipAllowlist: ['192.168.1.0/24'] },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      const removeBtn = el.querySelector('.remove-ip') as HTMLButtonElement;
      removeBtn.click();

      expect(page.getSettings().security.ipAllowlist.length).toBe(0);
    });

    it('should reflect initial security settings', () => {
      const customSecurity: SecurityPolicySettings = {
        ...createDefaultSecuritySettings(),
        enforceSSO: true,
        requireMFA: true,
        passwordMinLength: 14,
        sessionTimeoutMinutes: 120,
        complianceMode: 'hipaa',
      };
      page = new OrganizationSettingsPage(createTestConfigWithSettings({ security: customSecurity }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('security');

      expect((el.querySelector('#enforce-sso') as HTMLInputElement).checked).toBe(true);
      expect((el.querySelector('#require-mfa') as HTMLInputElement).checked).toBe(true);
      expect((el.querySelector('#password-min-length') as HTMLInputElement).value).toBe('14');
      expect((el.querySelector('#session-timeout') as HTMLInputElement).value).toBe('120');
      expect((el.querySelector('#compliance-mode') as HTMLSelectElement).value).toBe('hipaa');
    });
  });

  describe('Storage Section', () => {
    it('should display storage usage progress bar', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        storage: { ...createDefaultStorageSettings(), usedStorageGB: 75, storageQuotaGB: 100 },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const progressBar = el.querySelector('[role="progressbar"]');
      expect(progressBar).toBeTruthy();
      expect(progressBar?.getAttribute('aria-valuenow')).toBe('75');
      expect(progressBar?.getAttribute('aria-valuemax')).toBe('100');
    });

    it('should show correct usage percentage text', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        storage: { ...createDefaultStorageSettings(), usedStorageGB: 50, storageQuotaGB: 100 },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      expect(el.textContent).toContain('50.0 GB used');
      expect(el.textContent).toContain('100 GB quota');
      expect(el.textContent).toContain('50%');
    });

    it('should show amber progress bar when usage exceeds 70%', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        storage: { ...createDefaultStorageSettings(), usedStorageGB: 80, storageQuotaGB: 100 },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const bar = el.querySelector('[role="progressbar"] div');
      expect(bar?.className).toContain('bg-amber-500');
    });

    it('should show red progress bar when usage exceeds 90%', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        storage: { ...createDefaultStorageSettings(), usedStorageGB: 95, storageQuotaGB: 100 },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const bar = el.querySelector('[role="progressbar"] div');
      expect(bar?.className).toContain('bg-red-500');
    });

    it('should render retention policy select', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const select = el.querySelector('#retention-policy') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.value).toBe('indefinite');
    });

    it('should update retention policy on change', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const select = el.querySelector('#retention-policy') as HTMLSelectElement;
      select.value = '90days';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().storage.retentionPolicy).toBe('90days');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should render preferred region select with all regions', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const select = el.querySelector('#preferred-region') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.options.length).toBe(STORAGE_REGIONS.length);
    });

    it('should update preferred region on change', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const select = el.querySelector('#preferred-region') as HTMLSelectElement;
      select.value = 'eu-west-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().storage.preferredRegion).toBe('eu-west-1');
    });

    it('should toggle auto-delete originals setting', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('storage');

      const checkbox = el.querySelector('#auto-delete-originals') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().storage.autoDeleteProcessedOriginals).toBe(true);
      expect(page.isDirtyState()).toBe(true);
    });
  });

  describe('Integrations Section', () => {
    it('should render Slack integration controls', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      expect(el.querySelector('#slack-enabled')).toBeTruthy();
      expect(el.querySelector('#slack-webhook-url')).toBeTruthy();
    });

    it('should render Teams integration controls', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      expect(el.querySelector('#teams-enabled')).toBeTruthy();
      expect(el.querySelector('#teams-webhook-url')).toBeTruthy();
    });

    it('should disable webhook URL input when Slack is disabled', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const urlInput = el.querySelector('#slack-webhook-url') as HTMLInputElement;
      expect(urlInput.disabled).toBe(true);
    });

    it('should enable webhook URL input when Slack is enabled', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        integrations: { ...createDefaultIntegrationSettings(), slackEnabled: true },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const urlInput = el.querySelector('#slack-webhook-url') as HTMLInputElement;
      expect(urlInput.disabled).toBe(false);
    });

    it('should toggle Slack enabled and update URL input state', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const checkbox = el.querySelector('#slack-enabled') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().integrations.slackEnabled).toBe(true);
      const urlInput = el.querySelector('#slack-webhook-url') as HTMLInputElement;
      expect(urlInput.disabled).toBe(false);
    });

    it('should update Slack webhook URL', () => {
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        integrations: { ...createDefaultIntegrationSettings(), slackEnabled: true },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const urlInput = el.querySelector('#slack-webhook-url') as HTMLInputElement;
      urlInput.value = 'https://hooks.slack.com/services/T01/B01/xxxx';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.getSettings().integrations.slackWebhookUrl).toBe('https://hooks.slack.com/services/T01/B01/xxxx');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should render SSO configuration fields', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      expect(el.querySelector('#sso-provider')).toBeTruthy();
      expect(el.querySelector('#sso-entity-id')).toBeTruthy();
      expect(el.querySelector('#sso-metadata-url')).toBeTruthy();
    });

    it('should update SSO provider selection', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const select = el.querySelector('#sso-provider') as HTMLSelectElement;
      select.value = 'okta';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getSettings().integrations.ssoProvider).toBe('okta');
      expect(page.isDirtyState()).toBe(true);
    });

    it('should display existing webhook endpoints in table', () => {
      const webhooks: WebhookEndpoint[] = [
        { id: '1', url: 'https://example.com/hook', events: ['video.uploaded'], active: true },
        { id: '2', url: 'https://other.com/hook', events: ['comment.created', 'member.joined'], active: false },
      ];
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        integrations: { ...createDefaultIntegrationSettings(), webhookEndpoints: webhooks },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const rows = el.querySelectorAll('[data-webhook-index]');
      expect(rows.length).toBe(2);
    });

    it('should add a new webhook endpoint', () => {
      page = new OrganizationSettingsPage(createTestConfig());
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const addBtn = el.querySelector('#add-webhook') as HTMLButtonElement;
      addBtn.click();

      expect(page.getSettings().integrations.webhookEndpoints.length).toBe(1);
      expect(page.isDirtyState()).toBe(true);
    });

    it('should remove a webhook endpoint', () => {
      const webhooks: WebhookEndpoint[] = [
        { id: '1', url: 'https://example.com/hook', events: ['video.uploaded'], active: true },
      ];
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        integrations: { ...createDefaultIntegrationSettings(), webhookEndpoints: webhooks },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      const removeBtn = el.querySelector('.remove-webhook') as HTMLButtonElement;
      removeBtn.click();

      expect(page.getSettings().integrations.webhookEndpoints.length).toBe(0);
    });

    it('should not show add button when max webhooks reached', () => {
      const webhooks: WebhookEndpoint[] = Array.from({ length: MAX_WEBHOOK_ENDPOINTS }, (_, i) => ({
        id: String(i), url: `https://hook${i}.com`, events: ['video.uploaded'], active: true,
      }));
      page = new OrganizationSettingsPage(createTestConfigWithSettings({
        integrations: { ...createDefaultIntegrationSettings(), webhookEndpoints: webhooks },
      }));
      const el = page.getElement();
      container.appendChild(el);
      page.switchTab('integrations');

      expect(el.querySelector('#add-webhook')).toBeFalsy();
    });
  });
