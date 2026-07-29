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
