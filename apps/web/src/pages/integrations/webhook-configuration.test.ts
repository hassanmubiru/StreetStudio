/**
 * Webhook Configuration Interface Tests
 *
 * Tests for endpoint management, event selection and filtering,
 * delivery status monitoring, retry configuration, and webhook
 * testing/validation tools.
 *
 * Validates: Requirements 15.2
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebhookConfigurationPage,
  validateWebhookUrl,
  formatDeliveryTime,
  getDeliveryStatusColor,
  getWebhookStatusColor,
  getEventLabel,
  getEventsByCategory,
  AVAILABLE_EVENTS,
  RETRY_OPTIONS,
  RETRY_INTERVAL_OPTIONS,
  WEBHOOK_URL_MAX_LENGTH,
  type WebhookEndpoint,
  type WebhookDelivery,
  type WebhookEventType,
  type TestWebhookResponse,
  type WebhookConfigurationCallbacks,
} from './webhook-configuration.js';

// --- Test Helpers ---

function createTestWebhook(overrides?: Partial<WebhookEndpoint>): WebhookEndpoint {
  return {
    id: 'wh-1',
    url: 'https://example.com/webhooks',
    description: 'Test webhook',
    events: ['video.created', 'video.ready'],
    status: 'active',
    secret: 'whsec_test123',
    createdAt: '2024-01-15T10:00:00Z',
    lastDeliveryAt: '2024-01-20T14:30:00Z',
    maxRetries: 5,
    retryIntervalSeconds: 60,
    ...overrides,
  };
}

function createTestDelivery(overrides?: Partial<WebhookDelivery>): WebhookDelivery {
  return {
    id: 'del-1',
    webhookId: 'wh-1',
    eventType: 'video.created',
    status: 'success',
    statusCode: 200,
    responseTimeMs: 150,
    attemptCount: 1,
    timestamp: '2024-01-20T14:30:00Z',
    ...overrides,
  };
}

function createMockCallbacks(): WebhookConfigurationCallbacks {
  return {
    onCreateWebhook: vi.fn().mockResolvedValue(
      createTestWebhook({ id: 'new-wh', url: 'https://new.example.com/hook' })
    ),
    onUpdateWebhook: vi.fn().mockImplementation((_id, req) =>
      Promise.resolve(createTestWebhook({ ...req }))
    ),
    onDeleteWebhook: vi.fn().mockResolvedValue(true),
    onTestWebhook: vi.fn().mockResolvedValue({
      success: true,
      statusCode: 200,
      responseTimeMs: 120,
    } as TestWebhookResponse),
    onFetchDeliveries: vi.fn().mockResolvedValue([
      createTestDelivery(),
      createTestDelivery({ id: 'del-2', status: 'failed', statusCode: 500 }),
    ]),
  };
}

describe('Utility Functions', () => {
  describe('validateWebhookUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(validateWebhookUrl('https://example.com/webhooks').valid).toBe(true);
      expect(validateWebhookUrl('https://api.service.io/v1/hooks').valid).toBe(true);
    });

    it('should reject empty URLs', () => {
      const result = validateWebhookUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject HTTP URLs', () => {
      const result = validateWebhookUrl('http://example.com/webhooks');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject invalid URLs', () => {
      const result = validateWebhookUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid URL');
    });

    it('should reject URLs exceeding max length', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(WEBHOOK_URL_MAX_LENGTH);
      const result = validateWebhookUrl(longUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('characters');
    });
  });

  describe('formatDeliveryTime', () => {
    it('should show Just now for recent timestamps', () => {
      const recent = new Date(Date.now() - 10000).toISOString();
      expect(formatDeliveryTime(recent)).toBe('Just now');
    });

    it('should show minutes for timestamps within an hour', () => {
      const fiveMin = new Date(Date.now() - 5 * 60000).toISOString();
      expect(formatDeliveryTime(fiveMin)).toBe('5m ago');
    });

    it('should show hours for timestamps within a day', () => {
      const threeHours = new Date(Date.now() - 3 * 3600000).toISOString();
      expect(formatDeliveryTime(threeHours)).toBe('3h ago');
    });

    it('should return Invalid date for bad input', () => {
      expect(formatDeliveryTime('not-a-date')).toBe('Invalid date');
    });
  });

  describe('getDeliveryStatusColor', () => {
    it('should return green for success', () => {
      expect(getDeliveryStatusColor('success')).toContain('green');
    });

    it('should return red for failed', () => {
      expect(getDeliveryStatusColor('failed')).toContain('red');
    });

    it('should return yellow for pending', () => {
      expect(getDeliveryStatusColor('pending')).toContain('yellow');
    });
  });

  describe('getWebhookStatusColor', () => {
    it('should return green for active', () => {
      expect(getWebhookStatusColor('active')).toContain('green');
    });

    it('should return gray for paused', () => {
      expect(getWebhookStatusColor('paused')).toContain('gray');
    });

    it('should return red for failing', () => {
      expect(getWebhookStatusColor('failing')).toContain('red');
    });
  });

  describe('getEventLabel', () => {
    it('should return human-readable label for known events', () => {
      expect(getEventLabel('video.created')).toBe('Video Created');
      expect(getEventLabel('comment.mention')).toBe('Comment Mention');
    });

    it('should return raw type for unknown events', () => {
      expect(getEventLabel('unknown.event' as WebhookEventType)).toBe('unknown.event');
    });
  });

  describe('getEventsByCategory', () => {
    it('should group events by category', () => {
      const categories = getEventsByCategory();
      expect(categories.has('Videos')).toBe(true);
      expect(categories.has('Comments')).toBe(true);
      expect(categories.has('Members')).toBe(true);
      expect(categories.has('Sharing')).toBe(true);
    });

    it('should have correct events in each category', () => {
      const categories = getEventsByCategory();
      const videos = categories.get('Videos')!;
      expect(videos.length).toBe(3);
      expect(videos.map(v => v.type)).toContain('video.created');
    });
  });
});

describe('WebhookConfigurationPage', () => {
  let page: WebhookConfigurationPage;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    page?.destroy();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('Initialization', () => {
    it('should create page element with correct attributes', () => {
      page = new WebhookConfigurationPage();
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-page')).toBe('webhook-configuration');
      expect(el.getAttribute('data-main-content')).toBe('');
    });

    it('should display heading and description', () => {
      page = new WebhookConfigurationPage();
      const el = page.getElement();

      expect(el.querySelector('h1')?.textContent).toContain('Webhooks');
      expect(el.textContent).toContain('event notifications');
    });

    it('should render Add Webhook button', () => {
      page = new WebhookConfigurationPage();
      const el = page.getElement();

      const btn = el.querySelector('#btn-add-webhook') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toContain('Add Webhook');
      expect(btn.getAttribute('aria-label')).toContain('Add new webhook');
    });

    it('should show empty state when no webhooks', () => {
      page = new WebhookConfigurationPage({ webhooks: [] });
      const el = page.getElement();

      expect(el.textContent).toContain('No webhooks configured');
      expect(el.textContent).toContain('Add a webhook');
    });
