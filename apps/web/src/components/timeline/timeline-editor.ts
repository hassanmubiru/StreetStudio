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

// ─── Timeline Editor ──────────────────────────────────────────────────────────

/**
 * TimelineEditor
 * 
 * Frame-accurate timeline editor with zoom/navigation controls, trim tools,
 * split functionality, and audio waveform visualization. Designed for precise
 * video editing with keyboard shortcuts and accessible drag handles.
 */
export class TimelineEditor {
  private container: HTMLElement;
  private options: Required<TimelineEditorOptions>;
  private callbacks: TimelineEditorCallbacks;
  private state: TimelineState;
  private waveformRenderer: WaveformRenderer | null = null;

  // DOM elements
  private timelineElement!: HTMLElement;
  private rulerElement!: HTMLElement;
  private trackElement!: HTMLElement;
  private playheadElement!: HTMLElement;
  private waveformCanvas!: HTMLCanvasElement;
  private controlsElement!: HTMLElement;
  private timecodeDisplay!: HTMLElement;
  private zoomSlider!: HTMLInputElement;
  private splitPreviewElement!: HTMLElement;

  // Interaction state
  private isDraggingPlayhead = false;
  private isDraggingTrimHandle = false;
  private activeTrimOperation: TrimOperation | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isDestroyed = false;

  private readonly defaultOptions: Required<TimelineEditorOptions> = {
    frameRate: DEFAULT_FRAME_RATE,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    defaultZoom: DEFAULT_ZOOM,
    waveformColor: '#4fc3f7',
    waveformBackgroundColor: '#1a1a2e',
    playheadColor: '#ff5252',
    trimHandleColor: '#ffab40',
    splitPreviewColor: '#69f0ae',
    enableWaveform: true,
    enableKeyboardShortcuts: true,
    snapToFrame: true,
  };

  constructor(
    container: HTMLElement,
    options: TimelineEditorOptions = {},
    callbacks: TimelineEditorCallbacks = {}
  ) {
    this.container = container;
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;
    this.state = this.createInitialState();

    this.createDOM();
    this.setupEventListeners();

    if (this.options.enableKeyboardShortcuts) {
      this.setupKeyboardShortcuts();
    }

    this.setupResizeObserver();
  }

  private createInitialState(): TimelineState {
    return {
      clips: [],
      playheadFrame: 0,
      zoomLevel: this.options?.defaultZoom ?? DEFAULT_ZOOM,
      scrollOffset: 0,
      isPlaying: false,
      duration: 0,
      frameRate: this.options?.frameRate ?? DEFAULT_FRAME_RATE,
      selectedClipId: null,
      trimMode: null,
      splitPreviewFrame: null,
    };
  }

  // ─── DOM Construction ─────────────────────────────────────────────────────

  private createDOM(): void {
    this.container.innerHTML = '';
    this.container.classList.add('timeline-editor');

    // Controls bar
    this.controlsElement = document.createElement('div');
    this.controlsElement.className = 'timeline-controls';
    this.controlsElement.setAttribute('role', 'toolbar');
    this.controlsElement.setAttribute('aria-label', 'Timeline editor controls');
    this.controlsElement.innerHTML = this.getControlsHTML();
    this.container.appendChild(this.controlsElement);

    // Timeline area
    this.timelineElement = document.createElement('div');
    this.timelineElement.className = 'timeline-area';
    this.timelineElement.setAttribute('role', 'region');
    this.timelineElement.setAttribute('aria-label', 'Timeline');

    // Ruler (time scale)
    this.rulerElement = document.createElement('div');
    this.rulerElement.className = 'timeline-ruler';
    this.rulerElement.style.height = `${RULER_HEIGHT}px`;
    this.timelineElement.appendChild(this.rulerElement);

    // Track area
    this.trackElement = document.createElement('div');
    this.trackElement.className = 'timeline-track';
    this.trackElement.style.height = `${TIMELINE_TRACK_HEIGHT}px`;
    this.trackElement.setAttribute('role', 'slider');
    this.trackElement.setAttribute('aria-label', 'Timeline track');
    this.trackElement.setAttribute('aria-valuemin', '0');
    this.trackElement.setAttribute('aria-valuemax', String(this.state.duration));
    this.trackElement.setAttribute('aria-valuenow', '0');
    this.trackElement.setAttribute('tabindex', '0');
    this.timelineElement.appendChild(this.trackElement);

    // Waveform canvas
    this.waveformCanvas = document.createElement('canvas');
    this.waveformCanvas.className = 'timeline-waveform';
    this.waveformCanvas.style.height = `${WAVEFORM_HEIGHT}px`;
    this.waveformCanvas.setAttribute('aria-label', 'Audio waveform');
    this.waveformCanvas.setAttribute('role', 'img');
    if (this.options.enableWaveform) {
      this.timelineElement.appendChild(this.waveformCanvas);
      this.waveformRenderer = new WaveformRenderer(
        this.waveformCanvas,
        this.options.waveformColor,
        this.options.waveformBackgroundColor
      );
    }

    // Playhead
    this.playheadElement = document.createElement('div');
    this.playheadElement.className = 'timeline-playhead';
    this.playheadElement.style.width = `${PLAYHEAD_WIDTH}px`;
    this.playheadElement.style.backgroundColor = this.options.playheadColor;
    this.playheadElement.setAttribute('role', 'separator');
    this.playheadElement.setAttribute('aria-label', 'Playhead position');
    this.playheadElement.setAttribute('aria-orientation', 'vertical');
    this.timelineElement.appendChild(this.playheadElement);

    // Split preview line
    this.splitPreviewElement = document.createElement('div');
    this.splitPreviewElement.className = 'timeline-split-preview';
    this.splitPreviewElement.style.backgroundColor = this.options.splitPreviewColor;
    this.splitPreviewElement.style.display = 'none';
    this.splitPreviewElement.setAttribute('aria-hidden', 'true');
    this.timelineElement.appendChild(this.splitPreviewElement);

    this.container.appendChild(this.timelineElement);

    // Cache control references
    this.timecodeDisplay = this.controlsElement.querySelector(
      '.timecode-display'
    ) as HTMLElement;
    this.zoomSlider = this.controlsElement.querySelector(
      '.zoom-slider'
    ) as HTMLInputElement;

    this.updatePlayheadPosition();
    this.renderRuler();
  }

