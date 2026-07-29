/**
 * Timeline Controller
 * 
 * Manages frame-accurate timeline state including zoom, playback position,
 * markers, and seeking. Acts as the core state manager for all timeline components.
 * 
 * Requirements: 5.3, 5.10, 6.1
 */

export interface TimelineMarker {
  id: string;
  time: number;
  type: 'comment' | 'annotation' | 'chapter';
  label?: string;
  color?: string;
}

export interface TimelineState {
  duration: number;
  currentTime: number;
  zoomLevel: number;
  scrollOffset: number;
  visibleStartTime: number;
  visibleEndTime: number;
  frameRate: number;
  isScrubbing: boolean;
  markers: TimelineMarker[];
}

export interface TimelineOptions {
  frameRate?: number;
  minZoom?: number;
  maxZoom?: number;
  defaultZoom?: number;
  markerClickSeek?: boolean;
}

export interface TimelineCallbacks {
  onSeek?: (time: number) => void;
  onZoomChange?: (level: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (time: number) => void;
  onMarkerClick?: (marker: TimelineMarker) => void;
  onVisibleRangeChange?: (start: number, end: number) => void;
}

export const DEFAULT_FRAME_RATE = 30;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 100;
export const DEFAULT_ZOOM = 1;

/**
 * Snaps a time value to the nearest frame boundary given a frame rate.
 */
export function snapToFrame(time: number, frameRate: number): number {
  if (frameRate <= 0) return time;
  const frameDuration = 1 / frameRate;
  return Math.round(time / frameDuration) * frameDuration;
}

/**
 * Converts a frame number to seconds given a frame rate.
 */
export function frameToTime(frame: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return frame / frameRate;
}

/**
 * Converts seconds to a frame number given a frame rate.
 */
export function timeToFrame(time: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return Math.round(time * frameRate);
}

/**
 * Formats time as timecode (HH:MM:SS:FF) for frame-accurate display.
 */
export function formatTimecode(time: number, frameRate: number): string {
  if (!isFinite(time) || time < 0) return '00:00:00:00';
  const totalFrames = Math.round(time * frameRate);
  const fps = Math.round(frameRate);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

/**
 * TimelineController
 * 
 * Core controller managing timeline state, zoom levels, frame-accurate seeking,
 * and marker management. Works in tandem with TimelineComponent for rendering.
 */
export class TimelineController {
  private state: TimelineState;
  private options: Required<TimelineOptions>;
  private callbacks: TimelineCallbacks;
  private listeners: Map<string, Set<(data?: any) => void>> = new Map();

  private readonly defaultOptions: Required<TimelineOptions> = {
    frameRate: DEFAULT_FRAME_RATE,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    defaultZoom: DEFAULT_ZOOM,
    markerClickSeek: true,
  };

  constructor(options: TimelineOptions = {}, callbacks: TimelineCallbacks = {}) {
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;
    this.state = this.createInitialState();
  }

  private createInitialState(): TimelineState {
    return {
      duration: 0,
      currentTime: 0,
      zoomLevel: this.options.defaultZoom,
      scrollOffset: 0,
      visibleStartTime: 0,
      visibleEndTime: 0,
      frameRate: this.options.frameRate,
      isScrubbing: false,
      markers: [],
    };
  }

  // --- Duration & Time Management ---

  public setDuration(duration: number): void {
    if (duration < 0 || !isFinite(duration)) return;
    this.state.duration = duration;
    this.updateVisibleRange();
    this.emit('durationchange', duration);
  }

  public setCurrentTime(time: number): void {
    const clampedTime = Math.max(0, Math.min(time, this.state.duration));
    const snappedTime = snapToFrame(clampedTime, this.state.frameRate);
    this.state.currentTime = snappedTime;
    this.emit('timeupdate', snappedTime);
  }

  public seek(time: number): void {
    const clampedTime = Math.max(0, Math.min(time, this.state.duration));
    const snappedTime = snapToFrame(clampedTime, this.state.frameRate);
    this.state.currentTime = snappedTime;
    this.callbacks.onSeek?.(snappedTime);
    this.emit('seek', snappedTime);
  }

  public seekToFrame(frame: number): void {
    const time = frameToTime(frame, this.state.frameRate);
    this.seek(time);
  }

  public seekRelativeFrames(frames: number): void {
    const frameDuration = 1 / this.state.frameRate;
    const newTime = this.state.currentTime + frames * frameDuration;
    this.seek(newTime);
  }

  // --- Scrubbing ---

  public startScrub(): void {
    this.state.isScrubbing = true;
    this.callbacks.onScrubStart?.();
    this.emit('scrubstart');
  }

  public updateScrub(time: number): void {
    if (!this.state.isScrubbing) return;
    const clampedTime = Math.max(0, Math.min(time, this.state.duration));
    const snappedTime = snapToFrame(clampedTime, this.state.frameRate);
    this.state.currentTime = snappedTime;
    this.emit('scrubupdate', snappedTime);
  }

  public endScrub(): void {
    this.state.isScrubbing = false;
    this.callbacks.onScrubEnd?.(this.state.currentTime);
    this.seek(this.state.currentTime);
    this.emit('scrubend', this.state.currentTime);
  }

  // --- Zoom ---

  public setZoom(level: number): void {
    const clamped = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, level));
    this.state.zoomLevel = clamped;
    this.updateVisibleRange();
    this.callbacks.onZoomChange?.(clamped);
    this.emit('zoomchange', clamped);
  }

