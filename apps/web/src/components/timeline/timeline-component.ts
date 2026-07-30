/**
 * Timeline Component
 * 
 * Renders a frame-accurate timeline with zoom controls, playback position indicator,
 * scrubbing, timeline markers for comments/annotations, and jump-to-timestamp support.
 * 
 * Requirements: 5.3, 5.10, 6.1
 */

import {
  TimelineController,
  TimelineMarker,
  TimelineState,
  formatTimecode,
  snapToFrame,
} from './timeline-controller.js';

export interface TimelineComponentOptions {
  /** Show zoom controls */
  showZoomControls?: boolean;
  /** Show timecode display */
  showTimecode?: boolean;
  /** Show frame-level tick marks */
  showFrameTicks?: boolean;
  /** Show comment markers */
  showMarkers?: boolean;
  /** Enable scrubbing via mouse/touch */
  enableScrubbing?: boolean;
  /** Enable mouse wheel zoom */
  enableWheelZoom?: boolean;
  /** Height of the timeline track in pixels */
  trackHeight?: number;
  /** Height of the marker lane in pixels */
  markerLaneHeight?: number;
}

export interface TimelineComponentCallbacks {
  onSeek?: (time: number) => void;
  onMarkerClick?: (marker: TimelineMarker) => void;
}

const DEFAULT_TRACK_HEIGHT = 48;
const DEFAULT_MARKER_LANE_HEIGHT = 24;

/**
 * TimelineComponent
 * 
 * Renders the interactive timeline UI with:
 * - Frame-accurate timeline with ruler ticks
 * - Zoom controls (zoom in, zoom out, fit)
 * - Precise playback position indicator (playhead)
 * - Mouse/touch scrubbing for seeking
 * - Timeline markers for comments and annotations
 * - Timecode display
 */
export class TimelineComponent {
  private container: HTMLElement;
  private controller: TimelineController;
  private options: Required<TimelineComponentOptions>;
  private callbacks: TimelineComponentCallbacks;

  private element: HTMLElement | null = null;
  private trackElement: HTMLElement | null = null;
  private playheadElement: HTMLElement | null = null;
  private markerLaneElement: HTMLElement | null = null;
  private timecodeElement: HTMLElement | null = null;
  private rulerCanvas: HTMLCanvasElement | null = null;

  private unsubscribers: (() => void)[] = [];
  private isDragging = false;
  private isDestroyed = false;

  private readonly defaultOptions: Required<TimelineComponentOptions> = {
    showZoomControls: true,
    showTimecode: true,
    showFrameTicks: true,
    showMarkers: true,
    enableScrubbing: true,
    enableWheelZoom: true,
    trackHeight: DEFAULT_TRACK_HEIGHT,
    markerLaneHeight: DEFAULT_MARKER_LANE_HEIGHT,
  };

  constructor(
    container: HTMLElement,
    controller: TimelineController,
    options: TimelineComponentOptions = {},
    callbacks: TimelineComponentCallbacks = {}
  ) {
    this.container = container;
    this.controller = controller;
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;

    this.render();
    this.setupEventListeners();
    this.subscribeToController();
  }

  // --- Rendering ---

  private render(): void {
    this.container.innerHTML = '';
    this.container.classList.add('timeline-component');
    this.container.setAttribute('role', 'slider');
    this.container.setAttribute('aria-label', 'Video timeline');
    this.container.setAttribute('aria-valuemin', '0');
    this.container.setAttribute('aria-valuemax', String(this.controller.getState().duration));
    this.container.setAttribute('aria-valuenow', String(this.controller.getState().currentTime));
    this.container.setAttribute('tabindex', '0');

    this.element = document.createElement('div');
    this.element.className = 'timeline-wrapper';
    this.element.style.cssText = 'display:flex;flex-direction:column;width:100%;user-select:none;';

    // Top toolbar: timecode + zoom controls
    const toolbar = this.createToolbar();
    this.element.appendChild(toolbar);

    // Timeline track (ruler + playhead + markers)
    const trackWrapper = this.createTrackWrapper();
    this.element.appendChild(trackWrapper);

    this.container.appendChild(this.element);
    this.renderRuler();
    this.renderMarkers();
    this.updatePlayheadPosition();
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'timeline-toolbar';
    toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:#1a1a2e;border-bottom:1px solid #333;';

    // Timecode display
    if (this.options.showTimecode) {
      this.timecodeElement = document.createElement('span');
      this.timecodeElement.className = 'timeline-timecode';
      this.timecodeElement.style.cssText = 'font-family:monospace;font-size:12px;color:#e0e0e0;min-width:100px;';
      this.timecodeElement.textContent = formatTimecode(0, this.controller.getState().frameRate);
      this.timecodeElement.setAttribute('aria-live', 'off');
      this.timecodeElement.setAttribute('aria-label', 'Current timecode');
      toolbar.appendChild(this.timecodeElement);
    }

    // Zoom controls
    if (this.options.showZoomControls) {
      const zoomControls = this.createZoomControls();
      toolbar.appendChild(zoomControls);
    }

    return toolbar;
  }

