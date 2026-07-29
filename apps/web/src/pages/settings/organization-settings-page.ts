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
