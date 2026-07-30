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

function createShareLink(overrides?: Partial<ShareLink>): ShareLink {
  return {
    id: 'link-1',
    videoId: 'video-1',
    url: 'https://share.streetstudio.io/abc123',
    permission: 'public',
    createdAt: '2024-01-15T10:00:00Z',
    viewCount: 10,
    isActive: true,
    ...overrides,
  };
}

function createVideo(overrides?: Partial<VideoForExport>): VideoForExport {
  return {
    id: 'video-1',
    title: 'Integration Test Video',
    duration: 180,
    thumbnail: '/thumbs/vid-1.jpg',
    ...overrides,
  };
}

// --- Cross-Module Integration Tests ---

describe('Cross-Module Integration: API Key + Webhook Authentication', () => {
  describe('API key scopes affecting webhook operations', () => {
    it('should validate that webhook-relevant scopes exist in scope list', () => {
      // Webhooks respond to video, comment, member, and share events.
      // API keys must have matching read scopes to receive these webhook payloads.
      const scopeNames = AVAILABLE_SCOPES.map(s => s.scope);
      const webhookEventCategories = new Set(
        AVAILABLE_EVENTS.map(e => e.category.toLowerCase())
      );

      // Verify that for each webhook event category there's a matching read scope
      expect(webhookEventCategories.has('videos')).toBe(true);
      expect(scopeNames).toContain('read:videos');

      expect(webhookEventCategories.has('comments')).toBe(true);
      expect(scopeNames).toContain('read:comments');

      expect(webhookEventCategories.has('members')).toBe(true);
      expect(scopeNames).toContain('read:members');

      expect(webhookEventCategories.has('sharing')).toBe(true);
      // Sharing events correspond to videos scope since shares are on videos
      expect(scopeNames).toContain('read:videos');
    });
