/**
 * Mobile-Optimized Video Player
 * 
 * Provides a touch-optimized video player for mobile devices with
 * appropriate controls, full-screen viewing, and gesture-based seeking.
 * 
 * Requirements: 10.4, 10.5
 */

import { MIN_TOUCH_TARGET } from '../../styles/responsive.js';
import { TouchGestureHandler, type GestureEvent, type PanEvent } from './touch-gesture-handler.js';

export interface MobilePlayerOptions {
  /** Video source URL */
  src?: string;
  /** Video poster/thumbnail URL */
  poster?: string;
  /** Start time in seconds */
  startTime?: number;
  /** Auto-hide controls delay in ms (default: 3000) */
  autoHideDelay?: number;
  /** Seek increment per swipe in seconds (default: 10) */
  seekIncrement?: number;
  /** Enable double-tap to seek (default: true) */
  enableDoubleTapSeek?: boolean;
  /** Enable swipe to seek (default: true) */
  enableSwipeSeek?: boolean;
}

export interface MobilePlayerCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onSeeked?: (time: number) => void;
  onEnded?: () => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onError?: (error: string) => void;
}

export interface MobilePlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  controlsVisible: boolean;
  isSeeking: boolean;
  seekPreviewTime: number | null;
}

const DEFAULT_OPTIONS: Required<MobilePlayerOptions> = {
  src: '',
  poster: '',
  startTime: 0,
  autoHideDelay: 3000,
  seekIncrement: 10,
  enableDoubleTapSeek: true,
  enableSwipeSeek: true,
};

/**
 * Formats seconds to time string (e.g., "1:23" or "1:05:30")
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * MobileVideoPlayer
 * 
 * Touch-optimized video player with:
 * - Large touch-friendly controls (min 44px targets)
 * - Double-tap left/right to seek ±10s
 * - Horizontal swipe to seek through video
 * - Tap to show/hide controls
 * - Full-screen toggle optimized for mobile
 * - Auto-hiding controls during playback
 */
export class MobileVideoPlayer {
  private container: HTMLElement;
  private options: Required<MobilePlayerOptions>;
  private callbacks: MobilePlayerCallbacks;
  private state: MobilePlayerState;
  private isDestroyed = false;

  // DOM elements
  private videoElement!: HTMLVideoElement;
  private controlsOverlay!: HTMLElement;
  private progressBar!: HTMLElement;
  private progressFill!: HTMLElement;
  private currentTimeEl!: HTMLElement;
  private durationEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private fullscreenBtn!: HTMLButtonElement;
  private seekIndicator!: HTMLElement;

