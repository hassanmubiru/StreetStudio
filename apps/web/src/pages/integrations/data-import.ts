/**
 * Data Import Functionality
 *
 * Provides import capabilities for migrating content from other platforms
 * (YouTube, Vimeo, Loom), with format validation and progress tracking.
 *
 * Requirements: 15.9
 */

// --- Types ---

export type Uuid = string;

export type ImportPlatform = 'youtube' | 'vimeo' | 'loom' | 'file';

export type ImportStatus = 'pending' | 'validating' | 'importing' | 'completed' | 'failed';

export type ImportItemType = 'video' | 'project' | 'playlist';

export interface ImportSource {
  platform: ImportPlatform;
  url?: string;
  apiKey?: string;
  accessToken?: string;
}

export interface ImportableItem {
  id: string;
  externalId: string;
  title: string;
  type: ImportItemType;
  duration?: number;
  thumbnail?: string;
  platform: ImportPlatform;
  size?: number;
  createdAt?: string;
  selected: boolean;
}

export interface ImportJob {
  id: Uuid;
  platform: ImportPlatform;
  status: ImportStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  items: ImportJobItem[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ImportJobItem {
  id: string;
  externalId: string;
  title: string;
  type: ImportItemType;
  status: ImportStatus;
  progress: number;
  error?: string;
  resultVideoId?: Uuid;
}

export interface ValidateImportRequest {
  platform: ImportPlatform;
  url?: string;
  apiKey?: string;
  accessToken?: string;
}

export interface ValidateImportResponse {
  valid: boolean;
  items: ImportableItem[];
  error?: string;
}

export interface StartImportRequest {
  platform: ImportPlatform;
  items: { externalId: string; title: string; type: ImportItemType }[];
  targetProjectId?: Uuid;
}

export interface DataImportCallbacks {
  onValidateSource: (request: ValidateImportRequest) => Promise<ValidateImportResponse>;
  onStartImport: (request: StartImportRequest) => Promise<ImportJob>;
  onCancelImport: (jobId: Uuid) => Promise<boolean>;
  onRetryItem: (jobId: Uuid, itemId: string) => Promise<ImportJobItem>;
  onFetchJobStatus: (jobId: Uuid) => Promise<ImportJob>;
}

export interface DataImportOptions {
  importJobs?: ImportJob[];
  callbacks?: Partial<DataImportCallbacks>;
}

// --- Constants ---

export const IMPORT_PLATFORMS: { platform: ImportPlatform; label: string; description: string; urlPattern?: string }[] = [
  { platform: 'youtube', label: 'YouTube', description: 'Import videos from YouTube channels or playlists', urlPattern: 'youtube.com|youtu.be' },
  { platform: 'vimeo', label: 'Vimeo', description: 'Import videos from Vimeo accounts', urlPattern: 'vimeo.com' },
  { platform: 'loom', label: 'Loom', description: 'Import recordings from Loom workspace', urlPattern: 'loom.com' },
  { platform: 'file', label: 'File Upload', description: 'Import from exported data files (JSON, CSV)' },
];

export const SUPPORTED_IMPORT_FILE_TYPES = ['.json', '.csv', '.zip'];
export const MAX_IMPORT_FILE_SIZE_MB = 500;
export const MAX_IMPORT_ITEMS = 100;

// --- Utility Functions ---

/**
 * Get platform display information.
 */
export function getImportPlatformInfo(platform: ImportPlatform): { label: string; description: string } {
  const info = IMPORT_PLATFORMS.find(p => p.platform === platform);
  return info ?? { label: platform, description: '' };
}

/**
 * Validate a platform URL.
 */
export function validatePlatformUrl(platform: ImportPlatform, url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'URL is required' };
  }

  try {
    new URL(trimmed);
  } catch {
    return { valid: false, error: 'Please enter a valid URL' };
  }

  const platformInfo = IMPORT_PLATFORMS.find(p => p.platform === platform);
  if (platformInfo?.urlPattern) {
    const pattern = new RegExp(platformInfo.urlPattern, 'i');
    if (!pattern.test(trimmed)) {
      return { valid: false, error: `URL must be from ${platformInfo.label}` };
    }
  }

  return { valid: true };
}

/**
 * Validate an import file by extension.
 */