  private createZoomControls(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-zoom-controls';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:4px;';
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-label', 'Timeline zoom controls');

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'timeline-zoom-btn zoom-out';
    zoomOutBtn.setAttribute('aria-label', 'Zoom out');
    zoomOutBtn.setAttribute('title', 'Zoom out');
    zoomOutBtn.style.cssText = 'background:none;border:1px solid #555;border-radius:4px;color:#e0e0e0;padding:2px 6px;cursor:pointer;font-size:14px;';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.addEventListener('click', () => this.controller.zoomOut());

    const zoomFitBtn = document.createElement('button');
    zoomFitBtn.type = 'button';
    zoomFitBtn.className = 'timeline-zoom-btn zoom-fit';
    zoomFitBtn.setAttribute('aria-label', 'Zoom to fit');
    zoomFitBtn.setAttribute('title', 'Zoom to fit');
    zoomFitBtn.style.cssText = 'background:none;border:1px solid #555;border-radius:4px;color:#e0e0e0;padding:2px 6px;cursor:pointer;font-size:11px;';
    zoomFitBtn.textContent = 'Fit';
    zoomFitBtn.addEventListener('click', () => this.controller.zoomToFit());

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'timeline-zoom-btn zoom-in';
    zoomInBtn.setAttribute('aria-label', 'Zoom in');
    zoomInBtn.setAttribute('title', 'Zoom in');
    zoomInBtn.style.cssText = 'background:none;border:1px solid #555;border-radius:4px;color:#e0e0e0;padding:2px 6px;cursor:pointer;font-size:14px;';
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => this.controller.zoomIn());

    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'timeline-zoom-label';
    zoomLabel.style.cssText = 'font-size:11px;color:#aaa;margin-left:4px;min-width:40px;text-align:center;';
    zoomLabel.textContent = `${Math.round(this.controller.getState().zoomLevel)}x`;
    zoomLabel.setAttribute('aria-label', 'Current zoom level');

    wrapper.appendChild(zoomOutBtn);
    wrapper.appendChild(zoomFitBtn);
    wrapper.appendChild(zoomInBtn);
    wrapper.appendChild(zoomLabel);

