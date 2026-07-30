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

// --- Shared Test Helpers ---

function createApiKey(overrides?: Partial<ApiKey>): ApiKey {
  return {
    id: 'key-1',
    name: 'Integration Key',
    prefix: 'sk_live',
    maskedKey: '••••••••••••wxyz',
    scopes: ['read:videos', 'write:videos'],
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    lastUsedAt: '2024-01-20T14:30:00Z',
    requestCount: 500,
    rateLimitPerHour: 1000,
    rateLimitRemaining: 800,
    ...overrides,
  };
}

function createWebhook(overrides?: Partial<WebhookEndpoint>): WebhookEndpoint {
  return {
    id: 'wh-1',
    url: 'https://api.example.com/webhooks',
    description: 'Integration webhook',
    events: ['video.created', 'share.created'],
    status: 'active',
    secret: 'whsec_integration_test',
    createdAt: '2024-01-15T10:00:00Z',
    lastDeliveryAt: '2024-01-20T14:30:00Z',
    maxRetries: 5,
    retryIntervalSeconds: 60,
    ...overrides,
  };
}

function createExportJob(overrides?: Partial<ExportJob>): ExportJob {
  return {
    id: 'job-1',
    videoId: 'video-1',
    videoTitle: 'Demo Recording',
    options: { format: 'mp4', quality: 'high', resolution: '1080p' },
    status: 'processing',
    progress: 50,
    estimatedTimeRemaining: 60,
    createdAt: '2024-01-20T10:00:00Z',
    ...overrides,
  };
}
