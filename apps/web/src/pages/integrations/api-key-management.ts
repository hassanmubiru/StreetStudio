/**
 * API Key Management Interface
 *
 * Provides API key generation with scope selection, partial masking display,
 * key revocation and rotation, and usage analytics with rate limiting display.
 *
 * Requirements: 15.1
 */

// --- Types ---

export type Uuid = string;

export type ApiKeyScope =
  | 'read:videos'
  | 'write:videos'
  | 'read:projects'
  | 'write:projects'
  | 'read:comments'
  | 'write:comments'
  | 'read:members'
  | 'write:members'
  | 'read:recordings'
  | 'write:recordings'
  | 'admin:organization';

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface ApiKey {
  id: Uuid;
  name: string;
  prefix: string;
  maskedKey: string;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  requestCount: number;
  rateLimitPerHour: number;
  rateLimitRemaining: number;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresInDays?: number;
}

export interface CreateApiKeyResponse {
  key: ApiKey;
  fullKey: string;
}

export interface ApiKeyManagementCallbacks {
  onCreateKey: (request: CreateApiKeyRequest) => Promise<CreateApiKeyResponse>;
  onRevokeKey: (keyId: Uuid) => Promise<boolean>;
  onRotateKey: (keyId: Uuid) => Promise<CreateApiKeyResponse>;
  onDeleteKey: (keyId: Uuid) => Promise<boolean>;
}

export interface ApiKeyManagementOptions {
  keys?: ApiKey[];
  callbacks?: Partial<ApiKeyManagementCallbacks>;
}

// --- Constants ---

export const AVAILABLE_SCOPES: { scope: ApiKeyScope; label: string; description: string; category: string }[] = [
  { scope: 'read:videos', label: 'Read Videos', description: 'View video metadata and content', category: 'Videos' },
  { scope: 'write:videos', label: 'Write Videos', description: 'Upload, edit, and delete videos', category: 'Videos' },
  { scope: 'read:projects', label: 'Read Projects', description: 'View project information', category: 'Projects' },
  { scope: 'write:projects', label: 'Write Projects', description: 'Create and modify projects', category: 'Projects' },
  { scope: 'read:comments', label: 'Read Comments', description: 'View comments and reactions', category: 'Comments' },
  { scope: 'write:comments', label: 'Write Comments', description: 'Post and edit comments', category: 'Comments' },
  { scope: 'read:members', label: 'Read Members', description: 'View organization members', category: 'Members' },
  { scope: 'write:members', label: 'Write Members', description: 'Invite and manage members', category: 'Members' },
  { scope: 'read:recordings', label: 'Read Recordings', description: 'View recordings', category: 'Recordings' },
  { scope: 'write:recordings', label: 'Write Recordings', description: 'Create and manage recordings', category: 'Recordings' },
  { scope: 'admin:organization', label: 'Admin', description: 'Full admin access to organization', category: 'Admin' },
];

export const EXPIRATION_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
];

export const KEY_NAME_MAX_LENGTH = 64;
export const KEY_NAME_MIN_LENGTH = 1;

// --- Utility Functions ---

/**
 * Mask an API key, showing only the last 4 characters.
 * Format: "sk_****...****abcd"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) {
    return '****';
  }
  const last4 = key.slice(-4);
  return `${'•'.repeat(Math.min(key.length - 4, 32))}${last4}`;
}

/**
 * Format a date string as a relative or absolute time.
 */
