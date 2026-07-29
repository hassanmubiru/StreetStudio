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
