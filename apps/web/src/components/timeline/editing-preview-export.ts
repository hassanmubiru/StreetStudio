/**
 * Editing Preview and Export System
 * 
 * Provides real-time preview of edits without affecting the original video,
 * multiple quality export options with progress tracking, background
 * processing integration with status updates, and export history management.
 * 
 * Requirements: 6.6, 6.7
 */

import type { TimelineClip, TrimOperation, SplitOperation } from './timeline-editor.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export type ExportQuality = 'low' | 'medium' | 'high' | 'original';

export type ExportFormat = 'mp4' | 'webm' | 'mov';

export type ExportStatus =
  | 'queued'
  | 'processing'
  | 'encoding'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PreviewMode = 'realtime' | 'draft' | 'full';

export interface ExportQualityOption {
  quality: ExportQuality;
  label: string;
  description: string;
  resolution: { width: number; height: number };
  bitrate: number; // kbps
  format: ExportFormat;
  estimatedSizeMB?: number;
}

export interface ExportProgress {
  exportId: string;
  status: ExportStatus;
  percent: number;
  currentStep: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
  bytesProcessed: number;
  totalBytes: number;
}

export interface ExportJob {
  id: string;
  videoId: string;
  quality: ExportQuality;
  format: ExportFormat;
  resolution: { width: number; height: number };
  bitrate: number;
  status: ExportStatus;
  progress: number;
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  fileSizeBytes?: number;
  error?: string;
}

export interface EditOperation {
  type: 'trim' | 'split' | 'overlay' | 'caption' | 'cut';
  timestamp: number;
  data: TrimOperation | SplitOperation | Record<string, unknown>;
}

export interface PreviewState {
  isActive: boolean;
  mode: PreviewMode;
  currentTime: number;
  duration: number;
  editOperations: EditOperation[];
  isBuffering: boolean;
  originalVideoUrl: string;
  previewVideoUrl?: string;
}

export interface ExportOptions {
  videoId: string;
  quality: ExportQuality;
  format: ExportFormat;
  clips: TimelineClip[];
  editOperations: EditOperation[];
  includeOverlays: boolean;
  includeCaptions: boolean;
  startFrame?: number;
  endFrame?: number;
}

export interface PreviewCallbacks {
  onPreviewReady?: () => void;
  onPreviewUpdate?: (time: number) => void;
  onPreviewError?: (error: Error) => void;
  onBufferingChange?: (isBuffering: boolean) => void;
}

export interface ExportCallbacks {
  onExportStart?: (job: ExportJob) => void;
  onExportProgress?: (progress: ExportProgress) => void;
  onExportComplete?: (job: ExportJob) => void;
  onExportError?: (job: ExportJob, error: Error) => void;
  onExportCancelled?: (job: ExportJob) => void;
}