export function formatKeyDate(dateStr: string | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculate rate limit usage percentage.
 */
export function getRateLimitPercentage(remaining: number, total: number): number {
  if (total <= 0) return 0;
  const used = total - remaining;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

/**
 * Get status badge color class.
 */
export function getStatusColor(status: ApiKeyStatus): string {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800';
    case 'revoked': return 'bg-red-100 text-red-800';
    case 'expired': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Validate API key name.
 */
export function validateKeyName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length < KEY_NAME_MIN_LENGTH) {
    return { valid: false, error: 'Key name is required' };
  }
  if (trimmed.length > KEY_NAME_MAX_LENGTH) {
    return { valid: false, error: `Key name must be ${KEY_NAME_MAX_LENGTH} characters or fewer` };
  }
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
    return { valid: false, error: 'Key name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }
  return { valid: true };
}

// --- Component ---

export class ApiKeyManagementPage {
  private element: HTMLElement;
  private keys: ApiKey[];
  private callbacks: Partial<ApiKeyManagementCallbacks>;
  private showCreateForm = false;
  private newKeyFullValue: string | null = null;
  private createFormData: { name: string; scopes: Set<ApiKeyScope>; expiresInDays: number } = {
    name: '',
    scopes: new Set(),
    expiresInDays: 0,
  };
  private confirmRevoke: Uuid | null = null;
  private confirmDelete: Uuid | null = null;

  constructor(options: ApiKeyManagementOptions = {}) {
    this.keys = options.keys ?? [];
    this.callbacks = options.callbacks ?? {};
    this.element = document.createElement('div');
    this.element.setAttribute('data-page', 'api-key-management');
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getKeys(): ApiKey[] {
    return [...this.keys];
  }

  public isCreateFormVisible(): boolean {
    return this.showCreateForm;
  }

  public getCreateFormData(): { name: string; scopes: ApiKeyScope[]; expiresInDays: number } {
    return {
      name: this.createFormData.name,
      scopes: Array.from(this.createFormData.scopes),
      expiresInDays: this.createFormData.expiresInDays,
    };
  }

  public getNewKeyValue(): string | null {
    return this.newKeyFullValue;
  }

  public updateKeys(keys: ApiKey[]): void {
    this.keys = keys;
    this.render();
  }

  public showCreate(): void {
    this.showCreateForm = true;
    this.newKeyFullValue = null;
    this.createFormData = { name: '', scopes: new Set(), expiresInDays: 0 };
    this.render();
  }

  public hideCreate(): void {
    this.showCreateForm = false;
    this.newKeyFullValue = null;
    this.createFormData = { name: '', scopes: new Set(), expiresInDays: 0 };
    this.render();
  }

  public async createKey(): Promise<void> {
    const validation = validateKeyName(this.createFormData.name);
    if (!validation.valid) {
      this.showError('name-error', validation.error!);
      return;
    }
    if (this.createFormData.scopes.size === 0) {
      this.showError('scope-error', 'Select at least one scope');
      return;
    }

    const request: CreateApiKeyRequest = {
      name: this.createFormData.name.trim(),
      scopes: Array.from(this.createFormData.scopes),
      expiresInDays: this.createFormData.expiresInDays || undefined,
    };

    if (this.callbacks.onCreateKey) {
      try {
        const response = await this.callbacks.onCreateKey(request);
        this.keys = [response.key, ...this.keys];
        this.newKeyFullValue = response.fullKey;
        this.showCreateForm = false;
        this.render();
      } catch (error) {
        this.showError('create-error', 'Failed to create API key. Please try again.');
      }
    }
  }

  public async revokeKey(keyId: Uuid): Promise<void> {
    if (this.callbacks.onRevokeKey) {
      try {
        const success = await this.callbacks.onRevokeKey(keyId);
        if (success) {
          this.keys = this.keys.map(k =>
            k.id === keyId ? { ...k, status: 'revoked' as ApiKeyStatus } : k
          );
          this.confirmRevoke = null;
          this.render();
        }
      } catch (error) {
        this.showError(`revoke-error-${keyId}`, 'Failed to revoke key.');
      }
    }
  }

  public async rotateKey(keyId: Uuid): Promise<void> {
    if (this.callbacks.onRotateKey) {
      try {
        const response = await this.callbacks.onRotateKey(keyId);
        this.keys = this.keys.map(k =>
          k.id === keyId ? { ...k, status: 'revoked' as ApiKeyStatus } : k
        );
        this.keys = [response.key, ...this.keys];
        this.newKeyFullValue = response.fullKey;
        this.render();
      } catch (error) {
        this.showError(`rotate-error-${keyId}`, 'Failed to rotate key.');
      }
    }
  }

  public async deleteKey(keyId: Uuid): Promise<void> {
    if (this.callbacks.onDeleteKey) {
      try {
        const success = await this.callbacks.onDeleteKey(keyId);
        if (success) {
          this.keys = this.keys.filter(k => k.id !== keyId);
          this.confirmDelete = null;
          this.render();
        }
      } catch (error) {
        this.showError(`delete-error-${keyId}`, 'Failed to delete key.');
      }
    }
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.keys = [];
    this.callbacks = {};
  }

  // --- Private Rendering ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());

    if (this.newKeyFullValue) {
      this.element.appendChild(this.renderNewKeyBanner());
    }

    if (this.showCreateForm) {
      this.element.appendChild(this.renderCreateForm());
    }

    this.element.appendChild(this.renderKeyList());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">API Keys</h1>
        <p class="text-sm text-gray-500 mt-1">Manage your personal API keys for programmatic access</p>
      </div>
      <button
        id="btn-create-key"
        type="button"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Generate new API key"
        ${this.showCreateForm ? 'disabled' : ''}
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Generate New Key
      </button>
    `;
    return header;
  }

  private renderNewKeyBanner(): HTMLElement {
    const banner = document.createElement('div');
    banner.id = 'new-key-banner';
    banner.className = 'mb-6 p-4 bg-green-50 border border-green-200 rounded-lg';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-medium text-green-800">API Key Created</h3>
          <p class="text-sm text-green-700 mt-1">Copy your key now. You won't be able to see it again.</p>
          <div class="mt-2 flex items-center gap-2">
            <code id="full-key-display" class="flex-1 px-3 py-2 bg-white border border-green-300 rounded font-mono text-sm text-gray-900 select-all">${this.escapeHtml(this.newKeyFullValue ?? '')}</code>
            <button
              id="btn-copy-key"
              type="button"
              class="px-3 py-2 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Copy API key to clipboard"
            >Copy</button>
          </div>
        </div>
        <button
          id="btn-dismiss-banner"
          type="button"
          class="text-green-400 hover:text-green-600 focus:outline-none"
          aria-label="Dismiss new key notification"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
    return banner;
  }

  private renderCreateForm(): HTMLElement {
    const form = document.createElement('section');
    form.id = 'create-key-form';
    form.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    form.setAttribute('aria-labelledby', 'create-form-heading');

    const scopeCategories = this.groupScopesByCategory();
    const scopeHtml = scopeCategories.map(([category, scopes]) => `
      <fieldset class="mb-3">
        <legend class="text-sm font-medium text-gray-700 mb-1">${this.escapeHtml(category)}</legend>
        <div class="flex flex-wrap gap-3">
          ${scopes.map(s => `
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                class="scope-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                value="${s.scope}"
                ${this.createFormData.scopes.has(s.scope) ? 'checked' : ''}
                aria-describedby="desc-${s.scope}"
              />
              <span class="text-sm text-gray-700">${this.escapeHtml(s.label)}</span>
              <span id="desc-${s.scope}" class="sr-only">${this.escapeHtml(s.description)}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
    `).join('');

    form.innerHTML = `
      <h2 id="create-form-heading" class="text-lg font-medium text-gray-900 mb-4">Generate New API Key</h2>
      <div class="space-y-4">
        <div>
          <label for="key-name-input" class="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
          <input
            id="key-name-input"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="e.g. CI/CD Pipeline, Production App"
            maxlength="${KEY_NAME_MAX_LENGTH}"
            value="${this.escapeHtml(this.createFormData.name)}"
            aria-required="true"
          />
          <p id="name-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-2">Scopes</h3>
          <p class="text-xs text-gray-500 mb-3">Select the permissions this key should have</p>
          <div id="scope-selection" role="group" aria-label="API key permission scopes">
            ${scopeHtml}
          </div>
          <p id="scope-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <label for="expiration-select" class="block text-sm font-medium text-gray-700 mb-1">Expiration</label>
          <select
            id="expiration-select"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            ${EXPIRATION_OPTIONS.map(opt => `
              <option value="${opt.value}" ${this.createFormData.expiresInDays === opt.value ? 'selected' : ''}>
                ${this.escapeHtml(opt.label)}
              </option>
            `).join('')}
          </select>
        </div>
        <p id="create-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button
            id="btn-submit-create"
            type="button"
            class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >Create Key</button>
          <button
            id="btn-cancel-create"
            type="button"
            class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >Cancel</button>
        </div>
      </div>
    `;
    return form;
  }
