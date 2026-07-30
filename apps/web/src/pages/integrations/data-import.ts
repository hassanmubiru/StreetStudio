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
