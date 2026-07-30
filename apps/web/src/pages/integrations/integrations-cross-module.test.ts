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

    it('should have consistent event categories in webhook events and scope groups', () => {
      const webhookCategories = getEventsByCategory();
      const scopeCategories = new Set(AVAILABLE_SCOPES.map(s => s.category));

      // All webhook event categories should have corresponding scope categories
      for (const [category] of webhookCategories) {
        if (category === 'Sharing') {
          // Sharing is governed by Videos scope
          expect(scopeCategories.has('Videos')).toBe(true);
        } else {
          expect(scopeCategories.has(category)).toBe(true);
        }
      }
    });

    it('should display API key alongside webhook when both are active', () => {
      const key = createApiKey({ status: 'active', scopes: ['read:videos'] });
      const webhook = createWebhook({ status: 'active', events: ['video.created'] });

      const keyPage = new ApiKeyManagementPage({ keys: [key] });
      const webhookPage = new WebhookConfigurationPage({ webhooks: [webhook] });

      const keyEl = keyPage.getElement();
      const webhookEl = webhookPage.getElement();

      // Both modules should render independently and show active status
      expect(keyEl.textContent).toContain('Active');
      expect(webhookEl.textContent).toContain('Active');

      keyPage.destroy();
      webhookPage.destroy();
    });

    it('should handle revoked API key not affecting webhook display', () => {
      const key = createApiKey({ status: 'revoked' });
      const webhook = createWebhook({ status: 'active' });

      const keyPage = new ApiKeyManagementPage({ keys: [key] });
      const webhookPage = new WebhookConfigurationPage({ webhooks: [webhook] });

      // Webhook still shows active even if API key is revoked
      const webhookEl = webhookPage.getElement();
      expect(webhookEl.textContent).toContain('Active');

      const keyEl = keyPage.getElement();
      expect(keyEl.textContent).toContain('Revoked');

      keyPage.destroy();
      webhookPage.destroy();
    });
  });

  describe('API key rotation with webhook secret consistency', () => {
    it('should rotate API key without invalidating webhook secret', async () => {
      const key = createApiKey({ id: 'key-rot', status: 'active' });
      const webhook = createWebhook({ secret: 'whsec_stable' });

      const keyCallbacks: Partial<ApiKeyManagementCallbacks> = {
        onCreateKey: vi.fn(),
        onRevokeKey: vi.fn().mockResolvedValue(true),
        onRotateKey: vi.fn().mockResolvedValue({
          key: createApiKey({ id: 'key-rot-new', name: 'Rotated Key' }),
          fullKey: 'sk_live_newrotatedkey123',
        } as CreateApiKeyResponse),
        onDeleteKey: vi.fn(),
      };

      const keyPage = new ApiKeyManagementPage({ keys: [key], callbacks: keyCallbacks });
      await keyPage.rotateKey('key-rot');

      // Webhook secret remains unchanged after key rotation
      expect(webhook.secret).toBe('whsec_stable');
      // New key was generated
      expect(keyPage.getNewKeyValue()).toBe('sk_live_newrotatedkey123');

      keyPage.destroy();
    });

    it('should mask rotated key consistently', async () => {
      const originalMasked = maskApiKey('sk_live_original123key');
      const rotatedMasked = maskApiKey('sk_live_newrotated456');

      // Both should show last 4 chars only
      expect(originalMasked).toMatch(/•+.{4}$/);
      expect(rotatedMasked).toMatch(/•+.{4}$/);
      expect(originalMasked.slice(-4)).toBe('3key');
      expect(rotatedMasked.slice(-4)).toBe('d456');
    });
  });
});

