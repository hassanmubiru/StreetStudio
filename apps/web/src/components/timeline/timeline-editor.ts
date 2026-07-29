/**
 * Timeline Video Editor
 * 
 * Frame-accurate timeline editor with zoom and navigation controls,
 * trim tools with draggable in/out point handles, split functionality
 * at playhead position with preview, and audio waveform visualization.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.9
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TimelineClip {
  id: string;
  startFrame: number;
  endFrame: number;
  inPoint: number;
  outPoint: number;
  duration: number;
  sourceUrl: string;
  thumbnailUrl?: string;
  type: 'video' | 'audio';
}

export interface TimelineState {
  clips: TimelineClip[];
  playheadFrame: number;
  zoomLevel: number;
  scrollOffset: number;
  isPlaying: boolean;
  duration: number;
  frameRate: number;
  selectedClipId: string | null;
  trimMode: TrimMode | null;
  splitPreviewFrame: number | null;
}

export type TrimMode = 'in' | 'out';

export interface TrimOperation {
  clipId: string;
  mode: TrimMode;
  originalFrame: number;
  newFrame: number;
}

export interface SplitOperation {
  clipId: string;
  splitFrame: number;
  leftClipId: string;
  rightClipId: string;
}
