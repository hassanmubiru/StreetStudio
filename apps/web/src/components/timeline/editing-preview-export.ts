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