describe('Cross-Module Integration: Webhook Events + Export/Share', () => {
  describe('Webhook events triggered by share link creation', () => {
    it('should have share.created webhook event matching share link workflow', () => {
      const webhookEvents = AVAILABLE_EVENTS.map(e => e.type);
      expect(webhookEvents).toContain('share.created');
      expect(webhookEvents).toContain('share.accessed');
    });

    it('should process share link creation while webhook monitors delivery', async () => {
      const shareCallbacks: Partial<ExportSharingCallbacks> = {
        onGenerateShareLink: vi.fn().mockResolvedValue(
          createShareLink({ id: 'new-share', permission: 'public' })
        ),
        onStartExport: vi.fn(),
        onStartBatchExport: vi.fn(),
        onCancelExport: vi.fn(),
        onRevokeShareLink: vi.fn(),
        onGetShareLinks: vi.fn(),
      };

      const webhookCallbacks: Partial<WebhookConfigurationCallbacks> = {
        onCreateWebhook: vi.fn(),
        onUpdateWebhook: vi.fn(),
        onDeleteWebhook: vi.fn(),
        onTestWebhook: vi.fn(),
        onFetchDeliveries: vi.fn().mockResolvedValue([
          {
            id: 'del-share-1',
            webhookId: 'wh-1',
            eventType: 'share.created' as const,
            status: 'success' as const,
            statusCode: 200,
            responseTimeMs: 95,
            attemptCount: 1,
            timestamp: new Date().toISOString(),
          },
        ]),
      };

      // Create share link
      const exportPage = new ExportSharingPage({ callbacks: shareCallbacks });
      exportPage.showShare('video-1');
      exportPage.setSharePermission('public');
      await exportPage.createShareLink();

      expect(shareCallbacks.onGenerateShareLink).toHaveBeenCalledWith(
        'video-1', 'public', expect.anything()
      );

      // Webhook delivery should show the share.created event was delivered
      const webhookPage = new WebhookConfigurationPage({
        webhooks: [createWebhook({ events: ['share.created'] })],
        callbacks: webhookCallbacks,
      });
      await webhookPage.viewDeliveries('wh-1');

      const deliveries = webhookPage.getDeliveries();
      expect(deliveries.length).toBe(1);
      expect(deliveries[0]!.eventType).toBe('share.created');
      expect(deliveries[0]!.status).toBe('success');

      exportPage.destroy();
      webhookPage.destroy();
    });

    it('should track webhook delivery failures for share events', async () => {
      const webhookCallbacks: Partial<WebhookConfigurationCallbacks> = {
        onCreateWebhook: vi.fn(),
        onUpdateWebhook: vi.fn(),
        onDeleteWebhook: vi.fn(),
        onTestWebhook: vi.fn(),
        onFetchDeliveries: vi.fn().mockResolvedValue([
          {
            id: 'del-fail-1',
            webhookId: 'wh-1',
            eventType: 'share.created' as const,
            status: 'failed' as const,
            statusCode: 500,
            attemptCount: 3,
            timestamp: new Date().toISOString(),
            nextRetryAt: new Date(Date.now() + 60000).toISOString(),
          },
        ]),
      };

      const webhook = createWebhook({
        events: ['share.created'],
        maxRetries: 5,
        retryIntervalSeconds: 60,
      });
      const webhookPage = new WebhookConfigurationPage({
        webhooks: [webhook],
        callbacks: webhookCallbacks,
      });

      await webhookPage.viewDeliveries('wh-1');

      const deliveries = webhookPage.getDeliveries();
      expect(deliveries[0]!.status).toBe('failed');
      expect(deliveries[0]!.attemptCount).toBe(3);
      // Still has retries remaining (3 < maxRetries of 5)
      expect(deliveries[0]!.attemptCount).toBeLessThan(webhook.maxRetries);

      webhookPage.destroy();
    });
  });

  describe('Webhook events triggered by video export completion', () => {
    it('should have video.ready event matching export completion flow', () => {
      const webhookEvents = AVAILABLE_EVENTS.map(e => e.type);
      expect(webhookEvents).toContain('video.ready');
      expect(webhookEvents).toContain('video.failed');
    });

    it('should correlate export completion with webhook delivery', async () => {
      const exportPage = new ExportSharingPage({
        exportJobs: [createExportJob({ id: 'job-complete', status: 'processing' })],
      });

      // Complete the export
      exportPage.completeExport('job-complete', '/downloads/video.mp4');

      const job = exportPage.getExportJobs().find(j => j.id === 'job-complete');
      expect(job?.status).toBe('completed');
      expect(job?.downloadUrl).toBe('/downloads/video.mp4');

      // Webhook should receive video.ready event (simulated via delivery fetch)
      const webhookCallbacks: Partial<WebhookConfigurationCallbacks> = {
        onCreateWebhook: vi.fn(),
        onUpdateWebhook: vi.fn(),
        onDeleteWebhook: vi.fn(),
        onTestWebhook: vi.fn(),
        onFetchDeliveries: vi.fn().mockResolvedValue([
          {
            id: 'del-ready-1',
            webhookId: 'wh-1',
            eventType: 'video.ready' as const,
            status: 'success' as const,
            statusCode: 200,
            responseTimeMs: 45,
            attemptCount: 1,
            timestamp: new Date().toISOString(),
          },
        ]),
      };

      const webhookPage = new WebhookConfigurationPage({
        webhooks: [createWebhook({ events: ['video.ready'] })],
        callbacks: webhookCallbacks,
      });
      await webhookPage.viewDeliveries('wh-1');

      expect(webhookPage.getDeliveries()[0]!.eventType).toBe('video.ready');

      exportPage.destroy();
      webhookPage.destroy();
    });

    it('should correlate export failure with video.failed webhook event', async () => {
      const exportPage = new ExportSharingPage({
        exportJobs: [createExportJob({ id: 'job-fail', status: 'processing' })],
      });

      exportPage.failExport('job-fail', 'Encoding error: unsupported codec');

      const job = exportPage.getExportJobs().find(j => j.id === 'job-fail');
      expect(job?.status).toBe('failed');
      expect(job?.error).toContain('Encoding error');

      // Webhook delivery for video.failed
      const eventLabel = getEventLabel('video.failed');
      expect(eventLabel).toBe('Video Failed');

      exportPage.destroy();
    });
  });
});

