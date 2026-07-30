/**
 * Export and Sharing Functionality
 *
 * Provides video export interface with format selection, batch export with
 * progress tracking, embed code generation with player customization,
 * and sharing controls with permission management.
 *
 * Requirements: 15.3, 15.5
 */

// --- Types ---

export type Uuid = string;

export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type ExportQuality = 'low' | 'medium' | 'high' | 'original';
export type ExportResolution = '480p' | '720p' | '1080p' | '4k';
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type SharePermission = 'public' | 'password' | 'organization' | 'members';

export interface ExportOptions {
  format: ExportFormat;
  quality: ExportQuality;
  resolution: ExportResolution;
}

export interface ExportJob {
  id: Uuid;
  videoId: Uuid;
  videoTitle: string;
  options: ExportOptions;
  status: ExportStatus;
  progress: number;
  estimatedTimeRemaining?: number;
  downloadUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface EmbedOptions {
  autoplay: boolean;
  controls: boolean;
  loop: boolean;
  muted: boolean;
  width: number;
  height: number;
  showBranding: boolean;
  responsive: boolean;
  startTime?: number;
}

export interface ShareLink {
  id: Uuid;
  videoId: Uuid;
  url: string;
  permission: SharePermission;
  password?: string;
  allowedMembers?: string[];
  expiresAt?: string;
  createdAt: string;
  viewCount: number;
  isActive: boolean;
}

export interface VideoForExport {
  id: Uuid;
  title: string;
  duration: number;
  thumbnail?: string;
}

export interface ExportSharingCallbacks {
  onStartExport: (videoId: Uuid, options: ExportOptions) => Promise<ExportJob>;
  onStartBatchExport: (videoIds: Uuid[], options: ExportOptions) => Promise<ExportJob[]>;
  onCancelExport: (jobId: Uuid) => Promise<boolean>;
  onGenerateShareLink: (videoId: Uuid, permission: SharePermission, opts?: {
    password?: string;
    allowedMembers?: string[];
    expiresAt?: string;
  }) => Promise<ShareLink>;
  onRevokeShareLink: (linkId: Uuid) => Promise<boolean>;
  onGetShareLinks: (videoId: Uuid) => Promise<ShareLink[]>;
}

export interface ExportSharingOptions {
  videos?: VideoForExport[];
  exportJobs?: ExportJob[];
  shareLinks?: ShareLink[];
  callbacks?: Partial<ExportSharingCallbacks>;
  baseEmbedUrl?: string;
}

// --- Constants ---

export const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'mp4', label: 'MP4', description: 'Universal format, best compatibility' },
  { value: 'webm', label: 'WebM', description: 'Smaller file size, web optimized' },
  { value: 'gif', label: 'GIF', description: 'Animated image, no audio' },
];

export const QUALITY_OPTIONS: { value: ExportQuality; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: '360p equivalent, small file' },
  { value: 'medium', label: 'Medium', description: '720p equivalent, balanced' },
  { value: 'high', label: 'High', description: '1080p equivalent, large file' },
  { value: 'original', label: 'Original', description: 'Source quality, largest file' },
];

export const RESOLUTION_OPTIONS: { value: ExportResolution; label: string }[] = [
  { value: '480p', label: '480p (SD)' },
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '4k', label: '4K (Ultra HD)' },
];

export const DEFAULT_EMBED_OPTIONS: EmbedOptions = {
  autoplay: false,
  controls: true,
  loop: false,
  muted: false,
  width: 640,
  height: 360,
  showBranding: true,
  responsive: true,
};

export const DEFAULT_BASE_EMBED_URL = 'https://embed.streetstudio.io';

// --- Utility Functions ---

/**
 * Format seconds into human-readable ETA string.
 */
export function formatEta(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return 'Calculating...';
  if (seconds === 0) return 'Almost done';
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s remaining`
      : `${minutes}m remaining`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m remaining`;
}

/**
 * Calculate aggregate progress for batch exports.
 */
export function calculateBatchProgress(jobs: ExportJob[]): number {
  if (jobs.length === 0) return 0;
  const totalProgress = jobs.reduce((sum, job) => sum + job.progress, 0);
  return Math.round(totalProgress / jobs.length);
}

/**
 * Get the count of completed jobs in a batch.
 */
export function getCompletedCount(jobs: ExportJob[]): number {
  return jobs.filter(j => j.status === 'completed').length;
}

/**
 * Get the count of failed jobs in a batch.
 */
export function getFailedCount(jobs: ExportJob[]): number {
  return jobs.filter(j => j.status === 'failed').length;
}

