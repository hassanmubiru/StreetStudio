/**
 * Adaptive Video Player
 * 
 * HTML5 video player with adaptive bitrate streaming (HLS/DASH),
 * standard playback controls, keyboard shortcuts, and picture-in-picture/fullscreen support.
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

export interface VideoSource {
  url: string;
  type: 'hls' | 'dash' | 'mp4' | 'webm';
  quality?: string;
  bitrate?: number;
}

export interface QualityLevel {
  index: number;
  label: string;
  bitrate: number;
  width: number;
  height: number;
  active: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  isPictureInPicture: boolean;
  isBuffering: boolean;
  currentQuality: QualityLevel | null;
  availableQualities: QualityLevel[];
}

export interface PlayerOptions {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  volume?: number;
  playbackRate?: number;
  startTime?: number;
  enableKeyboardShortcuts?: boolean;
  enablePictureInPicture?: boolean;
  enableFullscreen?: boolean;
  adaptiveBitrate?: boolean;
  preferredQuality?: 'auto' | 'low' | 'medium' | 'high';
}

export interface PlayerCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: (time: number) => void;
  onTimeUpdate?: (time: number) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onRateChange?: (rate: number) => void;
  onQualityChange?: (quality: QualityLevel) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onPictureInPictureChange?: (isPip: boolean) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onError?: (error: PlayerError) => void;
  onEnded?: () => void;
  onDurationChange?: (duration: number) => void;
}

export interface PlayerError {
  code: number;
  message: string;
  details?: string;
}

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const SEEK_STEP_SECONDS = 5;
export const VOLUME_STEP = 0.1;

/**
 * Keyboard shortcut definitions for the video player.
 * Maps key combinations to player actions.
 */
export const KEYBOARD_SHORTCUTS = {
  PLAY_PAUSE: ' ',          // Spacebar
  SEEK_FORWARD: 'ArrowRight',
  SEEK_BACKWARD: 'ArrowLeft',
  VOLUME_UP: 'ArrowUp',
  VOLUME_DOWN: 'ArrowDown',
  MUTE_TOGGLE: 'm',
  FULLSCREEN_TOGGLE: 'f',
  PIP_TOGGLE: 'p',
  SPEED_INCREASE: '>',
  SPEED_DECREASE: '<',
  // Number keys for speed presets (1-8 map to PLAYBACK_RATES)
} as const;

/**
 * AdaptiveVideoPlayer
 * 
 * Core video player class managing HTML5 video element with adaptive
 * bitrate streaming, playback controls, keyboard shortcuts, and
 * picture-in-picture/fullscreen modes.
 */
export class AdaptiveVideoPlayer {
  private container: HTMLElement;
  private videoElement!: HTMLVideoElement;
  private controlsElement!: HTMLElement;
  private options: Required<PlayerOptions>;
  private callbacks: PlayerCallbacks;
  private sources: VideoSource[] = [];
  private state: PlaybackState;
  private hlsInstance: any = null;
  private dashInstance: any = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDestroyed = false;

  private readonly defaultOptions: Required<PlayerOptions> = {
    autoplay: false,
    muted: false,
    loop: false,
    preload: 'metadata',
    volume: 1,
    playbackRate: 1,
    startTime: 0,
    enableKeyboardShortcuts: true,
    enablePictureInPicture: true,
    enableFullscreen: true,
    adaptiveBitrate: true,
    preferredQuality: 'auto',
  };

  constructor(
    container: HTMLElement,
    options: PlayerOptions = {},
    callbacks: PlayerCallbacks = {}
  ) {
    this.container = container;
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;
    this.state = this.createInitialState();

    this.createPlayerDOM();
    this.setupVideoEventListeners();
    this.setupControlEventListeners();

    if (this.options.enableKeyboardShortcuts) {
      this.setupKeyboardShortcuts();
    }
  }

  private createInitialState(): PlaybackState {
    return {
      isPlaying: false,
      isPaused: true,
      currentTime: 0,
      duration: 0,
      volume: this.options?.volume ?? 1,
      isMuted: this.options?.muted ?? false,
      playbackRate: this.options?.playbackRate ?? 1,
      isFullscreen: false,
      isPictureInPicture: false,
      isBuffering: false,
      currentQuality: null,
      availableQualities: [],
    };
  }

  private createPlayerDOM(): void {
    this.container.classList.add('video-player-container');
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Video player');
    this.container.style.position = 'relative';
    this.container.innerHTML = '';

    // Create video element
    this.videoElement = document.createElement('video');
    this.videoElement.className = 'video-player-element';
    this.videoElement.style.width = '100%';
    this.videoElement.style.height = '100%';
    this.videoElement.style.display = 'block';
    this.videoElement.style.backgroundColor = '#000';
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.preload = this.options.preload;
    this.videoElement.muted = this.options.muted;
    this.videoElement.volume = this.options.volume;
    this.videoElement.playbackRate = this.options.playbackRate;
    this.videoElement.loop = this.options.loop;

    if (this.options.enablePictureInPicture) {
      this.videoElement.setAttribute('disablepictureinpicture', 'false');
    }

    this.container.appendChild(this.videoElement);

    // Create controls overlay
    this.controlsElement = document.createElement('div');
    this.controlsElement.className = 'video-player-controls';
    this.controlsElement.setAttribute('role', 'toolbar');
    this.controlsElement.setAttribute('aria-label', 'Video playback controls');
    this.controlsElement.innerHTML = this.getControlsHTML();
    this.container.appendChild(this.controlsElement);
  }