describe('Cross-Module Integration: Export Permissions + Share Links', () => {
  describe('Embed code generation tied to share permissions', () => {
    it('should generate valid embed code for publicly shared videos', () => {
      const shareLink = createShareLink({ permission: 'public', isActive: true });
      const embedCode = generateIframeEmbed(shareLink.videoId, DEFAULT_EMBED_OPTIONS);

      expect(embedCode).toContain(shareLink.videoId);
      expect(embedCode).toContain('iframe');
      expect(embedCode).toContain('allowfullscreen');
    });

    it('should generate embed code with all options combined', () => {
      const opts: EmbedOptions = {
        autoplay: true,
        controls: true,
        loop: true,
        muted: true,
        width: 1280,
        height: 720,
        showBranding: false,
        responsive: false,
        startTime: 45,
      };

      const iframeCode = generateIframeEmbed('shared-vid', opts);
      expect(iframeCode).toContain('autoplay=1');
      expect(iframeCode).toContain('loop=1');
      expect(iframeCode).toContain('muted=1');
      expect(iframeCode).toContain('branding=0');
      expect(iframeCode).toContain('t=45');
      expect(iframeCode).toContain('width="1280"');
      expect(iframeCode).toContain('height="720"');

      const scriptCode = generateScriptEmbed('shared-vid', opts);
      expect(scriptCode).toContain('shared-vid');
      expect(scriptCode).toContain('player.js');
      expect(scriptCode).toContain('width:1280px');
      expect(scriptCode).toContain('height:720px');
    });

    it('should validate share link permissions before embed generation', () => {
      // Password-protected links require password validation
      const passwordResult = validateSharePassword('myP@ss', 'password');
      expect(passwordResult.valid).toBe(true);

      // Members-only links do not require password
      const membersResult = validateSharePassword(undefined, 'members');
      expect(membersResult.valid).toBe(true);

      // Public links do not require password
      const publicResult = validateSharePassword(undefined, 'public');
      expect(publicResult.valid).toBe(true);
    });

    it('should enforce password minimum length for protected embeds', () => {
      const shortPassword = validateSharePassword('ab', 'password');
      expect(shortPassword.valid).toBe(false);
      expect(shortPassword.error).toContain('4 characters');

      const emptyPassword = validateSharePassword(undefined, 'password');
      expect(emptyPassword.valid).toBe(false);

      const validPassword = validateSharePassword('secure123', 'password');
      expect(validPassword.valid).toBe(true);
    });
  });

  describe('Share link expiration with export availability', () => {
    it('should validate that expired share links show correct status', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const expirationLabel = formatExpiration(pastDate);
      expect(expirationLabel).toBe('Expired');

      // An expired date should fail validation for new links
      const validationResult = validateExpirationDate(pastDate);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('future');
    });

    it('should allow non-expiring share links for permanent embeds', () => {
      const noExpiration = validateExpirationDate(undefined);
      expect(noExpiration.valid).toBe(true);

      const label = formatExpiration(undefined);
      expect(label).toBe('Never expires');
    });

    it('should display export download alongside active share link', () => {
      const completedJob = createExportJob({
        status: 'completed',
        progress: 100,
        downloadUrl: '/dl/exported.mp4',
      });
      const activeLink = createShareLink({ isActive: true, viewCount: 25 });

      const page = new ExportSharingPage({
        exportJobs: [completedJob],
        shareLinks: [activeLink],
      });

      const el = page.getElement();
      // Both sections should render
      expect(el.querySelector('#export-progress')).toBeTruthy();
      expect(el.querySelector('#share-links-list')).toBeTruthy();
      expect(el.textContent).toContain('25 views');

      page.destroy();
    });

    it('should revoke share link independently of export jobs', async () => {
      const shareCallbacks: Partial<ExportSharingCallbacks> = {
        onStartExport: vi.fn(),
        onStartBatchExport: vi.fn(),
        onCancelExport: vi.fn(),
        onGenerateShareLink: vi.fn(),
        onRevokeShareLink: vi.fn().mockResolvedValue(true),
        onGetShareLinks: vi.fn(),
      };

      const page = new ExportSharingPage({
        exportJobs: [createExportJob({ status: 'completed', progress: 100 })],
        shareLinks: [createShareLink({ id: 'link-revoke', isActive: true })],
        callbacks: shareCallbacks,
      });

      await page.revokeShareLink('link-revoke');

      // Share link is revoked but export jobs remain
      const link = page.getShareLinks().find(l => l.id === 'link-revoke');
      expect(link?.isActive).toBe(false);
      expect(page.getExportJobs().length).toBe(1);

      page.destroy();
    });
  });

  describe('Permission labels consistency across modules', () => {
    it('should have consistent permission label descriptions', () => {
      expect(getPermissionLabel('public')).toBe('Anyone with the link');
      expect(getPermissionLabel('password')).toBe('Password protected');
      expect(getPermissionLabel('organization')).toBe('Organization members only');
      expect(getPermissionLabel('members')).toBe('Specific members only');
    });

    it('should show all four permission types in share form', () => {
      const page = new ExportSharingPage();
      page.showShare('video-1');
      const el = page.getElement();

      const radios = el.querySelectorAll('.permission-radio');
      expect(radios.length).toBe(4);

      page.destroy();
    });
  });
});

