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
