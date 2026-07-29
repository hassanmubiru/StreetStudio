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

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Generate a simple unique ID */
function generateId(): string {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Waveform Renderer ────────────────────────────────────────────────────────

/**
 * Renders audio waveform data to a canvas for audio-visual synchronization.
 */
export class WaveformRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private waveformData: WaveformData | null = null;
  private color: string;
  private backgroundColor: string;

  constructor(canvas: HTMLCanvasElement, color = '#4fc3f7', backgroundColor = '#1a1a2e') {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.color = color;
    this.backgroundColor = backgroundColor;
  }

  /** Load waveform data for rendering */
  public setWaveformData(data: WaveformData): void {
    this.waveformData = data;
  }

  /** Get the currently loaded waveform data */
  public getWaveformData(): WaveformData | null {
    return this.waveformData;
  }

  /**
   * Render the waveform for a visible range.
   * @param startFrame - First visible frame
   * @param endFrame - Last visible frame
   * @param frameRate - Frames per second
   * @param zoomLevel - Current zoom level
   */
  public render(
    startFrame: number,
    endFrame: number,
    frameRate: number,
    zoomLevel: number
  ): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    if (!this.waveformData || frameRate <= 0) return;

    const { peaks, sampleRate, duration } = this.waveformData;
    const totalSamples = peaks.length;
    if (totalSamples === 0) return;

    const startSeconds = frameToSeconds(startFrame, frameRate);
    const endSeconds = frameToSeconds(endFrame, frameRate);
    const visibleDuration = endSeconds - startSeconds;
    if (visibleDuration <= 0) return;

    const samplesPerPixel = (visibleDuration * sampleRate) / width;
    const startSample = Math.floor((startSeconds / duration) * totalSamples);

    this.ctx.fillStyle = this.color;
    const centerY = height / 2;

    for (let px = 0; px < width; px++) {
      const sampleIndex = startSample + Math.floor(px * samplesPerPixel);
      if (sampleIndex < 0 || sampleIndex >= totalSamples) continue;

      const amplitude = Math.abs(peaks[sampleIndex]);
      const barHeight = amplitude * centerY;

      this.ctx.fillRect(px, centerY - barHeight, 1, barHeight * 2);
    }
  }

  /** Update canvas dimensions */
  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Update waveform color */
  public setColor(color: string): void {
    this.color = color;
  }

  /** Update background color */
  public setBackgroundColor(color: string): void {
    this.backgroundColor = color;
  }
}
