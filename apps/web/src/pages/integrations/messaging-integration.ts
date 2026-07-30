/**
 * Slack/Teams Notification and Sharing Integration
 *
 * Provides messaging platform connection (Slack, Microsoft Teams),
 * video notification delivery to channels, video sharing via messages,
 * and notification preference configuration.
 *
 * Requirements: 15.7
 */

// --- Types ---

export type Uuid = string;

export type MessagingPlatform = 'slack' | 'teams';

export type MessagingConnectionStatus = 'connected' | 'disconnected' | 'error';

export type NotificationEventType =
  | 'video.uploaded'
  | 'video.ready'
  | 'video.shared'
  | 'comment.created'
  | 'comment.mention'
  | 'recording.scheduled'
  | 'recording.started'
  | 'recording.completed';

export interface MessagingConnection {
  id: Uuid;
  platform: MessagingPlatform;
  workspaceName: string;
  status: MessagingConnectionStatus;
  connectedAt: string;
  connectedBy: string;
  botInstalled: boolean;
  error?: string;
}

export interface MessagingChannel {
  id: Uuid;
  connectionId: Uuid;
  name: string;
  isPrivate: boolean;
  memberCount: number;
}

export interface NotificationRule {
  id: Uuid;
  connectionId: Uuid;
  channelId: Uuid;
  channelName: string;
  events: NotificationEventType[];
  isActive: boolean;
  createdAt: string;
}

export interface ShareVideoRequest {
  videoId: Uuid;
  videoTitle: string;
  connectionId: Uuid;
  channelId: Uuid;
  message?: string;
}

export interface ShareVideoResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface CreateNotificationRuleRequest {
  connectionId: Uuid;
  channelId: Uuid;
  events: NotificationEventType[];
}

export interface UpdateNotificationRuleRequest {
  events?: NotificationEventType[];
  isActive?: boolean;
}

export interface MessagingIntegrationCallbacks {
  onConnectPlatform: (platform: MessagingPlatform) => Promise<MessagingConnection>;
  onDisconnectPlatform: (connectionId: Uuid) => Promise<boolean>;
  onFetchChannels: (connectionId: Uuid) => Promise<MessagingChannel[]>;
  onShareVideo: (request: ShareVideoRequest) => Promise<ShareVideoResponse>;
  onCreateRule: (request: CreateNotificationRuleRequest) => Promise<NotificationRule>;
  onUpdateRule: (ruleId: Uuid, request: UpdateNotificationRuleRequest) => Promise<NotificationRule>;
  onDeleteRule: (ruleId: Uuid) => Promise<boolean>;
}

export interface MessagingIntegrationOptions {
  connections?: MessagingConnection[];
  channels?: MessagingChannel[];
  rules?: NotificationRule[];
  callbacks?: Partial<MessagingIntegrationCallbacks>;
}

// --- Constants ---

export const MESSAGING_PLATFORMS: { platform: MessagingPlatform; label: string; description: string }[] = [
  { platform: 'slack', label: 'Slack', description: 'Send notifications and share videos in Slack channels' },
  { platform: 'teams', label: 'Microsoft Teams', description: 'Send notifications and share videos in Teams channels' },
];

export const NOTIFICATION_EVENTS: { type: NotificationEventType; label: string; description: string; category: string }[] = [
  { type: 'video.uploaded', label: 'Video Uploaded', description: 'When a new video is uploaded', category: 'Videos' },
  { type: 'video.ready', label: 'Video Ready', description: 'When video processing completes', category: 'Videos' },
  { type: 'video.shared', label: 'Video Shared', description: 'When a video is shared externally', category: 'Videos' },
  { type: 'comment.created', label: 'New Comment', description: 'When a comment is posted', category: 'Comments' },
  { type: 'comment.mention', label: 'Mention', description: 'When someone is mentioned', category: 'Comments' },
  { type: 'recording.scheduled', label: 'Recording Scheduled', description: 'When a recording is scheduled', category: 'Recordings' },
  { type: 'recording.started', label: 'Recording Started', description: 'When a recording begins', category: 'Recordings' },
  { type: 'recording.completed', label: 'Recording Completed', description: 'When a recording finishes', category: 'Recordings' },
];

export const SHARE_MESSAGE_MAX_LENGTH = 500;

