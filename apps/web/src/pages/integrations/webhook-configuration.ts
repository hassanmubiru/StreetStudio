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