export function validateImportFile(fileName: string, fileSize: number): { valid: boolean; error?: string } {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!SUPPORTED_IMPORT_FILE_TYPES.includes(extension)) {
    return { valid: false, error: `Unsupported file type. Accepted: ${SUPPORTED_IMPORT_FILE_TYPES.join(', ')}` };
  }
  const maxBytes = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
  if (fileSize > maxBytes) {
    return { valid: false, error: `File size exceeds ${MAX_IMPORT_FILE_SIZE_MB}MB limit` };
  }
  return { valid: true };
}

/**
 * Calculate overall import progress percentage.
 */
export function calculateImportProgress(job: ImportJob): number {
  if (job.totalItems === 0) return 0;
  return Math.round((job.completedItems / job.totalItems) * 100);
}

/**
 * Get import status display color.
 */
export function getImportStatusColor(status: ImportStatus): string {
  switch (status) {
    case 'pending': return 'bg-gray-100 text-gray-600';
    case 'validating': return 'bg-blue-100 text-blue-800';
    case 'importing': return 'bg-yellow-100 text-yellow-800';
    case 'completed': return 'bg-green-100 text-green-800';
    case 'failed': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format duration in seconds to a readable string.
 */
export function formatImportDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}

// --- Component ---

export class DataImportPage {
  private element: HTMLElement;
  private importJobs: ImportJob[];
  private callbacks: Partial<DataImportCallbacks>;
  private showSourceForm = false;
  private discoveredItems: ImportableItem[] = [];
  private isValidating = false;
  private sourceFormData: {
    platform: ImportPlatform | null;
    url: string;
    apiKey: string;
    accessToken: string;
  } = { platform: null, url: '', apiKey: '', accessToken: '' };
  private targetProjectId: Uuid | null = null;

  constructor(options: DataImportOptions = {}) {
    this.importJobs = options.importJobs ?? [];
    this.callbacks = options.callbacks ?? {};
    this.element = document.createElement('div');
    this.element.setAttribute('data-page', 'data-import');
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getImportJobs(): ImportJob[] {
    return [...this.importJobs];
  }

  public getDiscoveredItems(): ImportableItem[] {
    return [...this.discoveredItems];
  }

  public isSourceFormVisible(): boolean {
    return this.showSourceForm;
  }

  public getIsValidating(): boolean {
    return this.isValidating;
  }

  public getSourceFormData() {
    return { ...this.sourceFormData };
  }

  public updateJobs(jobs: ImportJob[]): void {
    this.importJobs = jobs;
    this.render();
  }

  public showSource(): void {
    this.showSourceForm = true;
    this.sourceFormData = { platform: null, url: '', apiKey: '', accessToken: '' };
    this.discoveredItems = [];
    this.render();
  }

  public hideSource(): void {
    this.showSourceForm = false;
    this.discoveredItems = [];
    this.isValidating = false;
    this.render();
  }

  public selectPlatform(platform: ImportPlatform): void {
    this.sourceFormData.platform = platform;
    this.sourceFormData.url = '';
    this.sourceFormData.apiKey = '';
    this.sourceFormData.accessToken = '';
    this.discoveredItems = [];
    this.render();
  }

  public async validateSource(): Promise<void> {
    if (!this.sourceFormData.platform) {
      this.showError('platform-error', 'Select a platform');
      return;
    }

    if (this.sourceFormData.platform !== 'file') {
      const urlValidation = validatePlatformUrl(this.sourceFormData.platform, this.sourceFormData.url);
      if (!urlValidation.valid) {
        this.showError('url-error', urlValidation.error!);
        return;
      }
    }

    this.isValidating = true;
    this.render();

    if (this.callbacks.onValidateSource) {
      try {
        const response = await this.callbacks.onValidateSource({
          platform: this.sourceFormData.platform,
          url: this.sourceFormData.url || undefined,
          apiKey: this.sourceFormData.apiKey || undefined,
          accessToken: this.sourceFormData.accessToken || undefined,
        });

        this.isValidating = false;
        if (response.valid) {
          this.discoveredItems = response.items.map(item => ({ ...item, selected: true }));
        } else {
          this.showError('validate-error', response.error ?? 'Validation failed');
        }
        this.render();
      } catch (error) {
        this.isValidating = false;
        this.showError('validate-error', 'Failed to validate source. Please check your credentials.');
        this.render();
      }
    }
  }

  public toggleItemSelection(itemId: string): void {
    this.discoveredItems = this.discoveredItems.map(item =>
      item.id === itemId ? { ...item, selected: !item.selected } : item
    );
    this.render();
  }

  public selectAllItems(): void {
    this.discoveredItems = this.discoveredItems.map(item => ({ ...item, selected: true }));
    this.render();
  }

  public deselectAllItems(): void {
    this.discoveredItems = this.discoveredItems.map(item => ({ ...item, selected: false }));
    this.render();
  }

  public getSelectedItemCount(): number {
    return this.discoveredItems.filter(item => item.selected).length;
  }

  public async startImport(): Promise<void> {
    const selectedItems = this.discoveredItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      this.showError('import-error', 'Select at least one item to import');
      return;
    }
    if (selectedItems.length > MAX_IMPORT_ITEMS) {
      this.showError('import-error', `Maximum ${MAX_IMPORT_ITEMS} items per import`);
      return;
    }
    if (!this.sourceFormData.platform) return;

    const request: StartImportRequest = {
      platform: this.sourceFormData.platform,
      items: selectedItems.map(item => ({
        externalId: item.externalId,
        title: item.title,
        type: item.type,
      })),
      targetProjectId: this.targetProjectId ?? undefined,
    };

    if (this.callbacks.onStartImport) {
      try {
        const job = await this.callbacks.onStartImport(request);
        this.importJobs = [job, ...this.importJobs];
        this.showSourceForm = false;
        this.discoveredItems = [];
        this.render();
      } catch (error) {
        this.showError('import-error', 'Failed to start import. Please try again.');
      }
    }
  }

  public async cancelImport(jobId: Uuid): Promise<void> {
    if (this.callbacks.onCancelImport) {
      try {
        const success = await this.callbacks.onCancelImport(jobId);
        if (success) {
          this.importJobs = this.importJobs.map(j =>
            j.id === jobId ? { ...j, status: 'failed' as ImportStatus, error: 'Cancelled by user' } : j
          );
          this.render();
        }
      } catch (error) {
        this.showError(`cancel-error-${jobId}`, 'Failed to cancel import.');
      }
    }
  }

  public async refreshJobStatus(jobId: Uuid): Promise<void> {
    if (this.callbacks.onFetchJobStatus) {
      try {
        const job = await this.callbacks.onFetchJobStatus(jobId);
        this.importJobs = this.importJobs.map(j => j.id === jobId ? job : j);
        this.render();
      } catch {
        // Silently fail refresh
      }
    }
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.importJobs = [];
    this.callbacks = {};
    this.discoveredItems = [];
  }

  // --- Private Rendering ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());

    if (this.showSourceForm) {
      this.element.appendChild(this.renderSourceForm());
      if (this.discoveredItems.length > 0) {
        this.element.appendChild(this.renderItemSelection());
      }
    }

    this.element.appendChild(this.renderJobHistory());
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Data Import</h1>
        <p class="text-sm text-gray-500 mt-1">Import videos and projects from other platforms</p>
      </div>
      <button
        id="btn-new-import"
        type="button"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Start new import"
        ${this.showSourceForm ? 'disabled' : ''}
      >New Import</button>
    `;
    return header;
  }

  private renderSourceForm(): HTMLElement {
    const form = document.createElement('section');
    form.id = 'source-form';
    form.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    form.setAttribute('aria-labelledby', 'source-form-heading');

    const platformButtons = IMPORT_PLATFORMS.map(p => `
      <button type="button" class="btn-select-platform flex flex-col items-center gap-2 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${this.sourceFormData.platform === p.platform ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}" data-platform="${p.platform}" aria-pressed="${this.sourceFormData.platform === p.platform}">
        <span class="text-sm font-medium text-gray-900">${this.escapeHtml(p.label)}</span>
        <span class="text-xs text-gray-500 text-center">${this.escapeHtml(p.description)}</span>
      </button>
    `).join('');

    const showUrlInput = this.sourceFormData.platform && this.sourceFormData.platform !== 'file';

    form.innerHTML = `
      <h2 id="source-form-heading" class="text-lg font-medium text-gray-900 mb-4">Select Import Source</h2>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3" role="group" aria-label="Import platform selection">
          ${platformButtons}
        </div>
        <p id="platform-error" class="text-sm text-red-600 hidden" role="alert"></p>
        ${showUrlInput ? `
          <div>
            <label for="import-url-input" class="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
            <input id="import-url-input" type="url" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" placeholder="https://..." value="${this.escapeHtml(this.sourceFormData.url)}" aria-required="true" />
            <p id="url-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
          </div>
        ` : ''}
        <p id="validate-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button id="btn-validate-source" type="button" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" ${this.isValidating ? 'disabled' : ''}>${this.isValidating ? 'Validating...' : 'Scan Source'}</button>
          <button id="btn-cancel-source" type="button" class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
        </div>
      </div>
    `;
    return form;
  }

  private renderItemSelection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'item-selection';
    section.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    section.setAttribute('aria-labelledby', 'items-heading');

    const selectedCount = this.getSelectedItemCount();
    const itemRows = this.discoveredItems.map(item => `
      <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0" data-item-id="${item.id}">
        <div class="flex items-center gap-3">
          <input type="checkbox" class="item-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-item-id="${item.id}" ${item.selected ? 'checked' : ''} aria-label="Select ${this.escapeHtml(item.title)}" />
          ${item.thumbnail ? `<img src="${this.escapeHtml(item.thumbnail)}" alt="" class="w-10 h-7 object-cover rounded" />` : ''}
          <div>
            <span class="text-sm font-medium text-gray-900">${this.escapeHtml(item.title)}</span>
            <span class="text-xs text-gray-500 ml-2">${item.type}${item.duration ? ` • ${formatImportDuration(item.duration)}` : ''}${item.size ? ` • ${formatFileSize(item.size)}` : ''}</span>
          </div>
        </div>
      </div>
    `).join('');

    section.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 id="items-heading" class="text-lg font-medium text-gray-900">Discovered Items (${this.discoveredItems.length})</h2>
        <div class="flex items-center gap-2">
          <button id="btn-select-all" type="button" class="text-xs text-blue-600 hover:text-blue-800 focus:outline-none">Select All</button>
          <span class="text-gray-300">|</span>
          <button id="btn-deselect-all" type="button" class="text-xs text-blue-600 hover:text-blue-800 focus:outline-none">Deselect All</button>
        </div>
      </div>
      <div class="max-h-64 overflow-y-auto">${itemRows}</div>
      <p id="import-error" class="mt-2 text-sm text-red-600 hidden" role="alert"></p>
      <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
        <span class="text-sm text-gray-600">${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected</span>
        <button id="btn-start-import" type="button" class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2" ${selectedCount === 0 ? 'disabled' : ''}>Start Import</button>
      </div>
    `;
    return section;
  }

  private renderJobHistory(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'import-history';
    section.setAttribute('aria-labelledby', 'history-heading');

    if (this.importJobs.length === 0) {
      section.innerHTML = `
        <h2 id="history-heading" class="text-lg font-medium text-gray-900 mb-4">Import History</h2>
        <div class="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <h3 class="text-sm font-medium text-gray-900">No imports yet</h3>
          <p class="mt-1 text-sm text-gray-500">Start an import to migrate content from other platforms.</p>
        </div>
      `;
      return section;
    }

    const jobCards = this.importJobs.map(job => {
      const progress = calculateImportProgress(job);
      const statusColor = getImportStatusColor(job.status);
      const platformInfo = getImportPlatformInfo(job.platform);
      const isActive = job.status === 'importing' || job.status === 'validating';

      return `
        <div class="p-4 bg-white border border-gray-200 rounded-lg" data-job-id="${job.id}">
          <div class="flex items-start justify-between mb-2">
            <div>
              <span class="text-sm font-medium text-gray-900">${this.escapeHtml(platformInfo.label)} Import</span>
              <span class="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">${job.status}</span>
            </div>
            <div class="flex items-center gap-2">
              ${isActive ? `<button type="button" class="btn-cancel-import px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500" data-job-id="${job.id}" aria-label="Cancel import">Cancel</button>` : ''}
              <button type="button" class="btn-refresh-job px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" data-job-id="${job.id}" aria-label="Refresh status">Refresh</button>
            </div>
          </div>
          <div class="flex items-center gap-2 mb-1">
            <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Import progress">
              <div class="h-full bg-blue-500 rounded-full transition-all" style="width: ${progress}%"></div>
            </div>
            <span class="text-xs text-gray-600">${progress}%</span>
          </div>
          <p class="text-xs text-gray-500">${job.completedItems}/${job.totalItems} items completed${job.failedItems > 0 ? ` • ${job.failedItems} failed` : ''}</p>
          ${job.error ? `<p class="text-xs text-red-600 mt-1">${this.escapeHtml(job.error)}</p>` : ''}
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <h2 id="history-heading" class="text-lg font-medium text-gray-900 mb-4">Import History</h2>
      <div class="space-y-3">${jobCards}</div>
    `;
    return section;
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