  // Gesture handling
  private gestureHandler: TouchGestureHandler | null = null;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    container: HTMLElement,
    options: MobilePlayerOptions = {},
    callbacks: MobilePlayerCallbacks = {}
  ) {
    this.container = container;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isFullscreen: false,
      controlsVisible: true,
      isSeeking: false,
      seekPreviewTime: null,
    };

    this.buildDOM();
    this.setupVideoListeners();
    this.setupGestures();
    this.startAutoHideTimer();
  }

  private buildDOM(): void {
    this.container.className = 'mobile-video-player';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Video player');
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.backgroundColor = '#000';
    this.container.style.overflow = 'hidden';
    this.container.style.touchAction = 'none';
    this.container.innerHTML = '';

    // Video element
    this.videoElement = document.createElement('video');
    this.videoElement.className = 'mobile-video-element';
    this.videoElement.style.width = '100%';
    this.videoElement.style.height = '100%';
    this.videoElement.style.objectFit = 'contain';
    this.videoElement.style.display = 'block';
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.setAttribute('webkit-playsinline', '');
    this.videoElement.preload = 'metadata';
    if (this.options.src) {
      this.videoElement.src = this.options.src;
    }
    if (this.options.poster) {
      this.videoElement.poster = this.options.poster;
    }
    this.container.appendChild(this.videoElement);

    // Seek indicator (shows ±10s on double tap)
    this.seekIndicator = document.createElement('div');
    this.seekIndicator.className = 'mobile-seek-indicator';
    this.seekIndicator.setAttribute('aria-live', 'polite');
    this.seekIndicator.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: white; font-size: 1.25rem; font-weight: 600;
      background: rgba(0,0,0,0.6); border-radius: 8px; padding: 8px 16px;
      opacity: 0; transition: opacity 0.2s; pointer-events: none;
    `;
    this.container.appendChild(this.seekIndicator);

    // Controls overlay
    this.controlsOverlay = document.createElement('div');
    this.controlsOverlay.className = 'mobile-video-controls';
    this.controlsOverlay.setAttribute('role', 'toolbar');
    this.controlsOverlay.setAttribute('aria-label', 'Video controls');
    this.controlsOverlay.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      padding: 16px 12px 12px; transition: opacity 0.3s;
    `;
    this.buildControls();
    this.container.appendChild(this.controlsOverlay);
  }

  private buildControls(): void {
    // Progress bar (touch-seekable)
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'mobile-progress-bar';
    this.progressBar.setAttribute('role', 'slider');
    this.progressBar.setAttribute('aria-label', 'Video progress');
    this.progressBar.setAttribute('aria-valuemin', '0');
    this.progressBar.setAttribute('aria-valuemax', '100');
    this.progressBar.setAttribute('aria-valuenow', '0');
    this.progressBar.style.cssText = `
      width: 100%; height: 4px; background: rgba(255,255,255,0.3);
      border-radius: 2px; margin-bottom: 12px; position: relative;
      cursor: pointer; min-height: ${MIN_TOUCH_TARGET}px;
      display: flex; align-items: center;
    `;

    this.progressFill = document.createElement('div');
    this.progressFill.className = 'mobile-progress-fill';
    this.progressFill.style.cssText = `
      height: 4px; background: #3b82f6; border-radius: 2px;
      width: 0%; transition: width 0.1s linear; pointer-events: none;
    `;
    this.progressBar.appendChild(this.progressFill);
    this.controlsOverlay.appendChild(this.progressBar);

    // Setup progress bar touch seeking
    this.setupProgressBarTouch();

    // Bottom control row
    const controlRow = document.createElement('div');
    controlRow.style.cssText = `
      display: flex; align-items: center; gap: 12px; justify-content: space-between;
    `;

    // Play/Pause button
    this.playBtn = document.createElement('button');
    this.playBtn.type = 'button';
    this.playBtn.className = 'mobile-play-btn';
    this.playBtn.setAttribute('aria-label', 'Play');
    this.playBtn.style.cssText = `
      min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px;
      background: none; border: none; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    `;
    this.playBtn.innerHTML = this.getPlayIcon();
    this.playBtn.addEventListener('click', () => this.togglePlayPause());
    controlRow.appendChild(this.playBtn);

    // Time display
    const timeDisplay = document.createElement('div');
    timeDisplay.style.cssText = 'color: white; font-size: 0.875rem; font-family: monospace; flex: 1;';
    this.currentTimeEl = document.createElement('span');
    this.currentTimeEl.textContent = '0:00';
    this.durationEl = document.createElement('span');
    this.durationEl.textContent = '0:00';
    timeDisplay.appendChild(this.currentTimeEl);
    timeDisplay.appendChild(document.createTextNode(' / '));
    timeDisplay.appendChild(this.durationEl);
    controlRow.appendChild(timeDisplay);

    // Fullscreen button
    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.type = 'button';
    this.fullscreenBtn.className = 'mobile-fullscreen-btn';
    this.fullscreenBtn.setAttribute('aria-label', 'Enter fullscreen');
    this.fullscreenBtn.style.cssText = `
      min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px;
      background: none; border: none; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    `;
    this.fullscreenBtn.innerHTML = this.getFullscreenIcon();
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    controlRow.appendChild(this.fullscreenBtn);

    this.controlsOverlay.appendChild(controlRow);
  }

  private setupProgressBarTouch(): void {
    let isTouchingProgress = false;

    const seekToPosition = (clientX: number) => {
      const rect = this.progressBar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const time = ratio * this.state.duration;
      this.seek(time);
    };

    this.progressBar.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      isTouchingProgress = true;
      this.state.isSeeking = true;
      if (e.touches.length > 0) {
        seekToPosition(e.touches[0].clientX);
      }
    }, { passive: true });

    this.progressBar.addEventListener('touchmove', (e) => {
      if (isTouchingProgress && e.touches.length > 0) {
        e.preventDefault();
        seekToPosition(e.touches[0].clientX);
      }
    }, { passive: false });

    this.progressBar.addEventListener('touchend', () => {
      isTouchingProgress = false;
      this.state.isSeeking = false;
    }, { passive: true });

    // Mouse click support for non-touch
    this.progressBar.addEventListener('click', (e) => {
      seekToPosition(e.clientX);
    });
  }

  private setupVideoListeners(): void {
    this.videoElement.addEventListener('play', () => {
      this.state.isPlaying = true;
      this.updatePlayButton();
      this.startAutoHideTimer();
      this.callbacks.onPlay?.();
    });

    this.videoElement.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.updatePlayButton();
      this.showControls();
      this.callbacks.onPause?.();
    });

    this.videoElement.addEventListener('timeupdate', () => {
      this.state.currentTime = this.videoElement.currentTime;
      this.updateProgress();
      this.callbacks.onTimeUpdate?.(this.videoElement.currentTime);
    });

    this.videoElement.addEventListener('durationchange', () => {
      this.state.duration = this.videoElement.duration;
      this.durationEl.textContent = formatTime(this.videoElement.duration);
    });

    this.videoElement.addEventListener('ended', () => {
      this.state.isPlaying = false;
      this.updatePlayButton();
      this.showControls();
      this.callbacks.onEnded?.();
    });

    this.videoElement.addEventListener('seeked', () => {
      this.callbacks.onSeeked?.(this.videoElement.currentTime);
    });

    this.videoElement.addEventListener('loadedmetadata', () => {
      if (this.options.startTime > 0) {
        this.videoElement.currentTime = this.options.startTime;
      }
    });

    this.videoElement.addEventListener('error', () => {
      const msg = this.videoElement.error?.message || 'Playback error';
      this.callbacks.onError?.(msg);
    });

    // Fullscreen change
    document.addEventListener('fullscreenchange', () => {
      this.state.isFullscreen = !!document.fullscreenElement;
      this.fullscreenBtn.setAttribute('aria-label',
        this.state.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
      this.fullscreenBtn.innerHTML = this.getFullscreenIcon();
      this.callbacks.onFullscreenChange?.(this.state.isFullscreen);
    });
  }

  private setupGestures(): void {
    this.gestureHandler = new TouchGestureHandler(
      this.container,
      {
        onTap: () => this.handleTap(),
        onDoubleTap: (e) => this.handleDoubleTap(e),
        onSwipeLeft: (e) => this.handleSwipe(e),
        onSwipeRight: (e) => this.handleSwipe(e),
        onPanStart: (e) => this.handlePanStart(e),
        onPanMove: (e) => this.handlePanMove(e),
        onPanEnd: (e) => this.handlePanEnd(e),
      },
      {
        enablePan: this.options.enableSwipeSeek,
        swipeThreshold: 30,
        preventDefault: false,
      }
    );
  }

  private handleTap(): void {
    this.toggleControls();
    this.resetAutoHideTimer();
  }

  private handleDoubleTap(event: GestureEvent): void {
    if (!this.options.enableDoubleTapSeek) return;

    const rect = this.container.getBoundingClientRect();
    const tapX = event.endX - rect.left;
    const midpoint = rect.width / 2;
    const increment = this.options.seekIncrement;

    if (tapX < midpoint) {
      // Double tap on left side - seek backward
      this.seekRelative(-increment);
      this.showSeekIndicator(`-${increment}s`);
    } else {
      // Double tap on right side - seek forward
      this.seekRelative(increment);
      this.showSeekIndicator(`+${increment}s`);
    }
  }

  private handleSwipe(event: GestureEvent): void {
    if (!this.options.enableSwipeSeek) return;
    const seekAmount = event.direction === 'right'
      ? this.options.seekIncrement
      : -this.options.seekIncrement;
    this.seekRelative(seekAmount);
  }

  private handlePanStart(_event: PanEvent): void {
    if (!this.options.enableSwipeSeek) return;
    this.state.isSeeking = true;
    this.state.seekPreviewTime = this.state.currentTime;
    this.showControls();
  }

  private handlePanMove(event: PanEvent): void {
    if (!this.options.enableSwipeSeek || !this.state.isSeeking) return;
    // Map horizontal progress to seek through video duration
    const seekDelta = event.progressX * this.state.duration * 0.5;
    const previewTime = Math.max(0, Math.min(
      this.state.duration,
      this.state.currentTime + seekDelta
    ));
    this.state.seekPreviewTime = previewTime;
    this.currentTimeEl.textContent = formatTime(previewTime);
    this.updateProgressFill(previewTime);
  }

  private handlePanEnd(event: PanEvent): void {
    if (!this.options.enableSwipeSeek || !this.state.isSeeking) return;
    this.state.isSeeking = false;
    if (this.state.seekPreviewTime !== null) {
      this.seek(this.state.seekPreviewTime);
      this.state.seekPreviewTime = null;
    }
    this.resetAutoHideTimer();
  }

  // --- Public API ---

  public async play(): Promise<void> {
    try {
      await this.videoElement.play();
    } catch (error) {
      if ((error as Error).name === 'NotAllowedError') {
        this.videoElement.muted = true;
        await this.videoElement.play();
      }
    }
  }

  public pause(): void {
    this.videoElement.pause();
  }

  public togglePlayPause(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seek(time: number): void {
    const clamped = Math.max(0, Math.min(time, this.state.duration || 0));
    this.videoElement.currentTime = clamped;
    this.state.currentTime = clamped;
    this.updateProgress();
  }

  public seekRelative(seconds: number): void {
    this.seek(this.videoElement.currentTime + seconds);
  }

  public async toggleFullscreen(): Promise<void> {
    try {
      if (this.state.isFullscreen) {
        await document.exitFullscreen();
      } else {
        await this.container.requestFullscreen();
      }
    } catch {
      // Fullscreen not available
    }
  }

  public loadSource(src: string): void {
    this.videoElement.src = src;
    this.videoElement.load();
  }

  public getState(): MobilePlayerState {
    return { ...this.state };
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  public showControls(): void {
    this.state.controlsVisible = true;
    this.controlsOverlay.style.opacity = '1';
    this.controlsOverlay.style.pointerEvents = 'auto';
  }

  public hideControls(): void {
    this.state.controlsVisible = false;
    this.controlsOverlay.style.opacity = '0';
    this.controlsOverlay.style.pointerEvents = 'none';
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.gestureHandler?.destroy();
    this.clearAutoHideTimer();
    this.videoElement.pause();
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    this.container.innerHTML = '';
  }

  // --- Private helpers ---

  private toggleControls(): void {
    if (this.state.controlsVisible) {
      this.hideControls();
    } else {
      this.showControls();
    }
  }

  private updateProgress(): void {
    this.currentTimeEl.textContent = formatTime(this.state.currentTime);
    this.updateProgressFill(this.state.currentTime);
    const percent = this.state.duration > 0
      ? (this.state.currentTime / this.state.duration) * 100
      : 0;
    this.progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
  }

  private updateProgressFill(time: number): void {
    const percent = this.state.duration > 0 ? (time / this.state.duration) * 100 : 0;
    this.progressFill.style.width = `${percent}%`;
  }

  private updatePlayButton(): void {
    this.playBtn.innerHTML = this.getPlayIcon();
    this.playBtn.setAttribute('aria-label', this.state.isPlaying ? 'Pause' : 'Play');
  }

  private showSeekIndicator(text: string): void {
    this.seekIndicator.textContent = text;
    this.seekIndicator.style.opacity = '1';
    setTimeout(() => {
      this.seekIndicator.style.opacity = '0';
    }, 800);
  }

  private startAutoHideTimer(): void {
    this.clearAutoHideTimer();
    if (this.state.isPlaying) {
      this.autoHideTimer = setTimeout(() => {
        this.hideControls();
      }, this.options.autoHideDelay);
    }
  }

  private resetAutoHideTimer(): void {
    this.showControls();
    this.startAutoHideTimer();
  }

  private clearAutoHideTimer(): void {
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  private getPlayIcon(): string {
    if (this.state.isPlaying) {
      return `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    }
    return `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>`;
  }

  private getFullscreenIcon(): string {
    if (this.state.isFullscreen) {
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
    }
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
  }
}
