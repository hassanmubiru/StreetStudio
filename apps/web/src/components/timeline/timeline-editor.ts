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

export interface WaveformData {
  peaks: Float32Array;
  sampleRate: number;
  duration: number;
  channelCount: number;
}

export interface TimelineEditorOptions {
  frameRate?: number;
  minZoom?: number;
  maxZoom?: number;
  defaultZoom?: number;
  waveformColor?: string;
  waveformBackgroundColor?: string;
  playheadColor?: string;
  trimHandleColor?: string;
  splitPreviewColor?: string;
  enableWaveform?: boolean;
  enableKeyboardShortcuts?: boolean;
  snapToFrame?: boolean;
}

export interface TimelineEditorCallbacks {
  onPlayheadChange?: (frame: number) => void;
  onTrimStart?: (operation: TrimOperation) => void;
  onTrimEnd?: (operation: TrimOperation) => void;
  onTrimUpdate?: (operation: TrimOperation) => void;
  onSplit?: (operation: SplitOperation) => void;
  onZoomChange?: (zoomLevel: number) => void;
  onClipSelect?: (clipId: string | null) => void;
  onStateChange?: (state: TimelineState) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
export const DEFAULT_ZOOM = 1;
export const DEFAULT_FRAME_RATE = 30;
export const PIXELS_PER_FRAME_BASE = 4;
export const TRIM_HANDLE_WIDTH = 12;
export const PLAYHEAD_WIDTH = 2;
export const WAVEFORM_HEIGHT = 48;
export const TIMELINE_TRACK_HEIGHT = 64;
export const RULER_HEIGHT = 24;
export const MIN_CLIP_FRAMES = 1;

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Convert a frame number to a timecode string (HH:MM:SS:FF) */
export function frameToTimecode(frame: number, frameRate: number): string {
  if (!isFinite(frame) || frame < 0 || !isFinite(frameRate) || frameRate <= 0) {
    return '00:00:00:00';
  }
  const totalFrames = Math.round(frame);
  const fps = Math.round(frameRate);
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

/** Convert a timecode string back to frame number */
export function timecodeToFrame(timecode: string, frameRate: number): number {
  const parts = timecode.split(':').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return 0;
  const [hh, mm, ss, ff] = parts;
  const fps = Math.round(frameRate);
  return hh * 3600 * fps + mm * 60 * fps + ss * fps + ff;
}

/** Convert a frame number to seconds */
export function frameToSeconds(frame: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return frame / frameRate;
}

/** Convert seconds to frame number */
export function secondsToFrame(seconds: number, frameRate: number): number {
  return Math.round(seconds * frameRate);
}

/** Calculate pixel position from frame given zoom level */
export function frameToPixel(frame: number, zoomLevel: number): number {
  return frame * PIXELS_PER_FRAME_BASE * zoomLevel;
}

/** Calculate frame from pixel position given zoom level */
export function pixelToFrame(pixel: number, zoomLevel: number): number {
  const ppf = PIXELS_PER_FRAME_BASE * zoomLevel;
  if (ppf === 0) return 0;
  return Math.round(pixel / ppf);
}