// --- Utility Functions ---

/**
 * Get platform display information.
 */
export function getPlatformInfo(platform: MessagingPlatform): { label: string; description: string } {
  const info = MESSAGING_PLATFORMS.find(p => p.platform === platform);
  return info ?? { label: platform, description: '' };
}

/**
 * Get connection status display color.
 */
export function getMessagingStatusColor(status: MessagingConnectionStatus): string {
  switch (status) {
    case 'connected': return 'bg-green-100 text-green-800';
    case 'disconnected': return 'bg-gray-100 text-gray-600';
    case 'error': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Get a human-readable label for a notification event type.
 */
export function getNotificationEventLabel(eventType: NotificationEventType): string {
  const event = NOTIFICATION_EVENTS.find(e => e.type === eventType);
  return event?.label ?? eventType;
}

/**
 * Group notification events by category.
 */
export function getNotificationEventsByCategory(): Map<string, typeof NOTIFICATION_EVENTS> {
  const map = new Map<string, typeof NOTIFICATION_EVENTS>();
  for (const event of NOTIFICATION_EVENTS) {
    if (!map.has(event.category)) {
      map.set(event.category, []);
    }
    map.get(event.category)!.push(event);
  }
  return map;
}

/**
 * Validate a share message.
 */
export function validateShareMessage(message: string): { valid: boolean; error?: string } {
  if (message.length > SHARE_MESSAGE_MAX_LENGTH) {
    return { valid: false, error: `Message must be ${SHARE_MESSAGE_MAX_LENGTH} characters or fewer` };
  }
  return { valid: true };
}

// --- Component ---

export class MessagingIntegrationPage {
  private element: HTMLElement;
  private connections: MessagingConnection[];
  private channels: MessagingChannel[];
  private rules: NotificationRule[];
  private callbacks: Partial<MessagingIntegrationCallbacks>;
  private showRuleForm = false;
  private showShareForm = false;
  private confirmDisconnectId: Uuid | null = null;
  private confirmDeleteRuleId: Uuid | null = null;
  private selectedConnectionId: Uuid | null = null;
  private ruleFormData: {
    connectionId: Uuid | null;
    channelId: Uuid | null;
    events: Set<NotificationEventType>;
  } = { connectionId: null, channelId: null, events: new Set() };
  private shareFormData: {
    videoId: string;
    videoTitle: string;
    connectionId: Uuid | null;
    channelId: Uuid | null;
    message: string;
  } = { videoId: '', videoTitle: '', connectionId: null, channelId: null, message: '' };

  constructor(options: MessagingIntegrationOptions = {}) {
    this.connections = options.connections ?? [];
    this.channels = options.channels ?? [];
    this.rules = options.rules ?? [];
    this.callbacks = options.callbacks ?? {};
    this.element = document.createElement('div');
    this.element.setAttribute('data-page', 'messaging-integration');
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getConnections(): MessagingConnection[] {
    return [...this.connections];
  }

  public getChannels(): MessagingChannel[] {
    return [...this.channels];
  }

  public getRules(): NotificationRule[] {
    return [...this.rules];
  }

  public isRuleFormVisible(): boolean {
    return this.showRuleForm;
  }

  public isShareFormVisible(): boolean {
    return this.showShareForm;
  }

  public updateConnections(connections: MessagingConnection[]): void {
    this.connections = connections;
    this.render();
  }

  public updateChannels(channels: MessagingChannel[]): void {
    this.channels = channels;
    this.render();
  }

  public updateRules(rules: NotificationRule[]): void {
    this.rules = rules;
    this.render();
  }

  public async connectPlatform(platform: MessagingPlatform): Promise<void> {
    if (this.callbacks.onConnectPlatform) {
      try {
        const connection = await this.callbacks.onConnectPlatform(platform);
        this.connections = [...this.connections, connection];
        this.render();
      } catch (error) {
        this.showError('connect-error', `Failed to connect ${getPlatformInfo(platform).label}.`);
      }
    }
  }

  public async disconnectPlatform(connectionId: Uuid): Promise<void> {
    if (this.callbacks.onDisconnectPlatform) {
      try {
        const success = await this.callbacks.onDisconnectPlatform(connectionId);
        if (success) {
          this.connections = this.connections.filter(c => c.id !== connectionId);
          this.rules = this.rules.filter(r => r.connectionId !== connectionId);
          this.confirmDisconnectId = null;
          this.render();
        }
      } catch (error) {
        this.showError(`disconnect-error-${connectionId}`, 'Failed to disconnect.');
      }
    }
  }

  public async fetchChannels(connectionId: Uuid): Promise<void> {
    if (this.callbacks.onFetchChannels) {
      try {
        const channels = await this.callbacks.onFetchChannels(connectionId);
        this.channels = channels;
        this.selectedConnectionId = connectionId;
        this.render();
      } catch (error) {
        this.showError('channel-error', 'Failed to fetch channels.');
      }
    }
  }

  public showCreateRule(): void {
    this.showRuleForm = true;
    this.ruleFormData = { connectionId: null, channelId: null, events: new Set() };
    this.render();
  }

  public hideCreateRule(): void {
    this.showRuleForm = false;
    this.render();
  }

  public async createRule(): Promise<void> {
    if (!this.ruleFormData.connectionId) {
      this.showError('rule-connection-error', 'Select a connected platform');
      return;
    }
    if (!this.ruleFormData.channelId) {
      this.showError('rule-channel-error', 'Select a channel');
      return;
    }
    if (this.ruleFormData.events.size === 0) {
      this.showError('rule-events-error', 'Select at least one event type');
      return;
    }

    const request: CreateNotificationRuleRequest = {
      connectionId: this.ruleFormData.connectionId,
      channelId: this.ruleFormData.channelId,
      events: Array.from(this.ruleFormData.events),
    };

    if (this.callbacks.onCreateRule) {
      try {
        const rule = await this.callbacks.onCreateRule(request);
        this.rules = [...this.rules, rule];
        this.showRuleForm = false;
        this.render();
      } catch (error) {
        this.showError('rule-create-error', 'Failed to create notification rule.');
      }
    }
  }

  public async toggleRule(ruleId: Uuid): Promise<void> {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule || !this.callbacks.onUpdateRule) return;

    try {
      const updated = await this.callbacks.onUpdateRule(ruleId, { isActive: !rule.isActive });
      this.rules = this.rules.map(r => r.id === ruleId ? updated : r);
      this.render();
    } catch (error) {
      this.showError(`rule-toggle-error-${ruleId}`, 'Failed to update rule.');
    }
  }

  public async deleteRule(ruleId: Uuid): Promise<void> {
    if (this.callbacks.onDeleteRule) {
      try {
        const success = await this.callbacks.onDeleteRule(ruleId);
        if (success) {
          this.rules = this.rules.filter(r => r.id !== ruleId);
          this.confirmDeleteRuleId = null;
          this.render();
        }
      } catch (error) {
        this.showError(`rule-delete-error-${ruleId}`, 'Failed to delete rule.');
      }
    }
  }

  public showShare(videoId: string, videoTitle: string): void {
    this.showShareForm = true;
    this.shareFormData = {
      videoId,
      videoTitle,
      connectionId: this.connections.length > 0 ? this.connections[0]!.id : null,
      channelId: null,
      message: '',
    };
    this.render();
  }

  public hideShare(): void {
    this.showShareForm = false;
    this.render();
  }

  public async shareVideo(): Promise<void> {
    if (!this.shareFormData.connectionId) {
      this.showError('share-connection-error', 'Select a connected platform');
      return;
    }
    if (!this.shareFormData.channelId) {
      this.showError('share-channel-error', 'Select a channel');
      return;
    }
    const msgValidation = validateShareMessage(this.shareFormData.message);
    if (!msgValidation.valid) {
      this.showError('share-message-error', msgValidation.error!);
      return;
    }

    const request: ShareVideoRequest = {
      videoId: this.shareFormData.videoId,
      videoTitle: this.shareFormData.videoTitle,
      connectionId: this.shareFormData.connectionId,
      channelId: this.shareFormData.channelId,
      message: this.shareFormData.message || undefined,
    };

    if (this.callbacks.onShareVideo) {
      try {
        const response = await this.callbacks.onShareVideo(request);
        if (response.success) {
          this.showShareForm = false;
          this.render();
        } else {
          this.showError('share-error', response.error ?? 'Failed to share video.');
        }
      } catch (error) {
        this.showError('share-error', 'Failed to share video. Please try again.');
      }
    }
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.connections = [];
    this.channels = [];
    this.rules = [];
    this.callbacks = {};
  }

  // --- Private Rendering ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderConnectionsSection());
    this.element.appendChild(this.renderRulesSection());

    if (this.showRuleForm) {
      this.element.appendChild(this.renderRuleForm());
    }

    if (this.showShareForm) {
      this.element.appendChild(this.renderShareForm());
    }
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Messaging Integration</h1>
        <p class="text-sm text-gray-500 mt-1">Connect Slack or Teams to receive notifications and share videos</p>
      </div>
      <button
        id="btn-add-rule"
        type="button"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Add notification rule"
        ${this.connections.length === 0 ? 'disabled' : ''}
      >Add Notification Rule</button>
    `;
    return header;
  }

  private renderConnectionsSection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'messaging-connections';
    section.className = 'mb-8';
    section.setAttribute('aria-labelledby', 'messaging-connections-heading');

    const connectedPlatforms = this.connections.map(c => c.platform);
    const availablePlatforms = MESSAGING_PLATFORMS.filter(
      p => !connectedPlatforms.includes(p.platform)
    );

    const connectionsHtml = this.connections.map(c => {
      const info = getPlatformInfo(c.platform);
      const statusColor = getMessagingStatusColor(c.status);
      return `
        <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg" data-connection-id="${c.id}">
          <div class="flex items-center gap-3">
            <span class="text-lg font-medium text-gray-900">${this.escapeHtml(info.label)}</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">${c.status}</span>
            <span class="text-xs text-gray-500">${this.escapeHtml(c.workspaceName)}</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="btn-disconnect-platform px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500" data-connection-id="${c.id}" aria-label="Disconnect ${info.label}">Disconnect</button>
          </div>
        </div>
      `;
    }).join('');

    const availableHtml = availablePlatforms.map(p => `
      <button type="button" class="btn-connect-platform flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" data-platform="${p.platform}" aria-label="Connect ${p.label}">
        <span class="text-sm font-medium text-gray-700">Connect ${this.escapeHtml(p.label)}</span>
      </button>
    `).join('');

    section.innerHTML = `
      <h2 id="messaging-connections-heading" class="text-lg font-medium text-gray-900 mb-4">Connected Platforms</h2>
      <div class="space-y-3 mb-4">${connectionsHtml || '<p class="text-sm text-gray-500">No platforms connected yet.</p>'}</div>
      ${availablePlatforms.length > 0 ? `<div class="flex flex-wrap gap-3">${availableHtml}</div>` : ''}
      <p id="connect-error" class="mt-2 text-sm text-red-600 hidden" role="alert"></p>
    `;
    return section;
  }

  private renderRulesSection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'notification-rules';
    section.className = 'mb-8';
    section.setAttribute('aria-labelledby', 'rules-heading');

    if (this.rules.length === 0) {
      section.innerHTML = `
        <h2 id="rules-heading" class="text-lg font-medium text-gray-900 mb-4">Notification Rules</h2>
        <div class="text-center py-8 bg-white border border-gray-200 rounded-lg">
          <h3 class="text-sm font-medium text-gray-900">No notification rules</h3>
          <p class="mt-1 text-sm text-gray-500">Add a rule to start receiving notifications in your channels.</p>
        </div>
      `;
      return section;
    }

    const ruleCards = this.rules.map(rule => `
      <div class="p-4 bg-white border border-gray-200 rounded-lg" data-rule-id="${rule.id}">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-gray-900">#${this.escapeHtml(rule.channelName)}</h3>
            <p class="text-xs text-gray-500 mt-1">${rule.events.map(e => getNotificationEventLabel(e)).join(', ')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="btn-toggle-rule px-2 py-1 text-xs font-medium rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${rule.isActive ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-gray-700 bg-gray-50 hover:bg-gray-100'}" data-rule-id="${rule.id}" aria-label="${rule.isActive ? 'Disable' : 'Enable'} rule">${rule.isActive ? 'Active' : 'Paused'}</button>
            <button type="button" class="btn-delete-rule px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500" data-rule-id="${rule.id}" aria-label="Delete notification rule">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    section.innerHTML = `
      <h2 id="rules-heading" class="text-lg font-medium text-gray-900 mb-4">Notification Rules</h2>
      <div class="space-y-3">${ruleCards}</div>
    `;
    return section;
  }

  private renderRuleForm(): HTMLElement {
    const form = document.createElement('section');
    form.id = 'rule-form';
    form.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    form.setAttribute('aria-labelledby', 'rule-form-heading');

    const eventCategories = getNotificationEventsByCategory();
    const eventsHtml = Array.from(eventCategories.entries()).map(([category, events]) => `
      <fieldset class="mb-3">
        <legend class="text-sm font-medium text-gray-700 mb-1">${this.escapeHtml(category)}</legend>
        <div class="flex flex-wrap gap-3">
          ${events.map(e => `
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="rule-event-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" value="${e.type}" ${this.ruleFormData.events.has(e.type) ? 'checked' : ''} />
              <span class="text-sm text-gray-700">${this.escapeHtml(e.label)}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
    `).join('');

    form.innerHTML = `
      <h2 id="rule-form-heading" class="text-lg font-medium text-gray-900 mb-4">Add Notification Rule</h2>
      <div class="space-y-4">
        <div>
          <label for="rule-connection-select" class="block text-sm font-medium text-gray-700 mb-1">Platform</label>
          <select id="rule-connection-select" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">Select a platform</option>
            ${this.connections.map(c => `<option value="${c.id}" ${this.ruleFormData.connectionId === c.id ? 'selected' : ''}>${this.escapeHtml(getPlatformInfo(c.platform).label)} — ${this.escapeHtml(c.workspaceName)}</option>`).join('')}
          </select>
          <p id="rule-connection-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <label for="rule-channel-select" class="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select id="rule-channel-select" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">Select a channel</option>
            ${this.channels.map(ch => `<option value="${ch.id}" ${this.ruleFormData.channelId === ch.id ? 'selected' : ''}>${ch.isPrivate ? '🔒 ' : '#'}${this.escapeHtml(ch.name)}</option>`).join('')}
          </select>
          <p id="rule-channel-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-2">Events</h3>
          <div role="group" aria-label="Notification event types">${eventsHtml}</div>
          <p id="rule-events-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <p id="rule-create-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button id="btn-submit-rule" type="button" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Create Rule</button>
          <button id="btn-cancel-rule" type="button" class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
        </div>
      </div>
    `;
    return form;
  }

  private renderShareForm(): HTMLElement {
    const form = document.createElement('section');
    form.id = 'share-form';
    form.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    form.setAttribute('aria-labelledby', 'share-form-heading');

    form.innerHTML = `
      <h2 id="share-form-heading" class="text-lg font-medium text-gray-900 mb-4">Share Video</h2>
      <p class="text-sm text-gray-500 mb-4">Sharing: <strong>${this.escapeHtml(this.shareFormData.videoTitle)}</strong></p>
      <div class="space-y-4">
        <div>
          <label for="share-connection-select" class="block text-sm font-medium text-gray-700 mb-1">Platform</label>
          <select id="share-connection-select" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">Select a platform</option>
            ${this.connections.map(c => `<option value="${c.id}" ${this.shareFormData.connectionId === c.id ? 'selected' : ''}>${this.escapeHtml(getPlatformInfo(c.platform).label)} — ${this.escapeHtml(c.workspaceName)}</option>`).join('')}
          </select>
          <p id="share-connection-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <label for="share-channel-select" class="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select id="share-channel-select" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            <option value="">Select a channel</option>
            ${this.channels.map(ch => `<option value="${ch.id}" ${this.shareFormData.channelId === ch.id ? 'selected' : ''}>${ch.isPrivate ? '🔒 ' : '#'}${this.escapeHtml(ch.name)}</option>`).join('')}
          </select>
          <p id="share-channel-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <label for="share-message-input" class="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
          <textarea id="share-message-input" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" rows="3" maxlength="${SHARE_MESSAGE_MAX_LENGTH}" placeholder="Add a message with the video...">${this.escapeHtml(this.shareFormData.message)}</textarea>
          <p id="share-message-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <p id="share-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button id="btn-submit-share" type="button" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Share</button>
          <button id="btn-cancel-share" type="button" class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
        </div>
      </div>
    `;
    return form;
  }

  private showError(elementId: string, message: string): void {
    const el = this.element.querySelector(`#${elementId}`);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
