/**
 * Integration Tests - Cross-Module Concerns
 *
 * Tests cross-cutting interactions between API key management,
 * webhook configuration, and export/sharing modules.
 *
 * Validates: Requirements 15.1, 15.2, 15.3
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  ApiKeyManagementPage,
  maskApiKey,
  validateKeyName,
  getRateLimitPercentage,
  formatKeyDate,
  getStatusColor,
  AVAILABLE_SCOPES,
  type ApiKey,
  type ApiKeyScope,
  type CreateApiKeyResponse,
  type ApiKeyManagementCallbacks,
} from './api-key-management.js';

import {
  WebhookConfigurationPage,
  validateWebhookUrl,
  formatDeliveryTime,
  getEventsByCategory,
  getEventLabel,
  AVAILABLE_EVENTS,
  type WebhookEndpoint,
  type WebhookDelivery,
  type WebhookConfigurationCallbacks,
} from './webhook-configuration.js';

import {
  ExportSharingPage,
  generateIframeEmbed,
  generateScriptEmbed,
  validateExpirationDate,
  validateSharePassword,
  getPermissionLabel,
  formatExpiration,
  calculateBatchProgress,
  DEFAULT_EMBED_OPTIONS,
  DEFAULT_BASE_EMBED_URL,
  type ExportJob,
  type ShareLink,
  type VideoForExport,
  type EmbedOptions,
  type ExportSharingCallbacks,
} from './export-sharing.js';
