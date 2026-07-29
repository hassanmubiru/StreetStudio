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