/**
 * Generate iframe embed code for a video.
 */
export function generateIframeEmbed(
  videoId: Uuid,
  options: EmbedOptions,
  baseUrl: string = DEFAULT_BASE_EMBED_URL
): string {
  const params = new URLSearchParams();
  if (options.autoplay) params.set('autoplay', '1');
  if (!options.controls) params.set('controls', '0');
  if (options.loop) params.set('loop', '1');
  if (options.muted) params.set('muted', '1');
  if (!options.showBranding) params.set('branding', '0');
  if (options.startTime && options.startTime > 0) params.set('t', String(options.startTime));

  const queryStr = params.toString();
  const src = `${baseUrl}/v/${videoId}${queryStr ? '?' + queryStr : ''}`;

  if (options.responsive) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;">` +
      `<iframe src="${src}" style="position:absolute;top:0;left:0;width:100%;height:100%;" ` +
      `frameborder="0" allowfullscreen title="StreetStudio Video"></iframe></div>`;
  }

  return `<iframe src="${src}" width="${options.width}" height="${options.height}" ` +
    `frameborder="0" allowfullscreen title="StreetStudio Video"></iframe>`;
}

/**
 * Generate script-based embed code for a video.
 */
export function generateScriptEmbed(
  videoId: Uuid,
  options: EmbedOptions,
  baseUrl: string = DEFAULT_BASE_EMBED_URL
): string {
  const config = JSON.stringify({
    videoId,
    autoplay: options.autoplay,
    controls: options.controls,
    loop: options.loop,
    muted: options.muted,
    branding: options.showBranding,
    startTime: options.startTime || 0,
  });

  if (options.responsive) {
    return `<div id="ss-player-${videoId}" style="width:100%;aspect-ratio:16/9;"></div>\n` +
      `<script src="${baseUrl}/player.js" data-config='${config}'></script>`;
  }

  return `<div id="ss-player-${videoId}" style="width:${options.width}px;height:${options.height}px;"></div>\n` +
    `<script src="${baseUrl}/player.js" data-config='${config}'></script>`;
}

/**
 * Validate share link expiration date is in the future.
 */
export function validateExpirationDate(dateStr: string | undefined): { valid: boolean; error?: string } {
  if (!dateStr) return { valid: true };
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { valid: false, error: 'Invalid date format' };
  if (date.getTime() <= Date.now()) return { valid: false, error: 'Expiration must be in the future' };
  return { valid: true };
}

/**
 * Validate password for password-protected share links.
 */
export function validateSharePassword(password: string | undefined, permission: SharePermission): { valid: boolean; error?: string } {
  if (permission !== 'password') return { valid: true };
  if (!password || password.trim().length === 0) {
    return { valid: false, error: 'Password is required for password-protected links' };
  }
  if (password.length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be 128 characters or fewer' };
  }
  return { valid: true };
}

/**
 * Get human-readable permission label.
 */
export function getPermissionLabel(permission: SharePermission): string {
  switch (permission) {
    case 'public': return 'Anyone with the link';
    case 'password': return 'Password protected';
    case 'organization': return 'Organization members only';
    case 'members': return 'Specific members only';
    default: return 'Unknown';
  }
}

/**
 * Format a share link's expiration status.
 */
export function formatExpiration(expiresAt: string | undefined): string {
  if (!expiresAt) return 'Never expires';
  const date = new Date(expiresAt);
  if (isNaN(date.getTime())) return 'Invalid date';
  if (date.getTime() <= Date.now()) return 'Expired';
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffDays <= 1) return 'Expires today';
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// --- Component ---

export class ExportSharingPage {
  private element: HTMLElement;
  private videos: VideoForExport[];
  private exportJobs: ExportJob[];
  private shareLinks: ShareLink[];
  private callbacks: Partial<ExportSharingCallbacks>;
  private baseEmbedUrl: string;

  // Export form state
  private showExportForm = false;
  private selectedVideoIds: Set<Uuid> = new Set();
  private exportOptions: ExportOptions = {
    format: 'mp4',
    quality: 'high',
    resolution: '1080p',
  };

