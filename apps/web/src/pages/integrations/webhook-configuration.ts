/**
 * Webhook Configuration Interface
 *
 * Provides webhook endpoint management, event selection and filtering,
 * delivery status monitoring with retry configuration, and webhook
 * testing/validation tools.
 *
 * Requirements: 15.2
 */

// --- Types ---

export type Uuid = string;

export type WebhookEventType =
  | 'video.created'
  | 'video.ready'
  | 'video.failed'
  | 'comment.created'
  | 'comment.mention'
  | 'member.invited'
  | 'member.joined'
  | 'share.created'
  | 'share.accessed';

export type WebhookStatus = 'active' | 'paused' | 'failing';

export type DeliveryStatus = 'success' | 'failed' | 'pending';

export interface WebhookEndpoint {
  id: Uuid;
  url: string;
  description: string;
  events: WebhookEventType[];
  status: WebhookStatus;
  secret: string;
  createdAt: string;
  lastDeliveryAt?: string;
  maxRetries: number;
  retryIntervalSeconds: number;
}

export interface WebhookDelivery {
  id: Uuid;
  webhookId: Uuid;
  eventType: WebhookEventType;
  status: DeliveryStatus;
  statusCode?: number;
  responseTimeMs?: number;
  attemptCount: number;
  timestamp: string;
  nextRetryAt?: string;
  payload?: string;
}

export interface TestWebhookResponse {
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  error?: string;
}

export interface CreateWebhookRequest {
  url: string;
  description: string;
  events: WebhookEventType[];
  maxRetries: number;
  retryIntervalSeconds: number;
}

export interface UpdateWebhookRequest {
  url?: string;
  description?: string;
  events?: WebhookEventType[];
  status?: WebhookStatus;
  maxRetries?: number;
  retryIntervalSeconds?: number;
}

export interface WebhookConfigurationCallbacks {
  onCreateWebhook: (request: CreateWebhookRequest) => Promise<WebhookEndpoint>;
  onUpdateWebhook: (id: Uuid, request: UpdateWebhookRequest) => Promise<WebhookEndpoint>;
  onDeleteWebhook: (id: Uuid) => Promise<boolean>;
  onTestWebhook: (id: Uuid) => Promise<TestWebhookResponse>;
  onFetchDeliveries: (webhookId: Uuid) => Promise<WebhookDelivery[]>;
}

export interface WebhookConfigurationOptions {
  webhooks?: WebhookEndpoint[];
  deliveries?: WebhookDelivery[];
  callbacks?: Partial<WebhookConfigurationCallbacks>;
}

// --- Constants ---

export const AVAILABLE_EVENTS: { type: WebhookEventType; label: string; description: string; category: string }[] = [
  { type: 'video.created', label: 'Video Created', description: 'When a new video is uploaded', category: 'Videos' },
  { type: 'video.ready', label: 'Video Ready', description: 'When video processing completes', category: 'Videos' },
  { type: 'video.failed', label: 'Video Failed', description: 'When video processing fails', category: 'Videos' },
  { type: 'comment.created', label: 'Comment Created', description: 'When a new comment is posted', category: 'Comments' },
  { type: 'comment.mention', label: 'Comment Mention', description: 'When someone is mentioned in a comment', category: 'Comments' },
  { type: 'member.invited', label: 'Member Invited', description: 'When a member is invited to the organization', category: 'Members' },
  { type: 'member.joined', label: 'Member Joined', description: 'When a member joins the organization', category: 'Members' },
  { type: 'share.created', label: 'Share Created', description: 'When a new share link is created', category: 'Sharing' },
  { type: 'share.accessed', label: 'Share Accessed', description: 'When a share link is accessed', category: 'Sharing' },
];

export const RETRY_OPTIONS = [
  { value: 0, label: 'No retries' },
  { value: 3, label: '3 retries' },
  { value: 5, label: '5 retries' },
  { value: 10, label: '10 retries' },
];

export const RETRY_INTERVAL_OPTIONS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
];