  private getControlsHTML(): string {
    return `
      <div class="controls-bar" style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,0.7));display:flex;align-items:center;gap:8px;">
        <button type="button" class="play-btn" aria-label="Play" title="Play (Space)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>

        <div class="time-display" style="color:white;font-size:12px;font-family:monospace;min-width:90px;" aria-live="off">
          <span class="current-time">0:00</span> / <span class="duration-display">0:00</span>
        </div>

        <input type="range" class="seek-bar" min="0" max="100" value="0" step="0.1"
          aria-label="Seek" title="Seek" style="flex:1;cursor:pointer;" />

        <button type="button" class="mute-btn" aria-label="Mute" title="Mute (M)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
        </button>

        <input type="range" class="volume-bar" min="0" max="1" value="1" step="0.05"
          aria-label="Volume" title="Volume" style="width:60px;cursor:pointer;" />

        <select class="speed-select" aria-label="Playback speed" title="Playback speed"
          style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:2px 4px;font-size:12px;">
          <option value="0.25">0.25x</option>
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="1.75">1.75x</option>
          <option value="2">2x</option>
        </select>

        ${this.options.enablePictureInPicture ? `
        <button type="button" class="pip-btn" aria-label="Picture-in-picture" title="Picture-in-Picture (P)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
          </svg>
        </button>` : ''}

        ${this.options.enableFullscreen ? `
        <button type="button" class="fullscreen-btn" aria-label="Fullscreen" title="Fullscreen (F)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
        </button>` : ''}
      </div>
    `;
  }

  private setupVideoEventListeners(): void {
    const video = this.videoElement;

    video.addEventListener('play', () => {
      this.state.isPlaying = true;
      this.state.isPaused = false;
      this.updatePlayButton();
      this.callbacks.onPlay?.();
    });

    video.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.state.isPaused = true;
      this.updatePlayButton();
      this.callbacks.onPause?.();
    });

    video.addEventListener('timeupdate', () => {
      this.state.currentTime = video.currentTime;
      this.updateTimeDisplay();
      this.updateSeekBar();
      this.callbacks.onTimeUpdate?.(video.currentTime);
    });

    video.addEventListener('durationchange', () => {
      this.state.duration = video.duration;
      this.updateTimeDisplay();
      this.callbacks.onDurationChange?.(video.duration);
    });

    video.addEventListener('volumechange', () => {
      this.state.volume = video.volume;
      this.state.isMuted = video.muted;
      this.updateVolumeUI();
      this.callbacks.onVolumeChange?.(video.volume, video.muted);
    });

    video.addEventListener('ratechange', () => {
      this.state.playbackRate = video.playbackRate;
      this.updateSpeedSelect();
      this.callbacks.onRateChange?.(video.playbackRate);
    });

    video.addEventListener('ended', () => {
      this.state.isPlaying = false;
      this.state.isPaused = true;
      this.updatePlayButton();
      this.callbacks.onEnded?.();
    });

    video.addEventListener('waiting', () => {
      this.state.isBuffering = true;
      this.callbacks.onBuffering?.(true);
    });

    video.addEventListener('canplay', () => {
      this.state.isBuffering = false;
      this.callbacks.onBuffering?.(false);
    });

    video.addEventListener('error', () => {
      const mediaError = video.error;
      const playerError: PlayerError = {
        code: mediaError?.code ?? 0,
        message: this.getErrorMessage(mediaError?.code ?? 0),
        details: mediaError?.message,
      };
      this.callbacks.onError?.(playerError);
    });

    video.addEventListener('seeked', () => {
      this.callbacks.onSeeked?.(video.currentTime);
    });

    // Fullscreen change events
    document.addEventListener('fullscreenchange', () => {
      this.state.isFullscreen = !!document.fullscreenElement;
      this.updateFullscreenButton();
      this.callbacks.onFullscreenChange?.(this.state.isFullscreen);
    });

    // Picture-in-picture events
    video.addEventListener('enterpictureinpicture', () => {
      this.state.isPictureInPicture = true;
      this.callbacks.onPictureInPictureChange?.(true);
    });

    video.addEventListener('leavepictureinpicture', () => {
      this.state.isPictureInPicture = false;
      this.callbacks.onPictureInPictureChange?.(false);
    });

    // Load metadata and auto-seek to start time
    video.addEventListener('loadedmetadata', () => {
      if (this.options.startTime > 0) {
        video.currentTime = this.options.startTime;
      }
      if (this.options.autoplay) {
        this.play();
      }
    });
  }
