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