export interface BackgroundProcessCallbacks {
  onStatusUpdate?: (jobId: string, status: ExportStatus) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const QUALITY_OPTIONS: ExportQualityOption[] = [
  {
    quality: 'low',
    label: '480p',
    description: 'Fast export, smaller file size',
    resolution: { width: 854, height: 480 },
    bitrate: 1500,
    format: 'mp4',
  },
  {
    quality: 'medium',
    label: '720p',
    description: 'Good balance of quality and size',
    resolution: { width: 1280, height: 720 },
    bitrate: 3000,
    format: 'mp4',
  },
  {
    quality: 'high',
    label: '1080p',
    description: 'High quality, larger file',
    resolution: { width: 1920, height: 1080 },
    bitrate: 6000,
    format: 'mp4',
  },
  {
    quality: 'original',
    label: 'Original',
    description: 'Same quality as source video',
    resolution: { width: 0, height: 0 }, // determined by source
    bitrate: 0, // determined by source
    format: 'mp4',
  },
];

export const MAX_CONCURRENT_EXPORTS = 2;
export const EXPORT_POLL_INTERVAL_MS = 2000;
export const PREVIEW_DEBOUNCE_MS = 300;
export const MAX_EXPORT_HISTORY = 50;

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Generate a unique export ID */
export function generateExportId(): string {
  return `export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Estimate file size in bytes based on quality, bitrate, and duration */
export function estimateFileSize(
  bitrateKbps: number,
  durationSeconds: number
): number {
  if (bitrateKbps <= 0 || durationSeconds <= 0) return 0;
  return Math.round((bitrateKbps * 1000 * durationSeconds) / 8);
}

/** Format bytes into a human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1
  );
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format milliseconds into a human-readable duration string */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Get quality option details for a given quality level */
export function getQualityOption(
  quality: ExportQuality
): ExportQualityOption | undefined {
  return QUALITY_OPTIONS.find((opt) => opt.quality === quality);
}

/** Calculate estimated export time based on duration and quality */
export function estimateExportTime(
  durationSeconds: number,
  quality: ExportQuality
): number {
  // Rough estimate: higher quality takes longer
  const multipliers: Record<ExportQuality, number> = {
    low: 0.5,
    medium: 1.0,
    high: 2.0,
    original: 2.5,
  };
  const multiplier = multipliers[quality] ?? 1.0;
  return Math.round(durationSeconds * multiplier * 1000);
}

// ─── EditingPreviewSystem ─────────────────────────────────────────────────────

/**
 * Real-time preview system that applies edit operations without affecting
 * the original video. Maintains a virtual edit decision list (EDL) and
 * renders preview frames on demand.
 */
export class EditingPreviewSystem {
  private state: PreviewState;
  private callbacks: PreviewCallbacks;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;

  constructor(
    originalVideoUrl: string,
    callbacks: PreviewCallbacks = {}
  ) {
    this.callbacks = callbacks;
    this.state = {
      isActive: false,
      mode: 'realtime',
      currentTime: 0,
      duration: 0,
      editOperations: [],
      isBuffering: false,
      originalVideoUrl,
      previewVideoUrl: undefined,
    };
  }

  /** Activate the preview system */
  public activate(mode: PreviewMode = 'realtime'): void {
    if (this.isDestroyed) return;
    this.state.isActive = true;
    this.state.mode = mode;
    this.callbacks.onPreviewReady?.();
  }

  /** Deactivate the preview without clearing edits */
  public deactivate(): void {
    this.state.isActive = false;
  }

  /** Add an edit operation to the preview pipeline */
  public addEditOperation(operation: EditOperation): void {
    if (this.isDestroyed) return;
    this.state.editOperations.push(operation);
    this.schedulePreviewUpdate();
  }

  /** Remove the last edit operation (undo support) */
  public removeLastOperation(): EditOperation | undefined {
    const removed = this.state.editOperations.pop();
    if (removed) {
      this.schedulePreviewUpdate();
    }
    return removed;
  }

  /** Clear all edit operations */
  public clearOperations(): void {
    this.state.editOperations = [];
    this.schedulePreviewUpdate();
  }

  /** Set current preview time */
  public setCurrentTime(time: number): void {
    if (this.isDestroyed) return;
    this.state.currentTime = Math.max(0, Math.min(time, this.state.duration));
    this.callbacks.onPreviewUpdate?.(this.state.currentTime);
  }

  /** Set total duration */
  public setDuration(duration: number): void {
    if (duration >= 0) {
      this.state.duration = duration;
    }
  }

  /** Set buffering state */
  public setBuffering(isBuffering: boolean): void {
    if (this.state.isBuffering !== isBuffering) {
      this.state.isBuffering = isBuffering;
      this.callbacks.onBufferingChange?.(isBuffering);
    }
  }

  /** Check whether the preview is currently active */
  public isActive(): boolean {
    return this.state.isActive;
  }

  /** Get current preview state */
  public getState(): PreviewState {
    return { ...this.state, editOperations: [...this.state.editOperations] };
  }

  /** Get the computed preview URL (original remains unchanged) */
  public getPreviewUrl(): string {
    return this.state.previewVideoUrl ?? this.state.originalVideoUrl;
  }

  /** Get the original video URL (never modified) */
  public getOriginalUrl(): string {
    return this.state.originalVideoUrl;
  }

  /** Get the number of pending edits */
  public getOperationCount(): number {
    return this.state.editOperations.length;
  }

  /**
   * Compute effective duration after all edit operations.
   * Trims reduce duration, splits don't change total.
   */
  public getEffectiveDuration(): number {
    let duration = this.state.duration;
    for (const op of this.state.editOperations) {
      if (op.type === 'trim') {
        const trim = op.data as TrimOperation;
        const frameDiff = Math.abs(trim.newFrame - trim.originalFrame);
        // Rough approximation: trim reduces duration by removed frames
        duration = Math.max(0, duration - frameDiff);
      }
    }
    return duration;
  }

  /** Debounced preview update to avoid excessive redraws */
  private schedulePreviewUpdate(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      if (!this.isDestroyed) {
        this.applyPreview();
      }
    }, PREVIEW_DEBOUNCE_MS);
  }

  /** Apply current edits to produce preview (simulated) */
  private applyPreview(): void {
    if (!this.state.isActive) return;
    // In a real implementation, this would construct a preview URL
    // from the edit decision list. Here we signal readiness.
    this.state.previewVideoUrl = `${this.state.originalVideoUrl}?preview=true&ops=${this.state.editOperations.length}`;
    this.callbacks.onPreviewReady?.();
  }

  /** Clean up resources */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.state.isActive = false;
    this.state.editOperations = [];
  }
}

// ─── ExportManager ────────────────────────────────────────────────────────────

/**
 * Manages video exports with multiple quality options, progress tracking,
 * and export history. Handles queuing, concurrent export limits, and
 * integrates with background processing for status updates.
 */
export class ExportManager {
  private jobs: Map<string, ExportJob> = new Map();
  private history: ExportJob[] = [];
  private callbacks: ExportCallbacks;
  private activeExports = 0;
  private queue: ExportOptions[] = [];
  private isDestroyed = false;

  constructor(callbacks: ExportCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Start a new export job */
  public startExport(options: ExportOptions): ExportJob {
    const qualityOption = getQualityOption(options.quality);
    const id = generateExportId();
    const job: ExportJob = {
      id,
      videoId: options.videoId,
      quality: options.quality,
      format: options.format,
      resolution: qualityOption?.resolution ?? { width: 1920, height: 1080 },
      bitrate: qualityOption?.bitrate ?? 6000,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(id, job);

    if (this.activeExports < MAX_CONCURRENT_EXPORTS) {
      this.processJob(job);
    } else {
      this.queue.push(options);
    }

    this.callbacks.onExportStart?.(job);
    return job;
  }

  /** Cancel an in-progress or queued export */
  public cancelExport(exportId: string): boolean {
    const job = this.jobs.get(exportId);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    job.status = 'cancelled';
    job.progress = 0;

    if (job.status !== 'queued') {
      this.activeExports = Math.max(0, this.activeExports - 1);
    }

    // Remove from queue if queued
    this.queue = this.queue.filter(
      (opts) => !this.isJobForOptions(job, opts)
    );

    this.addToHistory(job);
    this.callbacks.onExportCancelled?.(job);
    this.processNextInQueue();
    return true;
  }

  /** Update progress for an active export */
  public updateProgress(exportId: string, progress: ExportProgress): void {
    const job = this.jobs.get(exportId);
    if (!job || job.status === 'cancelled' || job.status === 'completed') {
      return;
    }

    job.status = progress.status;
    job.progress = Math.min(100, Math.max(0, progress.percent));

    this.callbacks.onExportProgress?.(progress);

    if (progress.status === 'completed') {
      this.completeJob(job);
    } else if (progress.status === 'failed') {
      this.failJob(job, new Error(progress.currentStep || 'Export failed'));
    }
  }

  /** Mark job as completed with download URL */
  public completeJob(job: ExportJob, downloadUrl?: string): void {
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    if (downloadUrl) {
      job.downloadUrl = downloadUrl;
    }
    this.activeExports = Math.max(0, this.activeExports - 1);
    this.addToHistory(job);
    this.callbacks.onExportComplete?.(job);
    this.processNextInQueue();
  }

  /** Mark job as failed with error details */
  public failJob(job: ExportJob, error: Error): void {
    job.status = 'failed';
    job.error = error.message;
    this.activeExports = Math.max(0, this.activeExports - 1);
    this.addToHistory(job);
    this.callbacks.onExportError?.(job, error);
    this.processNextInQueue();
  }

  /** Get a specific export job */
  public getJob(exportId: string): ExportJob | undefined {
    return this.jobs.get(exportId);
  }

  /** Get all active (non-completed, non-failed) jobs */
  public getActiveJobs(): ExportJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status !== 'completed' && j.status !== 'failed' && j.status !== 'cancelled'
    );
  }

  /** Get the full export history */
  public getHistory(): ExportJob[] {
    return [...this.history];
  }

  /** Get the number of currently active exports */
  public getActiveCount(): number {
    return this.activeExports;
  }

  /** Get jobs waiting in the queue */
  public getQueuedCount(): number {
    return this.queue.length;
  }

  /** Clear completed/failed exports from history */
  public clearHistory(): void {
    this.history = [];
  }

  /** Remove a specific export from history */
  public removeFromHistory(exportId: string): boolean {
    const index = this.history.findIndex((j) => j.id === exportId);
    if (index === -1) return false;
    this.history.splice(index, 1);
    return true;
  }

  /** Check if an export can be retried */
  public canRetry(exportId: string): boolean {
    const job = this.jobs.get(exportId);
    return job?.status === 'failed';
  }

  /** Retry a failed export */
  public retryExport(exportId: string): ExportJob | null {
    const job = this.jobs.get(exportId);
    if (!job || job.status !== 'failed') return null;

    // Reset job state
    job.status = 'queued';
    job.progress = 0;
    job.error = undefined;
    job.completedAt = undefined;

    if (this.activeExports < MAX_CONCURRENT_EXPORTS) {
      this.processJob(job);
    }

    return job;
  }

  /** Process a job (simulate starting background processing) */
  private processJob(job: ExportJob): void {
    if (this.isDestroyed) return;
    job.status = 'processing';
    this.activeExports++;
  }

  /** Process next item in the queue if capacity allows */
  private processNextInQueue(): void {
    if (this.isDestroyed) return;
    if (this.queue.length === 0 || this.activeExports >= MAX_CONCURRENT_EXPORTS) {
      return;
    }
    const next = this.queue.shift();
    if (next) {
      this.startExport(next);
    }
  }

  /** Add job to history with max cap */
  private addToHistory(job: ExportJob): void {
    this.history.unshift({ ...job });
    if (this.history.length > MAX_EXPORT_HISTORY) {
      this.history = this.history.slice(0, MAX_EXPORT_HISTORY);
    }
  }

  /** Check if a job matches given options (for queue deduplication) */
  private isJobForOptions(job: ExportJob, opts: ExportOptions): boolean {
    return job.videoId === opts.videoId && job.quality === opts.quality;
  }

  /** Destroy the manager and cancel active jobs */
  public destroy(): void {
    this.isDestroyed = true;
    this.queue = [];
    for (const job of this.jobs.values()) {
      if (job.status === 'processing' || job.status === 'encoding') {
        job.status = 'cancelled';
      }
    }
    this.activeExports = 0;
  }
}

// ─── BackgroundProcessingManager ──────────────────────────────────────────────

/**
 * Manages background processing integration with status updates.
 * Polls for status updates on active exports and relays notifications.
 */
export class BackgroundProcessingManager {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private trackedJobs: Set<string> = new Set();
  private callbacks: BackgroundProcessCallbacks;
  private isConnected = false;
  private isDestroyed = false;
  private exportManager: ExportManager;

  constructor(
    exportManager: ExportManager,
    callbacks: BackgroundProcessCallbacks = {}
  ) {
    this.exportManager = exportManager;
    this.callbacks = callbacks;
  }

  /** Start polling for status updates */
  public startPolling(intervalMs: number = EXPORT_POLL_INTERVAL_MS): void {
    if (this.isDestroyed || this.pollInterval !== null) return;
    this.isConnected = true;
    this.callbacks.onConnectionChange?.(true);
    this.pollInterval = setInterval(() => {
      this.pollStatus();
    }, intervalMs);
  }

  /** Stop polling for status updates */
  public stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isConnected = false;
    this.callbacks.onConnectionChange?.(false);
  }

  /** Register a job for tracking */
  public trackJob(jobId: string): void {
    this.trackedJobs.add(jobId);
  }

  /** Stop tracking a specific job */
  public untrackJob(jobId: string): void {
    this.trackedJobs.delete(jobId);
  }

  /** Get all tracked job IDs */
  public getTrackedJobs(): string[] {
    return Array.from(this.trackedJobs);
  }

  /** Check if currently connected/polling */
  public isPolling(): boolean {
    return this.isConnected && this.pollInterval !== null;
  }

  /** Simulate receiving a status update from the backend */
  public receiveStatusUpdate(jobId: string, status: ExportStatus): void {
    if (!this.trackedJobs.has(jobId)) return;
    this.callbacks.onStatusUpdate?.(jobId, status);

    // If job completed or failed, stop tracking
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.trackedJobs.delete(jobId);
    }
  }

  /** Poll for updates on tracked jobs */
  private pollStatus(): void {
    if (this.isDestroyed) return;
    for (const jobId of this.trackedJobs) {
      const job = this.exportManager.getJob(jobId);
      if (job) {
        this.callbacks.onStatusUpdate?.(jobId, job.status);
        if (
          job.status === 'completed' ||
          job.status === 'failed' ||
          job.status === 'cancelled'
        ) {
          this.trackedJobs.delete(jobId);
        }
      }
    }
  }

  /** Destroy and clean up */
  public destroy(): void {
    this.isDestroyed = true;
    this.stopPolling();
    this.trackedJobs.clear();
  }
}

// ─── ExportHistoryManager ─────────────────────────────────────────────────────

/**
 * Manages export history and download management. Provides access to
 * completed exports with download links and file metadata.
 */
export class ExportHistoryManager {
  private history: ExportJob[] = [];
  private maxItems: number;

  constructor(maxItems: number = MAX_EXPORT_HISTORY) {
    this.maxItems = maxItems;
  }

  /** Add a completed export to history */
  public addEntry(job: ExportJob): void {
    this.history.unshift({ ...job });
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems);
    }
  }

  /** Get all history entries */
  public getEntries(): ExportJob[] {
    return [...this.history];
  }

  /** Get history entries filtered by status */
  public getByStatus(status: ExportStatus): ExportJob[] {
    return this.history.filter((j) => j.status === status);
  }

  /** Get completed exports with download URLs */
  public getDownloadable(): ExportJob[] {
    return this.history.filter(
      (j) => j.status === 'completed' && j.downloadUrl
    );
  }

  /** Get a specific history entry */
  public getEntry(exportId: string): ExportJob | undefined {
    return this.history.find((j) => j.id === exportId);
  }

  /** Remove a specific history entry */
  public removeEntry(exportId: string): boolean {
    const index = this.history.findIndex((j) => j.id === exportId);
    if (index === -1) return false;
    this.history.splice(index, 1);
    return true;
  }

  /** Clear all history */
  public clear(): void {
    this.history = [];
  }

  /** Get total number of entries */
  public getCount(): number {
    return this.history.length;
  }

  /** Get total download size for all completed exports */
  public getTotalDownloadSize(): number {
    return this.history
      .filter((j) => j.status === 'completed' && j.fileSizeBytes)
      .reduce((sum, j) => sum + (j.fileSizeBytes ?? 0), 0);
  }
}