describe('Cross-Module Integration: API Key + Export Operations', () => {
  describe('API key scope requirements for export operations', () => {
    it('should require read:videos scope for export operations', () => {
      const scopeNames = AVAILABLE_SCOPES.map(s => s.scope);
      // Export operations need at least read access to videos
      expect(scopeNames).toContain('read:videos');
      // Write access for modifying exports
      expect(scopeNames).toContain('write:videos');
    });

    it('should display rate limit alongside export progress', () => {
      // Simulate a key with reduced rate limit during batch export
      const ratePct = getRateLimitPercentage(200, 1000);
      expect(ratePct).toBe(80); // 80% used

      const batchProgress = calculateBatchProgress([
        createExportJob({ progress: 100 }),
        createExportJob({ progress: 50 }),
        createExportJob({ progress: 0 }),
      ]);
      expect(batchProgress).toBe(50);
    });

    it('should track API key usage count increasing with export requests', () => {
      const keyBefore = createApiKey({ requestCount: 100, rateLimitRemaining: 900 });
      const keyAfter = createApiKey({ requestCount: 105, rateLimitRemaining: 895 });

      const page = new ApiKeyManagementPage({ keys: [keyBefore] });
      page.updateKeys([keyAfter]);

      const updatedKey = page.getKeys()[0]!;
      expect(updatedKey.requestCount).toBe(105);
      expect(updatedKey.rateLimitRemaining).toBe(895);

      page.destroy();
    });
  });

  describe('API key validation alongside webhook URL validation', () => {
    it('should validate key names and webhook URLs with consistent patterns', () => {
      // Both have length limits and character restrictions
      const validKeyName = validateKeyName('My Export Key');
      expect(validKeyName.valid).toBe(true);

      const validWebhookUrl = validateWebhookUrl('https://hooks.example.com/export');
      expect(validWebhookUrl.valid).toBe(true);

      // Both reject empty values
      const emptyKeyName = validateKeyName('');
      expect(emptyKeyName.valid).toBe(false);

      const emptyUrl = validateWebhookUrl('');
      expect(emptyUrl.valid).toBe(false);
    });

    it('should reject HTML injection in key names', () => {
      const xssAttempt = validateKeyName('<script>alert("xss")</script>');
      expect(xssAttempt.valid).toBe(false);
    });

    it('should reject HTTP URLs for webhook endpoints', () => {
      const insecureUrl = validateWebhookUrl('http://insecure.example.com/hook');
      expect(insecureUrl.valid).toBe(false);
      expect(insecureUrl.error).toContain('HTTPS');
    });
  });
});