  private getControlsHTML(): string {
    const zoomPercent = Math.round(this.state.zoomLevel * 100);
    return `
      <div class="timeline-controls-group" role="group" aria-label="Playback controls">
        <button class="btn-prev-frame" aria-label="Previous frame" title="Previous frame (,)">⏮</button>
        <button class="btn-play-pause" aria-label="Play/Pause" title="Play/Pause (Space)">▶</button>
        <button class="btn-next-frame" aria-label="Next frame" title="Next frame (.)">⏭</button>
      </div>
      <div class="timeline-controls-group" role="group" aria-label="Timecode">
        <span class="timecode-display" aria-live="polite" aria-atomic="true">
          ${frameToTimecode(this.state.playheadFrame, this.state.frameRate)}
        </span>
      </div>
      <div class="timeline-controls-group" role="group" aria-label="Edit tools">
        <button class="btn-trim-in" aria-label="Set in point" title="Set in point (I)">In</button>
        <button class="btn-trim-out" aria-label="Set out point" title="Set out point (O)">Out</button>
        <button class="btn-split" aria-label="Split at playhead" title="Split at playhead (S)">✂</button>
      </div>
      <div class="timeline-controls-group" role="group" aria-label="Zoom controls">
        <button class="btn-zoom-out" aria-label="Zoom out" title="Zoom out (-)">−</button>
        <input type="range" class="zoom-slider" min="${this.options.minZoom * 100}"
               max="${this.options.maxZoom * 100}" value="${zoomPercent}"
               aria-label="Zoom level" aria-valuetext="${zoomPercent}%">
        <button class="btn-zoom-in" aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button class="btn-zoom-fit" aria-label="Fit to view" title="Fit to view (F)">⬜</button>
      </div>
    `;
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────

  private setupEventListeners(): void {
    // Control button clicks
    this.controlsElement.querySelector('.btn-prev-frame')?.addEventListener('click', () => this.prevFrame());
    this.controlsElement.querySelector('.btn-play-pause')?.addEventListener('click', () => this.togglePlayPause());
    this.controlsElement.querySelector('.btn-next-frame')?.addEventListener('click', () => this.nextFrame());
    this.controlsElement.querySelector('.btn-trim-in')?.addEventListener('click', () => this.setInPoint());
    this.controlsElement.querySelector('.btn-trim-out')?.addEventListener('click', () => this.setOutPoint());
    this.controlsElement.querySelector('.btn-split')?.addEventListener('click', () => this.splitAtPlayhead());
    this.controlsElement.querySelector('.btn-zoom-out')?.addEventListener('click', () => this.zoomOut());
    this.controlsElement.querySelector('.btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
    this.controlsElement.querySelector('.btn-zoom-fit')?.addEventListener('click', () => this.zoomToFit());

    // Zoom slider
    this.zoomSlider?.addEventListener('input', (e) => {
      const value = Number((e.target as HTMLInputElement).value);
      this.setZoom(value / 100);
    });

    // Track click for playhead positioning
    this.trackElement.addEventListener('mousedown', (e) => this.handleTrackMouseDown(e));
    this.trackElement.addEventListener('mousemove', (e) => this.handleTrackMouseMove(e));

    // Global mouse events for drag operations
    document.addEventListener('mousemove', (e) => this.handleDocumentMouseMove(e));
    document.addEventListener('mouseup', () => this.handleDocumentMouseUp());

    // Timeline scroll
    this.timelineElement.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
  }

  private setupKeyboardShortcuts(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (this.isDestroyed) return;
      // Don't capture if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case ',':
          e.preventDefault();
          this.prevFrame();
          break;
        case '.':
          e.preventDefault();
          this.nextFrame();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          this.setInPoint();
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          this.setOutPoint();
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.splitAtPlayhead();
          }
          break;
        case '-':
        case '_':
          e.preventDefault();
          this.zoomOut();
          break;
        case '=':
        case '+':
          e.preventDefault();
          this.zoomIn();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.zoomToFit();
          break;
        case 'Home':
          e.preventDefault();
          this.seekToFrame(0);
          break;
        case 'End':
          e.preventDefault();
          this.seekToFrame(this.state.duration);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            this.seekRelativeFrames(-10);
          } else {
            this.prevFrame();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            this.seekRelativeFrames(10);
          } else {
            this.nextFrame();
          }
          break;
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDestroyed) return;
      this.updateWaveformSize();
      this.renderRuler();
      this.renderClips();
      this.updatePlayheadPosition();
    });
    this.resizeObserver.observe(this.timelineElement);
  }

  // ─── Mouse Handlers ───────────────────────────────────────────────────────

  private handleTrackMouseDown(e: MouseEvent): void {
    const rect = this.trackElement.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Check if clicking on a trim handle
    const trimHandle = this.getTrimHandleAtPosition(x);
    if (trimHandle) {
      this.startTrimDrag(trimHandle.clipId, trimHandle.mode, e);
      return;
    }

    // Otherwise position the playhead
    this.isDraggingPlayhead = true;
    const frame = this.pixelToFrameInTrack(x);
    this.seekToFrame(frame);
  }

  private handleTrackMouseMove(e: MouseEvent): void {
    if (this.isDraggingTrimHandle || this.isDraggingPlayhead) return;

    const rect = this.trackElement.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Update cursor based on what's under the mouse
    const trimHandle = this.getTrimHandleAtPosition(x);
    if (trimHandle) {
      this.trackElement.style.cursor = 'col-resize';
    } else {
      this.trackElement.style.cursor = 'pointer';
    }
  }

  private handleDocumentMouseMove(e: MouseEvent): void {
    if (this.isDraggingPlayhead) {
      const rect = this.trackElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = this.pixelToFrameInTrack(x);
      this.seekToFrame(frame);
    }

    if (this.isDraggingTrimHandle && this.activeTrimOperation) {
      const rect = this.trackElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = this.pixelToFrameInTrack(x);
      this.updateTrimDrag(frame);
    }
  }

  private handleDocumentMouseUp(): void {
    if (this.isDraggingPlayhead) {
      this.isDraggingPlayhead = false;
    }

    if (this.isDraggingTrimHandle && this.activeTrimOperation) {
      this.endTrimDrag();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom with ctrl+scroll
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.setZoom(this.state.zoomLevel + delta);
    } else {
      // Horizontal scroll
      const frameDelta = e.deltaX > 0 ? 5 : -5;
      this.setScrollOffset(this.state.scrollOffset + frameDelta);
    }
  }

  // ─── Trim Operations ──────────────────────────────────────────────────────

  private getTrimHandleAtPosition(x: number): { clipId: string; mode: TrimMode } | null {
    for (const clip of this.state.clips) {
      const inPixel = frameToPixel(clip.inPoint - this.state.scrollOffset, this.state.zoomLevel);
      const outPixel = frameToPixel(clip.outPoint - this.state.scrollOffset, this.state.zoomLevel);

      if (Math.abs(x - inPixel) <= TRIM_HANDLE_WIDTH / 2) {
        return { clipId: clip.id, mode: 'in' };
      }
      if (Math.abs(x - outPixel) <= TRIM_HANDLE_WIDTH / 2) {
        return { clipId: clip.id, mode: 'out' };
      }
    }
    return null;
  }

  private startTrimDrag(clipId: string, mode: TrimMode, _e: MouseEvent): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip) return;

    this.isDraggingTrimHandle = true;
    const originalFrame = mode === 'in' ? clip.inPoint : clip.outPoint;
    this.activeTrimOperation = {
      clipId,
      mode,
      originalFrame,
      newFrame: originalFrame,
    };

    this.state.trimMode = mode;
    this.callbacks.onTrimStart?.(this.activeTrimOperation);
    this.notifyStateChange();
  }

  private updateTrimDrag(frame: number): void {
    if (!this.activeTrimOperation) return;

    const clip = this.state.clips.find(c => c.id === this.activeTrimOperation!.clipId);
    if (!clip) return;

    let clampedFrame: number;
    if (this.activeTrimOperation.mode === 'in') {
      // In point cannot exceed out point - MIN_CLIP_FRAMES
      clampedFrame = clamp(frame, clip.startFrame, clip.outPoint - MIN_CLIP_FRAMES);
      clip.inPoint = clampedFrame;
    } else {
      // Out point cannot be less than in point + MIN_CLIP_FRAMES
      clampedFrame = clamp(frame, clip.inPoint + MIN_CLIP_FRAMES, clip.endFrame);
      clip.outPoint = clampedFrame;
    }

    this.activeTrimOperation.newFrame = clampedFrame;
    clip.duration = clip.outPoint - clip.inPoint;
    this.callbacks.onTrimUpdate?.(this.activeTrimOperation);
    this.renderClips();
    this.notifyStateChange();
  }

  private endTrimDrag(): void {
    if (!this.activeTrimOperation) return;

    this.isDraggingTrimHandle = false;
    this.state.trimMode = null;
    this.callbacks.onTrimEnd?.({ ...this.activeTrimOperation });
    this.activeTrimOperation = null;
    this.renderClips();
    this.notifyStateChange();
  }

  // ─── Split Operation ──────────────────────────────────────────────────────

  /** Split the clip at the current playhead position */
  public splitAtPlayhead(): SplitOperation | null {
    const playhead = this.state.playheadFrame;
    const clip = this.getClipAtFrame(playhead);
    if (!clip) return null;

    // Cannot split at the very start or end of a clip
    if (playhead <= clip.inPoint || playhead >= clip.outPoint) return null;

    const leftId = generateId();
    const rightId = generateId();

    const leftClip: TimelineClip = {
      id: leftId,
      startFrame: clip.startFrame,
      endFrame: clip.startFrame + (playhead - clip.inPoint),
      inPoint: clip.inPoint,
      outPoint: playhead,
      duration: playhead - clip.inPoint,
      sourceUrl: clip.sourceUrl,
      thumbnailUrl: clip.thumbnailUrl,
      type: clip.type,
    };

    const rightClip: TimelineClip = {
      id: rightId,
      startFrame: clip.startFrame + (playhead - clip.inPoint),
      endFrame: clip.endFrame,
      inPoint: playhead,
      outPoint: clip.outPoint,
      duration: clip.outPoint - playhead,
      sourceUrl: clip.sourceUrl,
      thumbnailUrl: clip.thumbnailUrl,
      type: clip.type,
    };

    // Replace original clip with the two new clips
    const clipIndex = this.state.clips.indexOf(clip);
    this.state.clips.splice(clipIndex, 1, leftClip, rightClip);
    this.recalculateDuration();

    const operation: SplitOperation = {
      clipId: clip.id,
      splitFrame: playhead,
      leftClipId: leftId,
      rightClipId: rightId,
    };

    // Show split preview briefly
    this.showSplitPreview(playhead);
    this.callbacks.onSplit?.(operation);
    this.renderClips();
    this.notifyStateChange();
    return operation;
  }

  /** Show a visual split preview at a given frame */
  private showSplitPreview(frame: number): void {
    const pixel = frameToPixel(frame - this.state.scrollOffset, this.state.zoomLevel);
    this.splitPreviewElement.style.left = `${pixel}px`;
    this.splitPreviewElement.style.display = 'block';
    this.state.splitPreviewFrame = frame;

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.splitPreviewElement.style.display = 'none';
        this.state.splitPreviewFrame = null;
      }
    }, 1500);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Add a clip to the timeline */
  public addClip(clip: TimelineClip): void {
    this.state.clips.push(clip);
    this.recalculateDuration();
    this.renderClips();
    this.notifyStateChange();
  }

  /** Remove a clip by ID */
  public removeClip(clipId: string): boolean {
    const index = this.state.clips.findIndex(c => c.id === clipId);
    if (index === -1) return false;
    this.state.clips.splice(index, 1);
    if (this.state.selectedClipId === clipId) {
      this.state.selectedClipId = null;
    }
    this.recalculateDuration();
    this.renderClips();
    this.notifyStateChange();
    return true;
  }

  /** Load multiple clips into the timeline */
  public loadClips(clips: TimelineClip[]): void {
    this.state.clips = [...clips];
    this.recalculateDuration();
    this.renderClips();
    this.notifyStateChange();
  }

  /** Seek to a specific frame */
  public seekToFrame(frame: number): void {
    const clampedFrame = clamp(Math.round(frame), 0, this.state.duration);
    this.state.playheadFrame = clampedFrame;
    this.updatePlayheadPosition();
    this.updateTimecodeDisplay();
    this.callbacks.onPlayheadChange?.(clampedFrame);
    this.notifyStateChange();
  }

  /** Seek relative to current position */
  public seekRelativeFrames(delta: number): void {
    this.seekToFrame(this.state.playheadFrame + delta);
  }

  /** Move to the next frame */
  public nextFrame(): void {
    this.seekRelativeFrames(1);
  }

  /** Move to the previous frame */
  public prevFrame(): void {
    this.seekRelativeFrames(-1);
  }

  /** Toggle play/pause state */
  public togglePlayPause(): void {
    this.state.isPlaying = !this.state.isPlaying;
    const btn = this.controlsElement.querySelector('.btn-play-pause');
    if (btn) {
      btn.textContent = this.state.isPlaying ? '⏸' : '▶';
      btn.setAttribute('aria-label', this.state.isPlaying ? 'Pause' : 'Play');
    }
    this.notifyStateChange();
  }

  /** Set in point for selected clip at current playhead position */
  public setInPoint(): void {
    const clip = this.getSelectedClipOrClipAtPlayhead();
    if (!clip) return;

    const frame = this.state.playheadFrame;
    if (frame >= clip.outPoint) return;

    const operation: TrimOperation = {
      clipId: clip.id,
      mode: 'in',
      originalFrame: clip.inPoint,
      newFrame: frame,
    };

    clip.inPoint = frame;
    clip.duration = clip.outPoint - clip.inPoint;
    this.callbacks.onTrimEnd?.(operation);
    this.renderClips();
    this.notifyStateChange();
  }

  /** Set out point for selected clip at current playhead position */
  public setOutPoint(): void {
    const clip = this.getSelectedClipOrClipAtPlayhead();
    if (!clip) return;

    const frame = this.state.playheadFrame;
    if (frame <= clip.inPoint) return;

    const operation: TrimOperation = {
      clipId: clip.id,
      mode: 'out',
      originalFrame: clip.outPoint,
      newFrame: frame,
    };

    clip.outPoint = frame;
    clip.duration = clip.outPoint - clip.inPoint;
    this.callbacks.onTrimEnd?.(operation);
    this.renderClips();
    this.notifyStateChange();
  }

  /** Select a clip by ID */
  public selectClip(clipId: string | null): void {
    this.state.selectedClipId = clipId;
    this.callbacks.onClipSelect?.(clipId);
    this.renderClips();
    this.notifyStateChange();
  }

  // ─── Zoom and Navigation ──────────────────────────────────────────────────

  /** Set the zoom level */
  public setZoom(level: number): void {
    const newZoom = clamp(level, this.options.minZoom, this.options.maxZoom);
    if (newZoom === this.state.zoomLevel) return;

    this.state.zoomLevel = newZoom;
    this.updateZoomUI();
    this.updatePlayheadPosition();
    this.renderRuler();
    this.renderClips();
    this.renderWaveform();
    this.callbacks.onZoomChange?.(newZoom);
    this.notifyStateChange();
  }

  /** Zoom in by a fixed increment */
  public zoomIn(): void {
    this.setZoom(this.state.zoomLevel * 1.25);
  }

  /** Zoom out by a fixed increment */
  public zoomOut(): void {
    this.setZoom(this.state.zoomLevel / 1.25);
  }

  /** Fit the entire timeline into view */
  public zoomToFit(): void {
    if (this.state.duration <= 0) return;
    const trackWidth = this.trackElement.clientWidth;
    if (trackWidth <= 0) return;
    const requiredZoom = trackWidth / (this.state.duration * PIXELS_PER_FRAME_BASE);
    this.setZoom(requiredZoom);
    this.setScrollOffset(0);
  }

  /** Set the horizontal scroll offset in frames */
  public setScrollOffset(offset: number): void {
    this.state.scrollOffset = Math.max(0, offset);
    this.updatePlayheadPosition();
    this.renderRuler();
    this.renderClips();
    this.renderWaveform();
    this.notifyStateChange();
  }
