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

    it('should render webhook cards when webhooks exist', () => {
      const webhooks = [createTestWebhook()];
      page = new WebhookConfigurationPage({ webhooks });
      const el = page.getElement();

      const card = el.querySelector('[data-webhook-id="wh-1"]');
      expect(card).toBeTruthy();
    });
  });

  describe('Webhook Display', () => {
    it('should display webhook URL', () => {
      const webhook = createTestWebhook({ url: 'https://myapp.com/hooks' });
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('https://myapp.com/hooks');
    });

    it('should display webhook status badge', () => {
      const webhook = createTestWebhook({ status: 'active' });
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Active');
    });

    it('should display subscribed event tags', () => {
      const webhook = createTestWebhook({ events: ['video.created', 'comment.created'] });
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Video Created');
      expect(el.textContent).toContain('Comment Created');
    });

    it('should display retry configuration', () => {
      const webhook = createTestWebhook({ maxRetries: 5, retryIntervalSeconds: 60 });
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Retries: 5');
      expect(el.textContent).toContain('Interval: 60s');
    });

    it('should display description when provided', () => {
      const webhook = createTestWebhook({ description: 'Production handler' });
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Production handler');
    });
  });

  describe('Create Webhook Form', () => {
    it('should show form when Add Webhook button is clicked', () => {
      page = new WebhookConfigurationPage();
      const el = page.getElement();
      container.appendChild(el);

      const btn = el.querySelector('#btn-add-webhook') as HTMLButtonElement;
      btn.click();

      expect(page.isCreateFormVisible()).toBe(true);
      expect(el.querySelector('#webhook-form')).toBeTruthy();
    });

    it('should display URL input with required attribute', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const input = el.querySelector('#webhook-url-input') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.getAttribute('aria-required')).toBe('true');
      expect(input.type).toBe('url');
    });

    it('should display event checkboxes grouped by category', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const checkboxes = el.querySelectorAll('.event-checkbox');
      expect(checkboxes.length).toBe(AVAILABLE_EVENTS.length);

      const fieldsets = el.querySelectorAll('#event-selection fieldset');
      expect(fieldsets.length).toBeGreaterThan(0);
    });

    it('should display retry configuration selects', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const retrySelect = el.querySelector('#retry-count-select') as HTMLSelectElement;
      expect(retrySelect).toBeTruthy();
      expect(retrySelect.options.length).toBe(RETRY_OPTIONS.length);

      const intervalSelect = el.querySelector('#retry-interval-select') as HTMLSelectElement;
      expect(intervalSelect).toBeTruthy();
      expect(intervalSelect.options.length).toBe(RETRY_INTERVAL_OPTIONS.length);
    });

    it('should hide form when Cancel is clicked', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const cancelBtn = el.querySelector('#btn-cancel-create') as HTMLButtonElement;
      cancelBtn.click();

      expect(page.isCreateFormVisible()).toBe(false);
      expect(el.querySelector('#webhook-form')).toBeFalsy();
    });

    it('should update URL on input', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const input = el.querySelector('#webhook-url-input') as HTMLInputElement;
      input.value = 'https://test.com/hook';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(page.getCreateFormData().url).toBe('https://test.com/hook');
    });

    it('should toggle events on checkbox change', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const checkbox = el.querySelector('.event-checkbox[value="video.created"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getCreateFormData().events).toContain('video.created');

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(page.getCreateFormData().events).not.toContain('video.created');
    });

    it('should show error for empty URL on submit', () => {
      page = new WebhookConfigurationPage({ callbacks: createMockCallbacks() });
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const submitBtn = el.querySelector('#btn-submit-create') as HTMLButtonElement;
      submitBtn.click();

      const urlError = el.querySelector('#url-error');
      expect(urlError?.classList.contains('hidden')).toBe(false);
      expect(urlError?.textContent).toContain('required');
    });

    it('should show error when no events selected', () => {
      page = new WebhookConfigurationPage({ callbacks: createMockCallbacks() });
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      // Set URL but no events
      const input = el.querySelector('#webhook-url-input') as HTMLInputElement;
      input.value = 'https://example.com/hook';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const submitBtn = el.querySelector('#btn-submit-create') as HTMLButtonElement;
      submitBtn.click();

      const eventsError = el.querySelector('#events-error');
      expect(eventsError?.classList.contains('hidden')).toBe(false);
      expect(eventsError?.textContent).toContain('event type');
    });

    it('should display event filter input', () => {
      page = new WebhookConfigurationPage();
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const filterInput = el.querySelector('#event-filter-input') as HTMLInputElement;
      expect(filterInput).toBeTruthy();
      expect(filterInput.getAttribute('aria-label')).toContain('Filter event types');
    });
  });

  describe('Webhook Creation', () => {
    it('should call onCreateWebhook with form data', async () => {
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ callbacks });
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      // Fill URL
      const urlInput = el.querySelector('#webhook-url-input') as HTMLInputElement;
      urlInput.value = 'https://api.example.com/hooks';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Select event
      const checkbox = el.querySelector('.event-checkbox[value="video.created"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      await page.createWebhook();

      expect(callbacks.onCreateWebhook).toHaveBeenCalledWith({
        url: 'https://api.example.com/hooks',
        description: '',
        events: ['video.created'],
        maxRetries: 5,
        retryIntervalSeconds: 60,
      });
    });

    it('should add webhook to list after creation', async () => {
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ callbacks });
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const urlInput = el.querySelector('#webhook-url-input') as HTMLInputElement;
      urlInput.value = 'https://new.example.com/hook';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));

      const checkbox = el.querySelector('.event-checkbox[value="video.ready"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      await page.createWebhook();

      expect(page.getWebhooks().length).toBe(1);
      expect(page.isCreateFormVisible()).toBe(false);
    });

    it('should hide form after successful creation', async () => {
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ callbacks });
      page.showCreate();
      const el = page.getElement();
      container.appendChild(el);

      const urlInput = el.querySelector('#webhook-url-input') as HTMLInputElement;
      urlInput.value = 'https://example.com/hook';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));

      const checkbox = el.querySelector('.event-checkbox[value="video.created"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      await page.createWebhook();

      expect(page.isCreateFormVisible()).toBe(false);
    });
  });

  describe('Webhook Editing', () => {
    it('should populate form with webhook data when editing', () => {
      const webhook = createTestWebhook({
        url: 'https://edit.example.com/hook',
        events: ['video.created', 'comment.created'],
        maxRetries: 3,
      });
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      page.startEdit(webhook.id);

      const formData = page.getCreateFormData();
      expect(formData.url).toBe('https://edit.example.com/hook');
      expect(formData.events).toContain('video.created');
      expect(formData.events).toContain('comment.created');
      expect(formData.maxRetries).toBe(3);
    });

    it('should call onUpdateWebhook with updated data', async () => {
      const webhook = createTestWebhook();
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks });
      page.startEdit(webhook.id);
      const el = page.getElement();
      container.appendChild(el);

      // Change URL
      const urlInput = el.querySelector('#webhook-url-input') as HTMLInputElement;
      urlInput.value = 'https://updated.example.com/hook';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));

      await page.updateWebhook(webhook.id);

      expect(callbacks.onUpdateWebhook).toHaveBeenCalledWith(
        webhook.id,
        expect.objectContaining({ url: 'https://updated.example.com/hook' })
      );
    });

    it('should close edit form after successful update', async () => {
      const webhook = createTestWebhook();
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks });
      page.startEdit(webhook.id);

      await page.updateWebhook(webhook.id);

      expect(page.getEditingWebhookId()).toBeNull();
    });

    it('should cancel edit and restore view', () => {
      const webhook = createTestWebhook();
      page = new WebhookConfigurationPage({ webhooks: [webhook] });
      page.startEdit(webhook.id);

      expect(page.getEditingWebhookId()).toBe(webhook.id);

      page.cancelEdit();

      expect(page.getEditingWebhookId()).toBeNull();
    });
  });

  describe('Webhook Deletion', () => {
    it('should show confirmation dialog when delete is clicked', () => {
      const webhook = createTestWebhook();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks: createMockCallbacks() });
      const el = page.getElement();
      container.appendChild(el);

      const deleteBtn = el.querySelector('.btn-delete-webhook') as HTMLButtonElement;
      deleteBtn.click();

      expect(el.querySelector('[role="alertdialog"]')).toBeTruthy();
      expect(el.textContent).toContain('Delete this webhook permanently');
    });

    it('should call onDeleteWebhook when confirmed', async () => {
      const webhook = createTestWebhook({ id: 'wh-to-delete' });
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks });

      await page.deleteWebhook('wh-to-delete');

      expect(callbacks.onDeleteWebhook).toHaveBeenCalledWith('wh-to-delete');
    });

    it('should remove webhook from list after deletion', async () => {
      const webhook = createTestWebhook({ id: 'wh-to-delete' });
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks });

      await page.deleteWebhook('wh-to-delete');

      expect(page.getWebhooks().length).toBe(0);
    });
  });

  describe('Webhook Testing', () => {
    it('should call onTestWebhook callback', async () => {
      const webhook = createTestWebhook({ id: 'wh-test' });
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks });

      await page.testWebhook('wh-test');

      expect(callbacks.onTestWebhook).toHaveBeenCalledWith('wh-test');
    });

    it('should display success test result banner', async () => {
      const webhook = createTestWebhook();
      const callbacks = createMockCallbacks();
      page = new WebhookConfigurationPage({ webhooks: [webhook], callbacks });

      await page.testWebhook(webhook.id);

      const result = page.getTestResult();
      expect(result).toBeTruthy();
      expect(result!.success).toBe(true);
      expect(result!.statusCode).toBe(200);

      const el = page.getElement();
      expect(el.querySelector('#test-result-banner')).toBeTruthy();
      expect(el.textContent).toContain('Test Successful');
    });