    return wrapper;
  }

  private createTrackWrapper(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-track-wrapper';
    wrapper.style.cssText = `position:relative;overflow:hidden;background:#0d1117;`;

    // Ruler canvas
    this.rulerCanvas = document.createElement('canvas');
    this.rulerCanvas.className = 'timeline-ruler';
    this.rulerCanvas.style.cssText = `width:100%;height:${this.options.trackHeight}px;display:block;cursor:pointer;`;
    wrapper.appendChild(this.rulerCanvas);

    // Marker lane
    if (this.options.showMarkers) {
      this.markerLaneElement = document.createElement('div');
      this.markerLaneElement.className = 'timeline-marker-lane';
      this.markerLaneElement.style.cssText = `position:relative;height:${this.options.markerLaneHeight}px;background:#161b22;border-top:1px solid #333;`;
      this.markerLaneElement.setAttribute('role', 'list');
      this.markerLaneElement.setAttribute('aria-label', 'Timeline markers');
      wrapper.appendChild(this.markerLaneElement);
    }

    // Playhead
    this.playheadElement = document.createElement('div');
    this.playheadElement.className = 'timeline-playhead';
    this.playheadElement.style.cssText = `position:absolute;top:0;bottom:0;width:2px;background:#ff4444;pointer-events:none;z-index:10;transition:left 0.05s linear;`;
    this.playheadElement.setAttribute('aria-hidden', 'true');

    // Playhead triangle indicator
    const playheadHead = document.createElement('div');
    playheadHead.style.cssText = 'position:absolute;top:-2px;left:-4px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #ff4444;';
    this.playheadElement.appendChild(playheadHead);

    wrapper.appendChild(this.playheadElement);

    // Store track element reference
    this.trackElement = wrapper;

    return wrapper;
  }

  // --- Ruler Rendering ---

  private renderRuler(): void {
    if (!this.rulerCanvas || !this.trackElement) return;

    const canvas = this.rulerCanvas;
    const rect = this.trackElement.getBoundingClientRect();
    const width = rect.width || canvas.clientWidth || 800;
    const height = this.options.trackHeight;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const state = this.controller.getState();
    if (state.duration <= 0) return;

    const visibleDuration = this.controller.getVisibleDuration();
    const startTime = state.visibleStartTime;
    const pixelsPerSecond = width / visibleDuration;

    // Determine tick intervals based on zoom
    const { majorInterval, minorInterval } = this.calculateTickIntervals(pixelsPerSecond);

    // Draw minor ticks
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const firstMinor = Math.ceil(startTime / minorInterval) * minorInterval;
    for (let t = firstMinor; t <= startTime + visibleDuration; t += minorInterval) {
      const x = (t - startTime) * pixelsPerSecond;
      ctx.beginPath();
      ctx.moveTo(x, height - 8);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw major ticks with labels
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const firstMajor = Math.ceil(startTime / majorInterval) * majorInterval;
    for (let t = firstMajor; t <= startTime + visibleDuration; t += majorInterval) {
      const x = (t - startTime) * pixelsPerSecond;
      ctx.beginPath();
      ctx.moveTo(x, height - 16);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Time label
      const label = this.formatTickLabel(t);
      ctx.fillText(label, x, height - 20);
    }

    // Draw frame ticks if zoomed in enough
    if (this.options.showFrameTicks && pixelsPerSecond > 100) {
      const frameDuration = 1 / state.frameRate;
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.5;
      const firstFrame = Math.ceil(startTime / frameDuration) * frameDuration;
      for (let t = firstFrame; t <= startTime + visibleDuration; t += frameDuration) {
        const x = (t - startTime) * pixelsPerSecond;
        ctx.beginPath();
        ctx.moveTo(x, height - 4);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }

  private calculateTickIntervals(pixelsPerSecond: number): { majorInterval: number; minorInterval: number } {
    // Determine intervals so major ticks are ~80-150px apart
    const targetMajorPixels = 100;
    const idealMajorInterval = targetMajorPixels / pixelsPerSecond;

    // Snap to nice time intervals
    const niceIntervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    let majorInterval: number = niceIntervals[0] ?? 0.1;
    for (const interval of niceIntervals) {
      if (interval >= idealMajorInterval) {
        majorInterval = interval;
        break;
      }
      majorInterval = interval;
    }

    const minorInterval = majorInterval / 5;
    return { majorInterval, minorInterval };
  }

  private formatTickLabel(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (seconds < 3600) {
      return secs === 0 ? `${mins}m` : `${mins}:${String(secs).padStart(2, '0')}`;
    }
    const hrs = Math.floor(seconds / 3600);
    const remainMins = Math.floor((seconds % 3600) / 60);
    return `${hrs}:${String(remainMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // --- Markers Rendering ---

  private renderMarkers(): void {
    if (!this.markerLaneElement || !this.trackElement) return;
    this.markerLaneElement.innerHTML = '';

    const state = this.controller.getState();
    if (state.duration <= 0) return;

    const width = this.trackElement.getBoundingClientRect().width || 800;
    const visibleDuration = this.controller.getVisibleDuration();
    const startTime = state.visibleStartTime;
    const pixelsPerSecond = width / visibleDuration;

    const visibleMarkers = this.controller.getMarkersInRange(
      state.visibleStartTime,
      state.visibleEndTime
    );

    for (const marker of visibleMarkers) {
      const x = (marker.time - startTime) * pixelsPerSecond;
      const markerEl = this.createMarkerElement(marker, x);
      this.markerLaneElement.appendChild(markerEl);
    }
  }

  private createMarkerElement(marker: TimelineMarker, x: number): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `timeline-marker timeline-marker-${marker.type}`;
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-label', `${marker.type} marker at ${this.formatTickLabel(marker.time)}${marker.label ? ': ' + marker.label : ''}`);
    el.setAttribute('title', marker.label || `${marker.type} at ${this.formatTickLabel(marker.time)}`);
    el.setAttribute('data-marker-id', marker.id);
    el.setAttribute('data-marker-time', String(marker.time));

    const color = marker.color || this.getMarkerColor(marker.type);
    el.style.cssText = `
      position:absolute;
      left:${x - 5}px;
      top:2px;
      width:10px;
      height:${this.options.markerLaneHeight - 4}px;
      background:${color};
      border:none;
      border-radius:2px;
      cursor:pointer;
      padding:0;
      opacity:0.8;
      transition:opacity 0.15s;
    `;

    el.addEventListener('mouseenter', () => { el.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { el.style.opacity = '0.8'; });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.controller.handleMarkerClick(marker);
      this.callbacks.onMarkerClick?.(marker);
    });

    return el;
  }

  private getMarkerColor(type: string): string {
    switch (type) {
      case 'comment': return '#4dabf7';
      case 'annotation': return '#ffd43b';
      case 'chapter': return '#69db7c';
      default: return '#adb5bd';
    }
  }

  // --- Playhead ---

  private updatePlayheadPosition(): void {
    if (!this.playheadElement || !this.trackElement) return;

    const state = this.controller.getState();
    if (state.duration <= 0) {
      this.playheadElement.style.left = '0px';
      return;
    }

    const width = this.trackElement.getBoundingClientRect().width || 800;
    const visibleDuration = this.controller.getVisibleDuration();
    const startTime = state.visibleStartTime;
    const pixelsPerSecond = width / visibleDuration;

    const x = (state.currentTime - startTime) * pixelsPerSecond;
    this.playheadElement.style.left = `${x}px`;

    // Update ARIA value
    this.container.setAttribute('aria-valuenow', String(state.currentTime));

    // Update timecode display
    if (this.timecodeElement) {
      this.timecodeElement.textContent = formatTimecode(state.currentTime, state.frameRate);
    }
  }

  // --- Event Listeners ---

  private setupEventListeners(): void {
    if (this.options.enableScrubbing && this.rulerCanvas) {
      this.rulerCanvas.addEventListener('mousedown', this.handleMouseDown);
      this.rulerCanvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    }

    if (this.options.enableWheelZoom && this.trackElement) {
      this.trackElement.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    // Keyboard navigation on the container
    this.container.addEventListener('keydown', this.handleKeydown);

    // Window resize to re-render
    window.addEventListener('resize', this.handleResize);
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.isDestroyed) return;
    e.preventDefault();
    this.isDragging = true;
    this.controller.startScrub();
    this.seekToMousePosition(e);

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging || this.isDestroyed) return;
    this.seekToMousePosition(e);
  };

  private handleMouseUp = (_e: MouseEvent): void => {
    if (this.isDestroyed) return;
    this.isDragging = false;
    this.controller.endScrub();
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (this.isDestroyed) return;
    e.preventDefault();
    this.isDragging = true;
    this.controller.startScrub();
    this.seekToTouchPosition(e);

    document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd);
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (!this.isDragging || this.isDestroyed) return;
    e.preventDefault();
    this.seekToTouchPosition(e);
  };

  private handleTouchEnd = (_e: TouchEvent): void => {
    if (this.isDestroyed) return;
    this.isDragging = false;
    this.controller.endScrub();
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.isDestroyed) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl/Cmd + scroll
      if (e.deltaY < 0) {
        this.controller.zoomIn(1.2);
      } else {
        this.controller.zoomOut(1.2);
      }
    } else {
      // Horizontal scroll
      const state = this.controller.getState();
      const visibleDuration = this.controller.getVisibleDuration();
      const scrollAmount = (e.deltaX || e.deltaY) * (visibleDuration / 1000);
      this.controller.setScrollOffset(state.scrollOffset + scrollAmount);
    }
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    if (this.isDestroyed) return;

    const state = this.controller.getState();
    let handled = true;

    switch (e.key) {
      case 'ArrowLeft':
        if (e.shiftKey) {
          // Frame-by-frame backward
          this.controller.seekRelativeFrames(-1);
        } else {
          this.controller.seek(state.currentTime - 1);
        }
        break;
      case 'ArrowRight':
        if (e.shiftKey) {
          // Frame-by-frame forward
          this.controller.seekRelativeFrames(1);
        } else {
          this.controller.seek(state.currentTime + 1);
        }
        break;
      case 'Home':
        this.controller.seek(0);
        break;
      case 'End':
        this.controller.seek(state.duration);
        break;
      case '+':
      case '=':
        this.controller.zoomIn();
        break;
      case '-':
        this.controller.zoomOut();
        break;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private handleResize = (): void => {
    if (this.isDestroyed) return;
    this.renderRuler();
    this.renderMarkers();
    this.updatePlayheadPosition();
  };

  private seekToMousePosition(e: MouseEvent): void {
    if (!this.rulerCanvas) return;
    const rect = this.rulerCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const visibleDuration = this.controller.getVisibleDuration();
    const state = this.controller.getState();
    const time = state.visibleStartTime + ratio * visibleDuration;
    this.controller.updateScrub(time);
    this.callbacks.onSeek?.(this.controller.getState().currentTime);
  }

  private seekToTouchPosition(e: TouchEvent): void {
    if (!this.rulerCanvas || e.touches.length === 0) return;
    const rect = this.rulerCanvas.getBoundingClientRect();
    const touch = e.touches[0]!;
    const x = touch.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const visibleDuration = this.controller.getVisibleDuration();
    const state = this.controller.getState();
    const time = state.visibleStartTime + ratio * visibleDuration;
    this.controller.updateScrub(time);
    this.callbacks.onSeek?.(this.controller.getState().currentTime);
  }

  // --- Controller Subscriptions ---

  private subscribeToController(): void {
    this.unsubscribers.push(
      this.controller.on('timeupdate', () => this.updatePlayheadPosition()),
      this.controller.on('seek', () => this.updatePlayheadPosition()),
      this.controller.on('scrubupdate', () => this.updatePlayheadPosition()),
      this.controller.on('zoomchange', () => this.onZoomChanged()),
      this.controller.on('visiblerangechange', () => this.onVisibleRangeChanged()),
      this.controller.on('markerschange', () => this.renderMarkers()),
      this.controller.on('durationchange', () => this.onDurationChanged()),
    );
  }

  private onZoomChanged(): void {
    this.renderRuler();
    this.renderMarkers();
    this.updatePlayheadPosition();
    this.updateZoomLabel();
  }

  private onVisibleRangeChanged(): void {
    this.renderRuler();
    this.renderMarkers();
    this.updatePlayheadPosition();
  }

  private onDurationChanged(): void {
    const state = this.controller.getState();
    this.container.setAttribute('aria-valuemax', String(state.duration));
    this.renderRuler();
    this.updatePlayheadPosition();
  }

  private updateZoomLabel(): void {
    const label = this.element?.querySelector('.timeline-zoom-label');
    if (label) {
      label.textContent = `${Math.round(this.controller.getState().zoomLevel)}x`;
    }
  }

  // --- Public API ---

  public getElement(): HTMLElement | null {
    return this.element;
  }

  public getController(): TimelineController {
    return this.controller;
  }

  public refresh(): void {
    this.renderRuler();
    this.renderMarkers();
    this.updatePlayheadPosition();
  }

  // --- Cleanup ---

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    if (this.rulerCanvas) {
      this.rulerCanvas.removeEventListener('mousedown', this.handleMouseDown);
      this.rulerCanvas.removeEventListener('touchstart', this.handleTouchStart);
    }

    if (this.trackElement) {
      this.trackElement.removeEventListener('wheel', this.handleWheel);
    }

    this.container.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('resize', this.handleResize);

    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);

    this.container.innerHTML = '';
  }
}