  public zoomIn(factor: number = 1.5): void {
    this.setZoom(this.state.zoomLevel * factor);
  }

  public zoomOut(factor: number = 1.5): void {
    this.setZoom(this.state.zoomLevel / factor);
  }

  public zoomToFit(): void {
    this.setZoom(this.options.minZoom);
    this.setScrollOffset(0);
  }

  // --- Scroll ---

  public setScrollOffset(offset: number): void {
    const maxOffset = Math.max(0, this.state.duration - this.getVisibleDuration());
    this.state.scrollOffset = Math.max(0, Math.min(offset, maxOffset));
    this.updateVisibleRange();
  }

  public getVisibleDuration(): number {
    if (this.state.zoomLevel <= 0) return this.state.duration;
    return this.state.duration / this.state.zoomLevel;
  }

  private updateVisibleRange(): void {
    const visibleDuration = this.getVisibleDuration();
    this.state.visibleStartTime = this.state.scrollOffset;
    this.state.visibleEndTime = Math.min(
      this.state.scrollOffset + visibleDuration,
      this.state.duration
    );
    this.callbacks.onVisibleRangeChange?.(this.state.visibleStartTime, this.state.visibleEndTime);
    this.emit('visiblerangechange', {
      start: this.state.visibleStartTime,
      end: this.state.visibleEndTime,
    });
  }

  // --- Markers ---

  public addMarker(marker: TimelineMarker): void {
    if (marker.time < 0 || marker.time > this.state.duration) return;
    const existing = this.state.markers.findIndex(m => m.id === marker.id);
    if (existing >= 0) {
      this.state.markers[existing] = marker;
    } else {
      this.state.markers.push(marker);
    }
    this.state.markers.sort((a, b) => a.time - b.time);
    this.emit('markerschange', this.state.markers);
  }

  public removeMarker(id: string): void {
    this.state.markers = this.state.markers.filter(m => m.id !== id);
    this.emit('markerschange', this.state.markers);
  }

  public clearMarkers(): void {
    this.state.markers = [];
    this.emit('markerschange', this.state.markers);
  }

  public getMarkersInRange(start: number, end: number): TimelineMarker[] {
    return this.state.markers.filter(m => m.time >= start && m.time <= end);
  }

  public handleMarkerClick(marker: TimelineMarker): void {
    this.callbacks.onMarkerClick?.(marker);
    if (this.options.markerClickSeek) {
      this.seek(marker.time);
    }
    this.emit('markerclick', marker);
  }

  // --- Jump to Timestamp ---

  public jumpToTimestamp(seconds: number): void {
    this.seek(seconds);
    this.ensureTimeVisible(seconds);
  }

  /**
   * Adjusts scroll offset so the given time is visible in the current viewport.
   */
  public ensureTimeVisible(time: number): void {
    const visibleDuration = this.getVisibleDuration();
    if (time < this.state.visibleStartTime || time > this.state.visibleEndTime) {
      // Center the time in the viewport
      const newOffset = Math.max(0, time - visibleDuration / 2);
      this.setScrollOffset(newOffset);
    }
  }

  // --- State Accessors ---

  public getState(): TimelineState {
    return { ...this.state, markers: [...this.state.markers] };
  }

  public getCurrentFrame(): number {
    return timeToFrame(this.state.currentTime, this.state.frameRate);
  }

  public getTotalFrames(): number {
    return timeToFrame(this.state.duration, this.state.frameRate);
  }

  public getTimecode(): string {
    return formatTimecode(this.state.currentTime, this.state.frameRate);
  }

  // --- Event Emitter ---

  public on(event: string, callback: (data?: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: (data?: any) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  // --- Cleanup ---

  public destroy(): void {
    this.listeners.clear();
    this.state.markers = [];
  }
}