  // Embed state
  private showEmbedPanel = false;
  private embedVideoId: Uuid | null = null;
  private embedOptions: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS };
  private embedType: 'iframe' | 'script' = 'iframe';

  // Share state
  private showShareForm = false;
  private shareVideoId: Uuid | null = null;
  private sharePermission: SharePermission = 'public';
  private sharePassword = '';
  private shareMembers: string[] = [];
  private shareExpiration = '';

  constructor(options: ExportSharingOptions = {}) {
    this.videos = options.videos ?? [];
    this.exportJobs = options.exportJobs ?? [];
    this.shareLinks = options.shareLinks ?? [];
    this.callbacks = options.callbacks ?? {};
    this.baseEmbedUrl = options.baseEmbedUrl ?? DEFAULT_BASE_EMBED_URL;
    this.element = document.createElement('div');
    this.element.setAttribute('data-page', 'export-sharing');
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  // --- Public API ---

  public getElement(): HTMLElement {
    return this.element;
  }

  public getExportJobs(): ExportJob[] {
    return [...this.exportJobs];
  }

  public getShareLinks(): ShareLink[] {
    return [...this.shareLinks];
  }

  public getSelectedVideoIds(): Uuid[] {
    return Array.from(this.selectedVideoIds);
  }

  public getExportOptions(): ExportOptions {
    return { ...this.exportOptions };
  }

  public getEmbedOptions(): EmbedOptions {
    return { ...this.embedOptions };
  }

  public isExportFormVisible(): boolean {
    return this.showExportForm;
  }

  public isEmbedPanelVisible(): boolean {
    return this.showEmbedPanel;
  }

  public isShareFormVisible(): boolean {
    return this.showShareForm;
  }

  // --- Export Methods ---

  public showExport(): void {
    this.showExportForm = true;
    this.render();
  }

  public hideExport(): void {
    this.showExportForm = false;
    this.selectedVideoIds.clear();
    this.render();
  }

  public selectVideo(videoId: Uuid): void {
    this.selectedVideoIds.add(videoId);
    this.render();
  }

  public deselectVideo(videoId: Uuid): void {
    this.selectedVideoIds.delete(videoId);
    this.render();
  }

  public toggleVideoSelection(videoId: Uuid): void {
    if (this.selectedVideoIds.has(videoId)) {
      this.selectedVideoIds.delete(videoId);
    } else {
      this.selectedVideoIds.add(videoId);
    }
    this.render();
  }

  public selectAllVideos(): void {
    this.videos.forEach(v => this.selectedVideoIds.add(v.id));
    this.render();
  }

  public deselectAllVideos(): void {
    this.selectedVideoIds.clear();
    this.render();
  }

  public setExportFormat(format: ExportFormat): void {
    this.exportOptions.format = format;
    this.render();
  }

  public setExportQuality(quality: ExportQuality): void {
    this.exportOptions.quality = quality;
    this.render();
  }

  public setExportResolution(resolution: ExportResolution): void {
    this.exportOptions.resolution = resolution;
    this.render();
  }

  public async startExport(): Promise<void> {
    if (this.selectedVideoIds.size === 0) return;

    const videoIds = Array.from(this.selectedVideoIds);

    if (videoIds.length === 1 && this.callbacks.onStartExport) {
      try {
        const job = await this.callbacks.onStartExport(videoIds[0], this.exportOptions);
        this.exportJobs = [job, ...this.exportJobs];
        this.showExportForm = false;
        this.selectedVideoIds.clear();
        this.render();
      } catch {
        this.showError('export-error', 'Failed to start export. Please try again.');
      }
    } else if (videoIds.length > 1 && this.callbacks.onStartBatchExport) {
      try {
        const jobs = await this.callbacks.onStartBatchExport(videoIds, this.exportOptions);
        this.exportJobs = [...jobs, ...this.exportJobs];
        this.showExportForm = false;
        this.selectedVideoIds.clear();
        this.render();
      } catch {
        this.showError('export-error', 'Failed to start batch export. Please try again.');
      }
    }
  }

  public async cancelExport(jobId: Uuid): Promise<void> {
    if (this.callbacks.onCancelExport) {
      try {
        const success = await this.callbacks.onCancelExport(jobId);
        if (success) {
          this.exportJobs = this.exportJobs.filter(j => j.id !== jobId);
          this.render();
        }
      } catch {
        // silently fail
      }
    }
  }

  public updateExportProgress(jobId: Uuid, progress: number, eta?: number): void {
    this.exportJobs = this.exportJobs.map(j =>
      j.id === jobId
        ? { ...j, progress: Math.min(100, Math.max(0, progress)), estimatedTimeRemaining: eta }
        : j
    );
    this.render();
  }

  public completeExport(jobId: Uuid, downloadUrl: string): void {
    this.exportJobs = this.exportJobs.map(j =>
      j.id === jobId
        ? { ...j, status: 'completed' as ExportStatus, progress: 100, downloadUrl, completedAt: new Date().toISOString() }
        : j
    );
    this.render();
  }

  public failExport(jobId: Uuid, error: string): void {
    this.exportJobs = this.exportJobs.map(j =>
      j.id === jobId
        ? { ...j, status: 'failed' as ExportStatus, error }
        : j
    );
    this.render();
  }

  // --- Embed Methods ---

  public showEmbed(videoId: Uuid): void {
    this.showEmbedPanel = true;
    this.embedVideoId = videoId;
    this.embedOptions = { ...DEFAULT_EMBED_OPTIONS };
    this.embedType = 'iframe';
    this.render();
  }

  public hideEmbed(): void {
    this.showEmbedPanel = false;
    this.embedVideoId = null;
    this.render();
  }

  public setEmbedType(type: 'iframe' | 'script'): void {
    this.embedType = type;
    this.render();
  }

  public setEmbedOption<K extends keyof EmbedOptions>(key: K, value: EmbedOptions[K]): void {
    this.embedOptions[key] = value;
    this.render();
  }

  public getEmbedCode(): string {
    if (!this.embedVideoId) return '';
    if (this.embedType === 'iframe') {
      return generateIframeEmbed(this.embedVideoId, this.embedOptions, this.baseEmbedUrl);
    }
    return generateScriptEmbed(this.embedVideoId, this.embedOptions, this.baseEmbedUrl);
  }

  // --- Share Methods ---

  public showShare(videoId: Uuid): void {
    this.showShareForm = true;
    this.shareVideoId = videoId;
    this.sharePermission = 'public';
    this.sharePassword = '';
    this.shareMembers = [];
    this.shareExpiration = '';
    this.render();
  }

  public hideShare(): void {
    this.showShareForm = false;
    this.shareVideoId = null;
    this.render();
  }

  public setSharePermission(permission: SharePermission): void {
    this.sharePermission = permission;
    this.render();
  }

  public setSharePassword(password: string): void {
    this.sharePassword = password;
  }

  public setShareMembers(members: string[]): void {
    this.shareMembers = members;
  }

  public setShareExpiration(dateStr: string): void {
    this.shareExpiration = dateStr;
  }

  public getShareFormState(): {
    videoId: Uuid | null;
    permission: SharePermission;
    password: string;
    members: string[];
    expiration: string;
  } {
    return {
      videoId: this.shareVideoId,
      permission: this.sharePermission,
      password: this.sharePassword,
      members: [...this.shareMembers],
      expiration: this.shareExpiration,
    };
  }

  public async createShareLink(): Promise<void> {
    if (!this.shareVideoId) return;

    // Validate
    const expValidation = validateExpirationDate(this.shareExpiration || undefined);
    if (!expValidation.valid) {
      this.showError('share-expiration-error', expValidation.error!);
      return;
    }

    const pwValidation = validateSharePassword(
      this.sharePermission === 'password' ? this.sharePassword : undefined,
      this.sharePermission
    );
    if (!pwValidation.valid) {
      this.showError('share-password-error', pwValidation.error!);
      return;
    }

    if (this.callbacks.onGenerateShareLink) {
      try {
        const link = await this.callbacks.onGenerateShareLink(
          this.shareVideoId,
          this.sharePermission,
          {
            password: this.sharePermission === 'password' ? this.sharePassword : undefined,
            allowedMembers: this.sharePermission === 'members' ? this.shareMembers : undefined,
            expiresAt: this.shareExpiration || undefined,
          }
        );
        this.shareLinks = [link, ...this.shareLinks];
        this.showShareForm = false;
        this.render();
      } catch {
        this.showError('share-create-error', 'Failed to create share link. Please try again.');
      }
    }
  }

  public async revokeShareLink(linkId: Uuid): Promise<void> {
    if (this.callbacks.onRevokeShareLink) {
      try {
        const success = await this.callbacks.onRevokeShareLink(linkId);
        if (success) {
          this.shareLinks = this.shareLinks.map(l =>
            l.id === linkId ? { ...l, isActive: false } : l
          );
          this.render();
        }
      } catch {
        // silently fail
      }
    }
  }

  public updateVideos(videos: VideoForExport[]): void {
    this.videos = videos;
    this.render();
  }

  public updateExportJobs(jobs: ExportJob[]): void {
    this.exportJobs = jobs;
    this.render();
  }

  public updateShareLinks(links: ShareLink[]): void {
    this.shareLinks = links;
    this.render();
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.videos = [];
    this.exportJobs = [];
    this.shareLinks = [];
    this.callbacks = {};
  }

  // --- Private Rendering ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());

    if (this.showExportForm) {
      this.element.appendChild(this.renderExportForm());
    }

    if (this.exportJobs.length > 0) {
      this.element.appendChild(this.renderExportProgress());
    }

    if (this.showEmbedPanel && this.embedVideoId) {
      this.element.appendChild(this.renderEmbedPanel());
    }

    if (this.showShareForm) {
      this.element.appendChild(this.renderShareForm());
    }

    if (this.shareLinks.length > 0) {
      this.element.appendChild(this.renderShareLinks());
    }

    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Export & Sharing</h1>
        <p class="text-sm text-gray-500 mt-1">Export videos and manage sharing settings</p>
      </div>
      <button
        id="btn-new-export"
        type="button"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Start new export"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        New Export
      </button>
    `;
    return header;
  }

  private renderExportForm(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'export-form';
    section.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    section.setAttribute('aria-labelledby', 'export-form-heading');

    const videoListHtml = this.videos.map(v => `
      <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
        <input
          type="checkbox"
          class="video-select-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          value="${v.id}"
          ${this.selectedVideoIds.has(v.id) ? 'checked' : ''}
          aria-label="Select ${this.escapeHtml(v.title)} for export"
        />
        <span class="text-sm text-gray-800">${this.escapeHtml(v.title)}</span>
        <span class="text-xs text-gray-500 ml-auto">${Math.floor(v.duration / 60)}:${String(Math.floor(v.duration % 60)).padStart(2, '0')}</span>
      </label>
    `).join('');

    section.innerHTML = `
      <h2 id="export-form-heading" class="text-lg font-medium text-gray-900 mb-4">Export Videos</h2>
      <div class="space-y-4">
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-gray-700">Select Videos</h3>
            <div class="flex gap-2">
              <button type="button" id="btn-select-all" class="text-xs text-blue-600 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500 rounded">Select All</button>
              <button type="button" id="btn-deselect-all" class="text-xs text-gray-500 hover:underline focus:outline-none focus:ring-1 focus:ring-gray-400 rounded">Deselect All</button>
            </div>
          </div>
          <div id="video-selection" class="max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2" role="group" aria-label="Videos available for export">
            ${videoListHtml || '<p class="text-sm text-gray-500 p-2">No videos available</p>'}
          </div>
          <p class="mt-1 text-xs text-gray-500">${this.selectedVideoIds.size} video${this.selectedVideoIds.size !== 1 ? 's' : ''} selected</p>
        </div>
        ${this.renderFormatOptions()}
        ${this.renderQualityOptions()}
        ${this.renderResolutionOptions()}
        <p id="export-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button id="btn-start-export" type="button" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" ${this.selectedVideoIds.size === 0 ? 'disabled' : ''}>
            Export${this.selectedVideoIds.size > 1 ? ` (${this.selectedVideoIds.size})` : ''}
          </button>
          <button id="btn-cancel-export" type="button" class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
        </div>
      </div>
    `;
    return section;
  }

  private renderFormatOptions(): string {
    return `
      <fieldset>
        <legend class="text-sm font-medium text-gray-700 mb-2">Format</legend>
        <div class="flex gap-4" role="radiogroup" aria-label="Export format">
          ${FORMAT_OPTIONS.map(opt => `
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="export-format" value="${opt.value}"
                ${this.exportOptions.format === opt.value ? 'checked' : ''}
                class="format-radio text-blue-600 focus:ring-blue-500"
                aria-describedby="format-desc-${opt.value}" />
              <span class="text-sm text-gray-800">${opt.label}</span>
              <span id="format-desc-${opt.value}" class="sr-only">${opt.description}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
    `;
  }

  private renderQualityOptions(): string {
    return `
      <div>
        <label for="export-quality" class="block text-sm font-medium text-gray-700 mb-1">Quality</label>
        <select id="export-quality" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
          ${QUALITY_OPTIONS.map(opt => `
            <option value="${opt.value}" ${this.exportOptions.quality === opt.value ? 'selected' : ''}>
              ${opt.label} - ${opt.description}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  private renderResolutionOptions(): string {
    return `
      <div>
        <label for="export-resolution" class="block text-sm font-medium text-gray-700 mb-1">Resolution</label>
        <select id="export-resolution" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
          ${RESOLUTION_OPTIONS.map(opt => `
            <option value="${opt.value}" ${this.exportOptions.resolution === opt.value ? 'selected' : ''}>
              ${opt.label}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  private renderExportProgress(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'export-progress';
    section.className = 'mb-6';
    section.setAttribute('aria-label', 'Export progress');

    const activeJobs = this.exportJobs.filter(j => j.status === 'processing' || j.status === 'pending');
    const batchProgress = calculateBatchProgress(activeJobs);
    const completed = getCompletedCount(this.exportJobs);
    const failed = getFailedCount(this.exportJobs);

    const jobsHtml = this.exportJobs.map(job => {
      const statusClass = job.status === 'completed' ? 'bg-green-500' :
        job.status === 'failed' ? 'bg-red-500' : 'bg-blue-500';

      return `
        <div class="flex items-center gap-4 p-3 border-b border-gray-100 last:border-0" data-job-id="${job.id}">
          <div class="flex-1">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-800">${this.escapeHtml(job.videoTitle)}</span>
              <span class="text-xs text-gray-500">${job.options.format.toUpperCase()} · ${job.options.resolution}</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${job.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Export progress for ${this.escapeHtml(job.videoTitle)}">
                <div class="h-full ${statusClass} rounded-full transition-all" style="width: ${job.progress}%"></div>
              </div>
              <span class="text-xs text-gray-600 w-10 text-right">${job.progress}%</span>
            </div>
            ${job.status === 'processing' ? `<p class="text-xs text-gray-500 mt-1">${formatEta(job.estimatedTimeRemaining)}</p>` : ''}
            ${job.status === 'failed' ? `<p class="text-xs text-red-600 mt-1">${this.escapeHtml(job.error || 'Export failed')}</p>` : ''}
            ${job.status === 'completed' && job.downloadUrl ? `<a href="${this.escapeHtml(job.downloadUrl)}" class="text-xs text-blue-600 hover:underline mt-1 inline-block" download>Download</a>` : ''}
          </div>
          ${job.status === 'processing' || job.status === 'pending' ? `
            <button type="button" class="btn-cancel-job text-xs text-red-600 hover:text-red-800 focus:outline-none focus:ring-1 focus:ring-red-500 rounded px-2 py-1" data-job-id="${job.id}" aria-label="Cancel export for ${this.escapeHtml(job.videoTitle)}">Cancel</button>
          ` : ''}
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-900">Export Progress</h3>
            <span class="text-xs text-gray-500">${completed} completed · ${failed} failed · ${activeJobs.length} active</span>
          </div>
          ${activeJobs.length > 0 ? `
            <div class="mt-2 flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${batchProgress}" aria-valuemin="0" aria-valuemax="100" aria-label="Overall batch export progress">
                <div class="h-full bg-blue-500 rounded-full" style="width: ${batchProgress}%"></div>
              </div>
              <span class="text-xs text-gray-600">${batchProgress}%</span>
            </div>
          ` : ''}
        </div>
        <div id="export-jobs-list">
          ${jobsHtml}
        </div>
      </div>
    `;
    return section;
  }

  private renderEmbedPanel(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'embed-panel';
    section.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    section.setAttribute('aria-labelledby', 'embed-heading');

    const embedCode = this.getEmbedCode();

    section.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 id="embed-heading" class="text-lg font-medium text-gray-900">Embed Code</h2>
        <button id="btn-close-embed" type="button" class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 rounded" aria-label="Close embed panel">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Embed Type</label>
          <div class="flex gap-4" role="radiogroup" aria-label="Embed type selection">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="embed-type" value="iframe" ${this.embedType === 'iframe' ? 'checked' : ''} class="embed-type-radio text-blue-600 focus:ring-blue-500" />
              <span class="text-sm text-gray-800">iFrame</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="embed-type" value="script" ${this.embedType === 'script' ? 'checked' : ''} class="embed-type-radio text-blue-600 focus:ring-blue-500" />
              <span class="text-sm text-gray-800">Script</span>
            </label>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          ${this.renderEmbedToggle('autoplay', 'Autoplay', this.embedOptions.autoplay)}
          ${this.renderEmbedToggle('controls', 'Show Controls', this.embedOptions.controls)}
          ${this.renderEmbedToggle('loop', 'Loop', this.embedOptions.loop)}
          ${this.renderEmbedToggle('muted', 'Muted', this.embedOptions.muted)}
          ${this.renderEmbedToggle('showBranding', 'Show Branding', this.embedOptions.showBranding)}
          ${this.renderEmbedToggle('responsive', 'Responsive', this.embedOptions.responsive)}
        </div>
        ${!this.embedOptions.responsive ? `
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="embed-width" class="block text-xs font-medium text-gray-700 mb-1">Width (px)</label>
              <input type="number" id="embed-width" value="${this.embedOptions.width}" min="200" max="1920" class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label for="embed-height" class="block text-xs font-medium text-gray-700 mb-1">Height (px)</label>
              <input type="number" id="embed-height" value="${this.embedOptions.height}" min="150" max="1080" class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
          </div>
        ` : ''}
        <div>
          <label for="embed-code-output" class="block text-sm font-medium text-gray-700 mb-1">Generated Code</label>
          <textarea id="embed-code-output" readonly class="w-full h-24 px-3 py-2 border border-gray-300 rounded-md font-mono text-xs text-gray-800 bg-gray-50 resize-none" aria-label="Generated embed code">${this.escapeHtml(embedCode)}</textarea>
          <button id="btn-copy-embed" type="button" class="mt-2 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Copy embed code to clipboard">Copy Code</button>
        </div>
      </div>
    `;
    return section;
  }

  private renderEmbedToggle(key: string, label: string, checked: boolean): string {
    return `
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-sm text-gray-700">${label}</span>
        <input type="checkbox" class="embed-option-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-option="${key}" ${checked ? 'checked' : ''} aria-label="${label}" />
      </label>
    `;
  }

  private renderShareForm(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'share-form';
    section.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    section.setAttribute('aria-labelledby', 'share-form-heading');

    section.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 id="share-form-heading" class="text-lg font-medium text-gray-900">Share Video</h2>
        <button id="btn-close-share" type="button" class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 rounded" aria-label="Close share form">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="space-y-4">
        <fieldset>
          <legend class="text-sm font-medium text-gray-700 mb-2">Permission Level</legend>
          <div class="space-y-2" role="radiogroup" aria-label="Share permission level">
            ${this.renderPermissionRadio('public', 'Anyone with the link', 'No restrictions')}
            ${this.renderPermissionRadio('password', 'Password protected', 'Require a password to view')}
            ${this.renderPermissionRadio('organization', 'Organization only', 'Only organization members can view')}
            ${this.renderPermissionRadio('members', 'Specific members', 'Only selected members can view')}
          </div>
        </fieldset>
        ${this.sharePermission === 'password' ? `
          <div>
            <label for="share-password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" id="share-password" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" placeholder="Enter a password" value="${this.escapeHtml(this.sharePassword)}" aria-required="true" />
            <p id="share-password-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
          </div>
        ` : ''}
        ${this.sharePermission === 'members' ? `
          <div>
            <label for="share-members" class="block text-sm font-medium text-gray-700 mb-1">Members (comma-separated emails)</label>
            <input type="text" id="share-members" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" placeholder="user1@example.com, user2@example.com" value="${this.escapeHtml(this.shareMembers.join(', '))}" />
          </div>
        ` : ''}
        <div>
          <label for="share-expiration" class="block text-sm font-medium text-gray-700 mb-1">Expiration (optional)</label>
          <input type="datetime-local" id="share-expiration" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" value="${this.shareExpiration}" />
          <p id="share-expiration-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <p id="share-create-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button id="btn-create-share" type="button" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Create Link</button>
          <button id="btn-cancel-share" type="button" class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
        </div>
      </div>
    `;
    return section;
  }

  private renderPermissionRadio(value: SharePermission, label: string, description: string): string {
    return `
      <label class="flex items-start gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
        <input type="radio" name="share-permission" value="${value}"
          ${this.sharePermission === value ? 'checked' : ''}
          class="permission-radio mt-0.5 text-blue-600 focus:ring-blue-500" />
        <div>
          <span class="text-sm font-medium text-gray-800">${label}</span>
          <p class="text-xs text-gray-500">${description}</p>
        </div>
      </label>
    `;
  }

  private renderShareLinks(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'share-links-list';
    section.className = 'mb-6';
    section.setAttribute('aria-label', 'Active share links');

    const linksHtml = this.shareLinks.map(link => `
      <div class="flex items-center gap-4 p-3 border-b border-gray-100 last:border-0" data-link-id="${link.id}">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <code class="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded truncate max-w-xs">${this.escapeHtml(link.url)}</code>
            ${!link.isActive ? '<span class="text-xs text-red-600 font-medium">Revoked</span>' : ''}
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-500">
            <span>${getPermissionLabel(link.permission)}</span>
            <span>·</span>
            <span>${formatExpiration(link.expiresAt)}</span>
            <span>·</span>
            <span>${link.viewCount} view${link.viewCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        ${link.isActive ? `
          <button type="button" class="btn-revoke-link text-xs text-red-600 hover:text-red-800 focus:outline-none focus:ring-1 focus:ring-red-500 rounded px-2 py-1" data-link-id="${link.id}" aria-label="Revoke share link">Revoke</button>
        ` : ''}
      </div>
    `).join('');

    section.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="text-sm font-medium text-gray-900">Share Links</h3>
        </div>
        <div>${linksHtml}</div>
      </div>
    `;
    return section;
  }

  // --- Event Listeners ---

  private setupEventListeners(): void {
    // New export button
    this.element.querySelector('#btn-new-export')?.addEventListener('click', () => this.showExport());

    // Cancel export
    this.element.querySelector('#btn-cancel-export')?.addEventListener('click', () => this.hideExport());

    // Start export
    this.element.querySelector('#btn-start-export')?.addEventListener('click', () => this.startExport());

    // Select/Deselect all
    this.element.querySelector('#btn-select-all')?.addEventListener('click', () => this.selectAllVideos());
    this.element.querySelector('#btn-deselect-all')?.addEventListener('click', () => this.deselectAllVideos());

    // Video checkboxes
    this.element.querySelectorAll('.video-select-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        this.toggleVideoSelection(input.value);
      });
    });

    // Format radios
    this.element.querySelectorAll('.format-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.setExportFormat((e.target as HTMLInputElement).value as ExportFormat);
      });
    });

    // Quality select
    const qualitySelect = this.element.querySelector('#export-quality') as HTMLSelectElement | null;
    qualitySelect?.addEventListener('change', (e) => {
      this.setExportQuality((e.target as HTMLSelectElement).value as ExportQuality);
    });

    // Resolution select
    const resSelect = this.element.querySelector('#export-resolution') as HTMLSelectElement | null;
    resSelect?.addEventListener('change', (e) => {
      this.setExportResolution((e.target as HTMLSelectElement).value as ExportResolution);
    });

    // Cancel export jobs
    this.element.querySelectorAll('.btn-cancel-job').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobId = (e.currentTarget as HTMLElement).dataset.jobId!;
        this.cancelExport(jobId);
      });
    });

    // Embed panel controls
    this.element.querySelector('#btn-close-embed')?.addEventListener('click', () => this.hideEmbed());

    this.element.querySelectorAll('.embed-type-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.setEmbedType((e.target as HTMLInputElement).value as 'iframe' | 'script');
      });
    });

    this.element.querySelectorAll('.embed-option-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const key = input.dataset.option as keyof EmbedOptions;
        this.setEmbedOption(key, input.checked as any);
      });
    });

    const widthInput = this.element.querySelector('#embed-width') as HTMLInputElement | null;
    widthInput?.addEventListener('change', (e) => {
      this.setEmbedOption('width', parseInt((e.target as HTMLInputElement).value, 10) || 640);
    });

    const heightInput = this.element.querySelector('#embed-height') as HTMLInputElement | null;
    heightInput?.addEventListener('change', (e) => {
      this.setEmbedOption('height', parseInt((e.target as HTMLInputElement).value, 10) || 360);
    });

    // Copy embed code
    this.element.querySelector('#btn-copy-embed')?.addEventListener('click', () => {
      const code = this.getEmbedCode();
      navigator.clipboard?.writeText(code).then(() => {
        const btn = this.element.querySelector('#btn-copy-embed');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
        }
      });
    });

    // Share form controls
    this.element.querySelector('#btn-close-share')?.addEventListener('click', () => this.hideShare());
    this.element.querySelector('#btn-cancel-share')?.addEventListener('click', () => this.hideShare());
    this.element.querySelector('#btn-create-share')?.addEventListener('click', () => this.createShareLink());

    this.element.querySelectorAll('.permission-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.setSharePermission((e.target as HTMLInputElement).value as SharePermission);
      });
    });

    const passwordInput = this.element.querySelector('#share-password') as HTMLInputElement | null;
    passwordInput?.addEventListener('input', (e) => {
      this.sharePassword = (e.target as HTMLInputElement).value;
      this.hideError('share-password-error');
    });

    const membersInput = this.element.querySelector('#share-members') as HTMLInputElement | null;
    membersInput?.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.shareMembers = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
    });

    const expirationInput = this.element.querySelector('#share-expiration') as HTMLInputElement | null;
    expirationInput?.addEventListener('change', (e) => {
      this.shareExpiration = (e.target as HTMLInputElement).value;
      this.hideError('share-expiration-error');
    });

    // Revoke share links
    this.element.querySelectorAll('.btn-revoke-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const linkId = (e.currentTarget as HTMLElement).dataset.linkId!;
        this.revokeShareLink(linkId);
      });
    });
  }

  // --- Helpers ---

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