export const WEBHOOK_URL_MAX_LENGTH = 2048;
export const WEBHOOK_DESCRIPTION_MAX_LENGTH = 256;

// --- Utility Functions ---

/**
 * Validate a webhook endpoint URL.
 * Must be a valid HTTPS URL within length limits.
 */
export function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Endpoint URL is required' };
  }
  if (trimmed.length > WEBHOOK_URL_MAX_LENGTH) {
    return { valid: false, error: `URL must be ${WEBHOOK_URL_MAX_LENGTH} characters or fewer` };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS protocol' };
    }
  } catch {
    return { valid: false, error: 'Please enter a valid URL' };
  }
  return { valid: true };
}

/**
 * Format a delivery timestamp for display.
 */
export function formatDeliveryTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get CSS class for delivery status badge.
 */
export function getDeliveryStatusColor(status: DeliveryStatus): string {
  switch (status) {
    case 'success': return 'bg-green-100 text-green-800';
    case 'failed': return 'bg-red-100 text-red-800';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Get CSS class for webhook status badge.
 */
export function getWebhookStatusColor(status: WebhookStatus): string {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800';
    case 'paused': return 'bg-gray-100 text-gray-600';
    case 'failing': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Get a human-readable label for an event type.
 */
export function getEventLabel(eventType: WebhookEventType): string {
  const event = AVAILABLE_EVENTS.find(e => e.type === eventType);
  return event?.label ?? eventType;
}

/**
 * Filter events by category.
 */
export function getEventsByCategory(): Map<string, typeof AVAILABLE_EVENTS> {
  const map = new Map<string, typeof AVAILABLE_EVENTS>();
  for (const event of AVAILABLE_EVENTS) {
    if (!map.has(event.category)) {
      map.set(event.category, []);
    }
    map.get(event.category)!.push(event);
  }
  return map;
}

// --- Component ---

export class WebhookConfigurationPage {
  private element: HTMLElement;
  private webhooks: WebhookEndpoint[];
  private deliveries: WebhookDelivery[];
  private callbacks: Partial<WebhookConfigurationCallbacks>;
  private showCreateForm = false;
  private editingWebhookId: Uuid | null = null;
  private viewingDeliveriesId: Uuid | null = null;
  private confirmDeleteId: Uuid | null = null;
  private testResult: TestWebhookResponse | null = null;
  private testingWebhookId: Uuid | null = null;
  private eventFilter: string = '';
  private createFormData: {
    url: string;
    description: string;
    events: Set<WebhookEventType>;
    maxRetries: number;
    retryIntervalSeconds: number;
  } = {
    url: '',
    description: '',
    events: new Set(),
    maxRetries: 5,
    retryIntervalSeconds: 60,
  };

  constructor(options: WebhookConfigurationOptions = {}) {
    this.webhooks = options.webhooks ?? [];
    this.deliveries = options.deliveries ?? [];
    this.callbacks = options.callbacks ?? {};
    this.element = document.createElement('div');
    this.element.setAttribute('data-page', 'webhook-configuration');
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getWebhooks(): WebhookEndpoint[] {
    return [...this.webhooks];
  }

  public getDeliveries(): WebhookDelivery[] {
    return [...this.deliveries];
  }

  public isCreateFormVisible(): boolean {
    return this.showCreateForm;
  }

  public getEditingWebhookId(): Uuid | null {
    return this.editingWebhookId;
  }

  public getViewingDeliveriesId(): Uuid | null {
    return this.viewingDeliveriesId;
  }

  public getTestResult(): TestWebhookResponse | null {
    return this.testResult;
  }

  public getCreateFormData(): {
    url: string;
    description: string;
    events: WebhookEventType[];
    maxRetries: number;
    retryIntervalSeconds: number;
  } {
    return {
      url: this.createFormData.url,
      description: this.createFormData.description,
      events: Array.from(this.createFormData.events),
      maxRetries: this.createFormData.maxRetries,
      retryIntervalSeconds: this.createFormData.retryIntervalSeconds,
    };
  }

  public updateWebhooks(webhooks: WebhookEndpoint[]): void {
    this.webhooks = webhooks;
    this.render();
  }

  public updateDeliveries(deliveries: WebhookDelivery[]): void {
    this.deliveries = deliveries;
    this.render();
  }

  public showCreate(): void {
    this.showCreateForm = true;
    this.editingWebhookId = null;
    this.createFormData = {
      url: '',
      description: '',
      events: new Set(),
      maxRetries: 5,
      retryIntervalSeconds: 60,
    };
    this.render();
  }

  public hideCreate(): void {
    this.showCreateForm = false;
    this.editingWebhookId = null;
    this.render();
  }

  public startEdit(webhookId: Uuid): void {
    const webhook = this.webhooks.find(w => w.id === webhookId);
    if (!webhook) return;
    this.editingWebhookId = webhookId;
    this.showCreateForm = false;
    this.createFormData = {
      url: webhook.url,
      description: webhook.description,
      events: new Set(webhook.events),
      maxRetries: webhook.maxRetries,
      retryIntervalSeconds: webhook.retryIntervalSeconds,
    };
    this.render();
  }

  public cancelEdit(): void {
    this.editingWebhookId = null;
    this.render();
  }

  public async createWebhook(): Promise<void> {
    const urlValidation = validateWebhookUrl(this.createFormData.url);
    if (!urlValidation.valid) {
      this.showError('url-error', urlValidation.error!);
      return;
    }
    if (this.createFormData.events.size === 0) {
      this.showError('events-error', 'Select at least one event type');
      return;
    }

    const request: CreateWebhookRequest = {
      url: this.createFormData.url.trim(),
      description: this.createFormData.description.trim(),
      events: Array.from(this.createFormData.events),
      maxRetries: this.createFormData.maxRetries,
      retryIntervalSeconds: this.createFormData.retryIntervalSeconds,
    };

    if (this.callbacks.onCreateWebhook) {
      try {
        const webhook = await this.callbacks.onCreateWebhook(request);
        this.webhooks = [...this.webhooks, webhook];
        this.showCreateForm = false;
        this.render();
      } catch (error) {
        this.showError('create-error', 'Failed to create webhook. Please try again.');
      }
    }
  }

  public async updateWebhook(webhookId: Uuid): Promise<void> {
    const urlValidation = validateWebhookUrl(this.createFormData.url);
    if (!urlValidation.valid) {
      this.showError('url-error', urlValidation.error!);
      return;
    }
    if (this.createFormData.events.size === 0) {
      this.showError('events-error', 'Select at least one event type');
      return;
    }

    const request: UpdateWebhookRequest = {
      url: this.createFormData.url.trim(),
      description: this.createFormData.description.trim(),
      events: Array.from(this.createFormData.events),
      maxRetries: this.createFormData.maxRetries,
      retryIntervalSeconds: this.createFormData.retryIntervalSeconds,
    };

    if (this.callbacks.onUpdateWebhook) {
      try {
        const updated = await this.callbacks.onUpdateWebhook(webhookId, request);
        this.webhooks = this.webhooks.map(w => w.id === webhookId ? updated : w);
        this.editingWebhookId = null;
        this.render();
      } catch (error) {
        this.showError('update-error', 'Failed to update webhook. Please try again.');
      }
    }
  }

  public async deleteWebhook(webhookId: Uuid): Promise<void> {
    if (this.callbacks.onDeleteWebhook) {
      try {
        const success = await this.callbacks.onDeleteWebhook(webhookId);
        if (success) {
          this.webhooks = this.webhooks.filter(w => w.id !== webhookId);
          this.confirmDeleteId = null;
          this.render();
        }
      } catch (error) {
        this.showError(`delete-error-${webhookId}`, 'Failed to delete webhook.');
      }
    }
  }

  public async testWebhook(webhookId: Uuid): Promise<void> {
    this.testingWebhookId = webhookId;
    this.testResult = null;
    this.render();

    if (this.callbacks.onTestWebhook) {
      try {
        const result = await this.callbacks.onTestWebhook(webhookId);
        this.testResult = result;
        this.testingWebhookId = null;
        this.render();
      } catch (error) {
        this.testResult = { success: false, error: 'Test request failed' };
        this.testingWebhookId = null;
        this.render();
      }
    }
  }

  public async viewDeliveries(webhookId: Uuid): Promise<void> {
    this.viewingDeliveriesId = webhookId;
    if (this.callbacks.onFetchDeliveries) {
      try {
        this.deliveries = await this.callbacks.onFetchDeliveries(webhookId);
      } catch {
        this.deliveries = [];
      }
    }
    this.render();
  }

  public hideDeliveries(): void {
    this.viewingDeliveriesId = null;
    this.deliveries = [];
    this.render();
  }

  public setEventFilter(filter: string): void {
    this.eventFilter = filter;
    this.render();
  }

  public dismissTestResult(): void {
    this.testResult = null;
    this.render();
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.webhooks = [];
    this.deliveries = [];
    this.callbacks = {};
  }

  // --- Private Rendering ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());

    if (this.testResult) {
      this.element.appendChild(this.renderTestResultBanner());
    }

    if (this.showCreateForm) {
      this.element.appendChild(this.renderWebhookForm('create'));
    }

    if (this.editingWebhookId) {
      this.element.appendChild(this.renderWebhookForm('edit'));
    }

    if (this.viewingDeliveriesId) {
      this.element.appendChild(this.renderDeliveryMonitor());
    }

    this.element.appendChild(this.renderWebhookList());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Webhooks</h1>
        <p class="text-sm text-gray-500 mt-1">Configure webhook endpoints to receive real-time event notifications</p>
      </div>
      <button
        id="btn-add-webhook"
        type="button"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Add new webhook endpoint"
        ${this.showCreateForm || this.editingWebhookId ? 'disabled' : ''}
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Add Webhook
      </button>
    `;
    return header;
  }

  private renderTestResultBanner(): HTMLElement {
    const banner = document.createElement('div');
    banner.id = 'test-result-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'polite');

    const isSuccess = this.testResult!.success;
    const bgClass = isSuccess ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    const textClass = isSuccess ? 'text-green-800' : 'text-red-800';
    const title = isSuccess ? 'Test Successful' : 'Test Failed';
    const details = isSuccess
      ? `Status: ${this.testResult!.statusCode ?? 200} — Response time: ${this.testResult!.responseTimeMs ?? 0}ms`
      : `Error: ${this.testResult!.error ?? 'No response received'}`;

    banner.className = `mb-6 p-4 border rounded-lg ${bgClass}`;
    banner.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <h3 class="text-sm font-medium ${textClass}">${title}</h3>
          <p class="text-sm ${textClass} mt-1">${this.escapeHtml(details)}</p>
        </div>
        <button
          id="btn-dismiss-test"
          type="button"
          class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 rounded"
          aria-label="Dismiss test result"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
    return banner;
  }

  private renderWebhookForm(mode: 'create' | 'edit'): HTMLElement {
    const form = document.createElement('section');
    form.id = 'webhook-form';
    form.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    form.setAttribute('aria-labelledby', 'webhook-form-heading');

    const heading = mode === 'create' ? 'Add Webhook Endpoint' : 'Edit Webhook Endpoint';
    const submitLabel = mode === 'create' ? 'Create Webhook' : 'Save Changes';
    const submitId = mode === 'create' ? 'btn-submit-create' : 'btn-submit-edit';
    const cancelId = mode === 'create' ? 'btn-cancel-create' : 'btn-cancel-edit';

    const eventCategories = getEventsByCategory();
    let filteredCategories: Map<string, typeof AVAILABLE_EVENTS>;
    if (this.eventFilter) {
      filteredCategories = new Map<string, typeof AVAILABLE_EVENTS>();
      for (const [cat, events] of eventCategories) {
        const filtered = events.filter(e =>
          e.label.toLowerCase().includes(this.eventFilter.toLowerCase()) ||
          e.type.toLowerCase().includes(this.eventFilter.toLowerCase())
        );
        if (filtered.length > 0) {
          filteredCategories.set(cat, filtered);
        }
      }
    } else {
      filteredCategories = eventCategories;
    }

    const eventsHtml = Array.from(filteredCategories.entries()).map(([category, events]) => `
      <fieldset class="mb-3">
        <legend class="text-sm font-medium text-gray-700 mb-1">${this.escapeHtml(category)}</legend>
        <div class="flex flex-wrap gap-3">
          ${events.map(e => `
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                class="event-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                value="${e.type}"
                ${this.createFormData.events.has(e.type) ? 'checked' : ''}
                aria-describedby="desc-${e.type.replace('.', '-')}"
              />
              <span class="text-sm text-gray-700">${this.escapeHtml(e.label)}</span>
              <span id="desc-${e.type.replace('.', '-')}" class="sr-only">${this.escapeHtml(e.description)}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
    `).join('');

    form.innerHTML = `
      <h2 id="webhook-form-heading" class="text-lg font-medium text-gray-900 mb-4">${heading}</h2>
      <div class="space-y-4">
        <div>
          <label for="webhook-url-input" class="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
          <input
            id="webhook-url-input"
            type="url"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="https://example.com/webhooks/streetstudio"
            maxlength="${WEBHOOK_URL_MAX_LENGTH}"
            value="${this.escapeHtml(this.createFormData.url)}"
            aria-required="true"
          />
          <p id="url-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <label for="webhook-description-input" class="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <input
            id="webhook-description-input"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="e.g. Production notification handler"
            maxlength="${WEBHOOK_DESCRIPTION_MAX_LENGTH}"
            value="${this.escapeHtml(this.createFormData.description)}"
          />
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-gray-700">Events</h3>
            <input
              id="event-filter-input"
              type="text"
              class="px-2 py-1 border border-gray-300 rounded text-xs w-40 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Filter events..."
              value="${this.escapeHtml(this.eventFilter)}"
              aria-label="Filter event types"
            />
          </div>
          <p class="text-xs text-gray-500 mb-3">Select which events should trigger this webhook</p>
          <div id="event-selection" role="group" aria-label="Webhook event types">
            ${eventsHtml}
          </div>
          <p id="events-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="retry-count-select" class="block text-sm font-medium text-gray-700 mb-1">Max Retries</label>
            <select
              id="retry-count-select"
              class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              aria-label="Maximum retry attempts"
            >
              ${RETRY_OPTIONS.map(opt => `
                <option value="${opt.value}" ${this.createFormData.maxRetries === opt.value ? 'selected' : ''}>
                  ${this.escapeHtml(opt.label)}
                </option>
              `).join('')}
            </select>
          </div>
          <div>
            <label for="retry-interval-select" class="block text-sm font-medium text-gray-700 mb-1">Retry Interval</label>
            <select
              id="retry-interval-select"
              class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              aria-label="Retry interval duration"
            >
              ${RETRY_INTERVAL_OPTIONS.map(opt => `
                <option value="${opt.value}" ${this.createFormData.retryIntervalSeconds === opt.value ? 'selected' : ''}>
                  ${this.escapeHtml(opt.label)}
                </option>
              `).join('')}
            </select>
          </div>
        </div>
        <p id="create-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <p id="update-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button
            id="${submitId}"
            type="button"
            class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >${submitLabel}</button>
          <button
            id="${cancelId}"
            type="button"
            class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >Cancel</button>
        </div>
      </div>
    `;
    return form;
  }

  private renderDeliveryMonitor(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'delivery-monitor';
    section.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    section.setAttribute('aria-labelledby', 'delivery-heading');

    const webhook = this.webhooks.find(w => w.id === this.viewingDeliveriesId);
    const webhookName = webhook ? webhook.url : 'Unknown';

    if (this.deliveries.length === 0) {
      section.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <h2 id="delivery-heading" class="text-lg font-medium text-gray-900">Recent Deliveries</h2>
          <button id="btn-close-deliveries" type="button" class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 rounded" aria-label="Close delivery monitor">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <p class="text-sm text-gray-500">No deliveries recorded for ${this.escapeHtml(webhookName)}</p>
      `;
      return section;
    }

    const deliveryRows = this.deliveries.map(d => {
      const statusColor = getDeliveryStatusColor(d.status);
      return `
        <tr data-delivery-id="${d.id}">
          <td class="px-4 py-3">
            <span class="text-sm text-gray-900">${this.escapeHtml(getEventLabel(d.eventType))}</span>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">
              ${d.status.charAt(0).toUpperCase() + d.status.slice(1)}
            </span>
          </td>
          <td class="px-4 py-3">
            <span class="text-sm text-gray-600">${d.statusCode ?? '—'}</span>
          </td>
          <td class="px-4 py-3">
            <span class="text-sm text-gray-600">${d.responseTimeMs != null ? `${d.responseTimeMs}ms` : '—'}</span>
          </td>
          <td class="px-4 py-3">
            <span class="text-sm text-gray-600">${d.attemptCount} attempt${d.attemptCount !== 1 ? 's' : ''}</span>
          </td>
          <td class="px-4 py-3">
            <span class="text-sm text-gray-600">${formatDeliveryTime(d.timestamp)}</span>
          </td>
        </tr>
      `;
    }).join('');

    section.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 id="delivery-heading" class="text-lg font-medium text-gray-900">Recent Deliveries</h2>
        <button id="btn-close-deliveries" type="button" class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 rounded" aria-label="Close delivery monitor">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-3">Showing deliveries for ${this.escapeHtml(webhookName)}</p>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200" role="table" aria-label="Webhook deliveries">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response Time</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempts</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${deliveryRows}
          </tbody>
        </table>
      </div>
    `;
    return section;
  }

  private renderWebhookList(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'webhook-list';
    section.setAttribute('aria-label', 'Webhook endpoints list');

    if (this.webhooks.length === 0) {
      section.innerHTML = `
        <div class="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
          <h3 class="mt-3 text-sm font-medium text-gray-900">No webhooks configured</h3>
          <p class="mt-1 text-sm text-gray-500">Add a webhook to start receiving event notifications.</p>
        </div>
      `;
      return section;
    }

    const webhookCards = this.webhooks.map(w => this.renderWebhookCard(w)).join('');
    section.innerHTML = `<div class="space-y-4">${webhookCards}</div>`;
    return section;
  }

  private renderWebhookCard(webhook: WebhookEndpoint): string {
    const statusColor = getWebhookStatusColor(webhook.status);
    const isTesting = this.testingWebhookId === webhook.id;
    const eventTags = webhook.events.map(e =>
      `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">${this.escapeHtml(getEventLabel(e))}</span>`
    ).join('');

    const confirmDeleteHtml = this.confirmDeleteId === webhook.id ? `
      <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded" role="alertdialog" aria-label="Confirm delete webhook">
        <p class="text-xs text-red-800 mb-2">Delete this webhook permanently? This cannot be undone.</p>
        <div class="flex gap-2">
          <button type="button" class="btn-confirm-delete px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500" data-webhook-id="${webhook.id}">Confirm Delete</button>
          <button type="button" class="btn-cancel-delete px-2 py-1 text-xs bg-white text-gray-700 border rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500" data-webhook-id="${webhook.id}">Cancel</button>
        </div>
      </div>
    ` : '';

    return `
      <div class="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors" data-webhook-id="${webhook.id}">
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <code class="text-sm font-mono text-gray-900 truncate" aria-label="Webhook endpoint URL">${this.escapeHtml(webhook.url)}</code>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">
                ${webhook.status.charAt(0).toUpperCase() + webhook.status.slice(1)}
              </span>
            </div>
            ${webhook.description ? `<p class="text-sm text-gray-500 mb-2">${this.escapeHtml(webhook.description)}</p>` : ''}
            <div class="flex flex-wrap gap-1 mb-2" aria-label="Subscribed events">
              ${eventTags}
            </div>
            <div class="flex items-center gap-4 text-xs text-gray-400">
              <span>Retries: ${webhook.maxRetries}</span>
              <span>Interval: ${webhook.retryIntervalSeconds}s</span>
              <span>Last delivery: ${formatDeliveryTime(webhook.lastDeliveryAt ?? '')}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 ml-4 flex-shrink-0">
            <button
              type="button"
              class="btn-test-webhook px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              data-webhook-id="${webhook.id}"
              aria-label="Send test event to ${this.escapeHtml(webhook.url)}"
              ${isTesting ? 'disabled' : ''}
            >${isTesting ? 'Testing...' : 'Test'}</button>
            <button
              type="button"
              class="btn-view-deliveries px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-webhook-id="${webhook.id}"
              aria-label="View deliveries for ${this.escapeHtml(webhook.url)}"
            >Deliveries</button>
            <button
              type="button"
              class="btn-edit-webhook px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
              data-webhook-id="${webhook.id}"
              aria-label="Edit webhook ${this.escapeHtml(webhook.url)}"
            >Edit</button>
            <button
              type="button"
              class="btn-delete-webhook px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              data-webhook-id="${webhook.id}"
              aria-label="Delete webhook ${this.escapeHtml(webhook.url)}"
            >Delete</button>
          </div>
        </div>
        ${confirmDeleteHtml}
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Add webhook button
    const addBtn = this.element.querySelector('#btn-add-webhook');
    addBtn?.addEventListener('click', () => this.showCreate());

    // Cancel create
    const cancelCreateBtn = this.element.querySelector('#btn-cancel-create');
    cancelCreateBtn?.addEventListener('click', () => this.hideCreate());

    // Cancel edit
    const cancelEditBtn = this.element.querySelector('#btn-cancel-edit');
    cancelEditBtn?.addEventListener('click', () => this.cancelEdit());

    // Submit create
    const submitCreateBtn = this.element.querySelector('#btn-submit-create');
    submitCreateBtn?.addEventListener('click', () => this.createWebhook());

    // Submit edit
    const submitEditBtn = this.element.querySelector('#btn-submit-edit');
    submitEditBtn?.addEventListener('click', () => {
      if (this.editingWebhookId) {
        this.updateWebhook(this.editingWebhookId);
      }
    });

    // URL input
    const urlInput = this.element.querySelector('#webhook-url-input') as HTMLInputElement | null;
    urlInput?.addEventListener('input', (e) => {
      this.createFormData.url = (e.target as HTMLInputElement).value;
      this.hideError('url-error');
    });

    // Description input
    const descInput = this.element.querySelector('#webhook-description-input') as HTMLInputElement | null;
    descInput?.addEventListener('input', (e) => {
      this.createFormData.description = (e.target as HTMLInputElement).value;
    });

    // Event filter input
    const filterInput = this.element.querySelector('#event-filter-input') as HTMLInputElement | null;
    filterInput?.addEventListener('input', (e) => {
      this.eventFilter = (e.target as HTMLInputElement).value;
      // Re-render just the events section without full re-render to preserve form state
      const eventSection = this.element.querySelector('#event-selection');
      if (eventSection) {
        const categories = getEventsByCategory();
        const filtered = new Map<string, typeof AVAILABLE_EVENTS>();
        if (this.eventFilter) {
          for (const [cat, events] of categories) {
            const matching = events.filter((ev: { label: string; type: string }) =>
              ev.label.toLowerCase().includes(this.eventFilter.toLowerCase()) ||
              ev.type.toLowerCase().includes(this.eventFilter.toLowerCase())
            );
            if (matching.length > 0) {
              filtered.set(cat, matching);
            }
          }
        } else {
          for (const [cat, events] of categories) {
            filtered.set(cat, events);
          }
        }

        eventSection.innerHTML = Array.from(filtered.entries()).map(([category, events]) => `
          <fieldset class="mb-3">
            <legend class="text-sm font-medium text-gray-700 mb-1">${this.escapeHtml(category)}</legend>
            <div class="flex flex-wrap gap-3">
              ${events.map(ev => `
                <label class="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    class="event-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    value="${ev.type}"
                    ${this.createFormData.events.has(ev.type) ? 'checked' : ''}
                    aria-describedby="desc-${ev.type.replace('.', '-')}"
                  />
                  <span class="text-sm text-gray-700">${this.escapeHtml(ev.label)}</span>
                  <span id="desc-${ev.type.replace('.', '-')}" class="sr-only">${this.escapeHtml(ev.description)}</span>
                </label>
              `).join('')}
            </div>
          </fieldset>
        `).join('');

        // Re-bind checkboxes
        eventSection.querySelectorAll('.event-checkbox').forEach(cb => {
          cb.addEventListener('change', (evt) => {
            const input = evt.target as HTMLInputElement;
            const eventType = input.value as WebhookEventType;
            if (input.checked) {
              this.createFormData.events.add(eventType);
            } else {
              this.createFormData.events.delete(eventType);
            }
            this.hideError('events-error');
          });
        });
      }
    });

    // Event checkboxes
    this.element.querySelectorAll('.event-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const eventType = input.value as WebhookEventType;
        if (input.checked) {
          this.createFormData.events.add(eventType);
        } else {
          this.createFormData.events.delete(eventType);
        }
        this.hideError('events-error');
      });
    });

    // Retry count select
    const retryCountSelect = this.element.querySelector('#retry-count-select') as HTMLSelectElement | null;
    retryCountSelect?.addEventListener('change', (e) => {
      this.createFormData.maxRetries = parseInt((e.target as HTMLSelectElement).value, 10);
    });

    // Retry interval select
    const retryIntervalSelect = this.element.querySelector('#retry-interval-select') as HTMLSelectElement | null;
    retryIntervalSelect?.addEventListener('change', (e) => {
      this.createFormData.retryIntervalSeconds = parseInt((e.target as HTMLSelectElement).value, 10);
    });

    // Dismiss test result
    const dismissTestBtn = this.element.querySelector('#btn-dismiss-test');
    dismissTestBtn?.addEventListener('click', () => this.dismissTestResult());

    // Close deliveries
    const closeDeliveriesBtn = this.element.querySelector('#btn-close-deliveries');
    closeDeliveriesBtn?.addEventListener('click', () => this.hideDeliveries());

    // Test buttons
    this.element.querySelectorAll('.btn-test-webhook').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const webhookId = (e.currentTarget as HTMLElement).dataset.webhookId!;
        this.testWebhook(webhookId);
      });
    });

    // View deliveries buttons
    this.element.querySelectorAll('.btn-view-deliveries').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const webhookId = (e.currentTarget as HTMLElement).dataset.webhookId!;
        this.viewDeliveries(webhookId);
      });
    });

    // Edit buttons
    this.element.querySelectorAll('.btn-edit-webhook').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const webhookId = (e.currentTarget as HTMLElement).dataset.webhookId!;
        this.startEdit(webhookId);
      });
    });

    // Delete buttons
    this.element.querySelectorAll('.btn-delete-webhook').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const webhookId = (e.currentTarget as HTMLElement).dataset.webhookId!;
        this.confirmDeleteId = webhookId;
        this.render();
      });
    });

    // Confirm delete
    this.element.querySelectorAll('.btn-confirm-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const webhookId = (e.currentTarget as HTMLElement).dataset.webhookId!;
        this.deleteWebhook(webhookId);
      });
    });

    // Cancel delete
    this.element.querySelectorAll('.btn-cancel-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        this.confirmDeleteId = null;
        this.render();
      });
    });
  }

  private showError(elementId: string, message: string): void {
    const el = this.element.querySelector(`#${elementId}`);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }

  private hideError(elementId: string): void {
    const el = this.element.querySelector(`#${elementId}`);
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
