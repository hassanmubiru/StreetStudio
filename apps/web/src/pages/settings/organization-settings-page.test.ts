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