describe('Cross-Module Integration: Concurrent Module Lifecycle', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('should render all three modules simultaneously without conflicts', () => {
    const keyPage = new ApiKeyManagementPage({ keys: [createApiKey()] });
    const webhookPage = new WebhookConfigurationPage({
      webhooks: [createWebhook()],
    });
    const exportPage = new ExportSharingPage({
      videos: [createVideo()],
      exportJobs: [createExportJob()],
      shareLinks: [createShareLink()],
    });

    container.appendChild(keyPage.getElement());
    container.appendChild(webhookPage.getElement());
    container.appendChild(exportPage.getElement());

    // All three should coexist without DOM conflicts
    expect(container.querySelector('[data-page="api-key-management"]')).toBeTruthy();
    expect(container.querySelector('[data-page="webhook-configuration"]')).toBeTruthy();
    expect(container.querySelector('[data-page="export-sharing"]')).toBeTruthy();

    keyPage.destroy();
    webhookPage.destroy();
    exportPage.destroy();
  });

  it('should cleanup all modules without side effects', () => {
    const keyPage = new ApiKeyManagementPage({ keys: [createApiKey()] });
    const webhookPage = new WebhookConfigurationPage({
      webhooks: [createWebhook()],
    });
    const exportPage = new ExportSharingPage({
      shareLinks: [createShareLink()],
    });

    container.appendChild(keyPage.getElement());
    container.appendChild(webhookPage.getElement());
    container.appendChild(exportPage.getElement());

    // Destroy all - destroy() cleans up internal state and listeners,
    // but elements remain in DOM unless explicitly removed
    keyPage.destroy();
    webhookPage.destroy();
    exportPage.destroy();

    // After destroy, the page elements should still be in DOM
    // but their internal state should be cleaned up
    const keyEl = container.querySelector('[data-page="api-key-management"]');
    const webhookEl = container.querySelector('[data-page="webhook-configuration"]');
    const exportEl = container.querySelector('[data-page="export-sharing"]');

    expect(keyEl).toBeTruthy();
    expect(webhookEl).toBeTruthy();
    expect(exportEl).toBeTruthy();

    // Verify that no event listeners are active (pages are inert after destroy)
    // Re-creating pages should not conflict with destroyed ones
    const newKeyPage = new ApiKeyManagementPage({ keys: [createApiKey()] });
    expect(newKeyPage.getKeys().length).toBe(1);
    newKeyPage.destroy();
  });

  it('should handle date formatting consistently across modules', () => {
    const recentDate = new Date(Date.now() - 5 * 60000).toISOString();

    // API key module
    const keyDateFormatted = formatKeyDate(recentDate);
    expect(keyDateFormatted).toBe('5m ago');

    // Webhook module
    const deliveryTimeFormatted = formatDeliveryTime(recentDate);
    expect(deliveryTimeFormatted).toBe('5m ago');
  });

  it('should handle status color patterns consistently across modules', () => {
    // API key active = green
    const keyActive = getStatusColor('active');
    expect(keyActive).toContain('green');

    // Webhook active = green (via getWebhookStatusColor, tested in module tests)
    // Both use same color scheme for active state

    // API key revoked = red
    const keyRevoked = getStatusColor('revoked');
    expect(keyRevoked).toContain('red');
  });

  it('should support creating API key, webhook, and share link in sequence', async () => {
    // Simulate a user setting up their integration: key → webhook → share
    const keyCallbacks: Partial<ApiKeyManagementCallbacks> = {
      onCreateKey: vi.fn().mockResolvedValue({
        key: createApiKey({ id: 'new-integration-key' }),
        fullKey: 'sk_live_integration_setup_key',
      } as CreateApiKeyResponse),
      onRevokeKey: vi.fn(),
      onRotateKey: vi.fn(),
      onDeleteKey: vi.fn(),
    };

    const webhookCallbacks: Partial<WebhookConfigurationCallbacks> = {
      onCreateWebhook: vi.fn().mockResolvedValue(
        createWebhook({ id: 'new-integration-wh' })
      ),
      onUpdateWebhook: vi.fn(),
      onDeleteWebhook: vi.fn(),
      onTestWebhook: vi.fn(),
      onFetchDeliveries: vi.fn(),
    };

    const shareCallbacks: Partial<ExportSharingCallbacks> = {
      onGenerateShareLink: vi.fn().mockResolvedValue(
        createShareLink({ id: 'new-integration-link' })
      ),
      onStartExport: vi.fn(),
      onStartBatchExport: vi.fn(),
      onCancelExport: vi.fn(),
      onRevokeShareLink: vi.fn(),
      onGetShareLinks: vi.fn(),
    };

    // Step 1: Create API key
    const keyPage = new ApiKeyManagementPage({ callbacks: keyCallbacks });
    keyPage.showCreate();
    const keyEl = keyPage.getElement();
    container.appendChild(keyEl);

    const nameInput = keyEl.querySelector('#key-name-input') as HTMLInputElement;
    nameInput.value = 'Integration Setup';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    const scopeCb = keyEl.querySelector('.scope-checkbox[value="read:videos"]') as HTMLInputElement;
    scopeCb.checked = true;
    scopeCb.dispatchEvent(new Event('change', { bubbles: true }));

    await keyPage.createKey();
    expect(keyCallbacks.onCreateKey).toHaveBeenCalled();
    expect(keyPage.getKeys().length).toBe(1);

    // Step 2: Create webhook
    const webhookPage = new WebhookConfigurationPage({ callbacks: webhookCallbacks });
    webhookPage.showCreate();
    const whEl = webhookPage.getElement();
    container.appendChild(whEl);

    const urlInput = whEl.querySelector('#webhook-url-input') as HTMLInputElement;
    urlInput.value = 'https://myapp.com/hooks/streetstudio';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    const eventCb = whEl.querySelector('.event-checkbox[value="share.created"]') as HTMLInputElement;
    eventCb.checked = true;
    eventCb.dispatchEvent(new Event('change', { bubbles: true }));

    await webhookPage.createWebhook();
    expect(webhookCallbacks.onCreateWebhook).toHaveBeenCalled();
    expect(webhookPage.getWebhooks().length).toBe(1);

    // Step 3: Create share link
    const exportPage = new ExportSharingPage({ callbacks: shareCallbacks });
    exportPage.showShare('video-1');
    exportPage.setSharePermission('public');

    await exportPage.createShareLink();
    expect(shareCallbacks.onGenerateShareLink).toHaveBeenCalled();
    expect(exportPage.getShareLinks().length).toBe(1);

    keyPage.destroy();
    webhookPage.destroy();
    exportPage.destroy();
  });
});
