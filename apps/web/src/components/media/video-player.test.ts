/**
 * Unit tests for AdaptiveVideoPlayer
 * 
 * Tests playback controls, keyboard shortcuts, adaptive streaming,
 * picture-in-picture, and fullscreen modes.
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AdaptiveVideoPlayer,
  formatTime,
  KEYBOARD_SHORTCUTS,
  PLAYBACK_RATES,
  SEEK_STEP_SECONDS,
  VOLUME_STEP,
} from './video-player';
import type { PlayerOptions, PlayerCallbacks, VideoSource } from './video-player';

// Helper to create a container element
function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

// Helper to dispatch keyboard events
function pressKey(key: string, options: Partial<KeyboardEvent> = {}): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
}

describe('formatTime', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTime(35)).toBe('0:35');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('2:05');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('handles negative numbers gracefully', () => {
    expect(formatTime(-5)).toBe('0:00');
  });

  it('handles NaN gracefully', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('handles Infinity gracefully', () => {
    expect(formatTime(Infinity)).toBe('0:00');
  });
});

describe('AdaptiveVideoPlayer', () => {
  let container: HTMLElement;
  let player: AdaptiveVideoPlayer;
  let callbacks: PlayerCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = {
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onSeeked: vi.fn(),
      onTimeUpdate: vi.fn(),
      onVolumeChange: vi.fn(),
      onRateChange: vi.fn(),
      onFullscreenChange: vi.fn(),
      onPictureInPictureChange: vi.fn(),
      onBuffering: vi.fn(),
      onError: vi.fn(),
      onEnded: vi.fn(),
      onDurationChange: vi.fn(),
    };
  });

  afterEach(() => {
    if (player) {
      player.destroy();
    }
    container.remove();
  });

  describe('initialization', () => {
    it('creates video element and controls inside the container', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const video = container.querySelector('video');
      const controls = container.querySelector('.video-player-controls');
      expect(video).not.toBeNull();
      expect(controls).not.toBeNull();
    });

    it('sets proper ARIA attributes on container', () => {
      player = new AdaptiveVideoPlayer(container);
      expect(container.getAttribute('role')).toBe('region');
      expect(container.getAttribute('aria-label')).toBe('Video player');
    });

    it('sets proper ARIA attributes on controls toolbar', () => {
      player = new AdaptiveVideoPlayer(container);
      const controls = container.querySelector('.video-player-controls');
      expect(controls?.getAttribute('role')).toBe('toolbar');
      expect(controls?.getAttribute('aria-label')).toBe('Video playback controls');
    });

    it('applies initial options to video element', () => {
      player = new AdaptiveVideoPlayer(container, {
        muted: true,
        volume: 0.5,
        playbackRate: 1.5,
        loop: true,
        preload: 'auto',
      });
      const video = player.getVideoElement();
      expect(video.muted).toBe(true);
      expect(video.volume).toBe(0.5);
      expect(video.playbackRate).toBe(1.5);
      expect(video.loop).toBe(true);
      expect(video.preload).toBe('auto');
    });

    it('uses default options when none provided', () => {
      player = new AdaptiveVideoPlayer(container);
      const state = player.getState();
      expect(state.volume).toBe(1);
      expect(state.isMuted).toBe(false);
      expect(state.playbackRate).toBe(1);
      expect(state.isPlaying).toBe(false);
    });
  });

  describe('playback controls', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
    });

    it('play() calls video.play()', async () => {
      const video = player.getVideoElement();
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue();
      await player.play();
      expect(playSpy).toHaveBeenCalled();
    });

    it('pause() calls video.pause()', () => {
      const video = player.getVideoElement();
      const pauseSpy = vi.spyOn(video, 'pause');
      player.pause();
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('togglePlayPause() pauses when playing', () => {
      const video = player.getVideoElement();
      // Simulate playing state
      video.dispatchEvent(new Event('play'));
      const pauseSpy = vi.spyOn(video, 'pause');
      player.togglePlayPause();
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('togglePlayPause() plays when paused', async () => {
      const video = player.getVideoElement();
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue();
      player.togglePlayPause();
      expect(playSpy).toHaveBeenCalled();
    });
  });

  describe('seek', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      // Simulate a video with known duration
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 120, writable: true });
      video.dispatchEvent(new Event('durationchange'));
    });

    it('seek() sets currentTime clamped to duration', () => {
      player.seek(60);
      expect(player.getState().currentTime).toBe(60);
    });

    it('seek() clamps to 0 for negative values', () => {
      player.seek(-10);
      expect(player.getState().currentTime).toBe(0);
    });

    it('seek() clamps to duration for values exceeding duration', () => {
      player.seek(999);
      expect(player.getState().currentTime).toBe(120);
    });

    it('seekRelative() seeks forward', () => {
      const video = player.getVideoElement();
      Object.defineProperty(video, 'currentTime', { value: 30, writable: true });
      player.seekRelative(SEEK_STEP_SECONDS);
      expect(player.getState().currentTime).toBe(35);
    });

    it('seekRelative() seeks backward', () => {
      const video = player.getVideoElement();
      Object.defineProperty(video, 'currentTime', { value: 30, writable: true });
      player.seekRelative(-SEEK_STEP_SECONDS);
      expect(player.getState().currentTime).toBe(25);
    });
  });

  describe('volume controls', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, { volume: 0.5 }, callbacks);
    });

    it('setVolume() clamps between 0 and 1', () => {
      player.setVolume(1.5);
      expect(player.getState().volume).toBe(1);
      player.setVolume(-0.5);
      expect(player.getState().volume).toBe(0);
    });

    it('setVolume() unmutes when setting volume > 0 while muted', () => {
      player.toggleMute();
      expect(player.getState().isMuted).toBe(true);
      player.setVolume(0.7);
      expect(player.getState().isMuted).toBe(false);
    });

    it('adjustVolume() increments the volume', () => {
      player.setVolume(0.5);
      player.adjustVolume(VOLUME_STEP);
      expect(player.getState().volume).toBeCloseTo(0.6);
    });

    it('adjustVolume() decrements the volume', () => {
      player.setVolume(0.5);
      player.adjustVolume(-VOLUME_STEP);
      expect(player.getState().volume).toBeCloseTo(0.4);
    });

    it('toggleMute() toggles muted state', () => {
      expect(player.getState().isMuted).toBe(false);
      player.toggleMute();
      expect(player.getState().isMuted).toBe(true);
      player.toggleMute();
      expect(player.getState().isMuted).toBe(false);
    });
  });

  describe('playback rate', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
    });

    it('setPlaybackRate() clamps between 0.25 and 2', () => {
      player.setPlaybackRate(5);
      expect(player.getState().playbackRate).toBe(2);
      player.setPlaybackRate(0.1);
      expect(player.getState().playbackRate).toBe(0.25);
    });

    it('increaseSpeed() moves to next rate preset', () => {
      player.setPlaybackRate(1);
      player.increaseSpeed();
      expect(player.getState().playbackRate).toBe(1.25);
    });

    it('increaseSpeed() does nothing at max rate', () => {
      player.setPlaybackRate(2);
      player.increaseSpeed();
      expect(player.getState().playbackRate).toBe(2);
    });

    it('decreaseSpeed() moves to previous rate preset', () => {
      player.setPlaybackRate(1);
      player.decreaseSpeed();
      expect(player.getState().playbackRate).toBe(0.75);
    });

    it('decreaseSpeed() does nothing at min rate', () => {
      player.setPlaybackRate(0.25);
      player.decreaseSpeed();
      expect(player.getState().playbackRate).toBe(0.25);
    });
  });

  describe('keyboard shortcuts', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, { enableKeyboardShortcuts: true }, callbacks);
    });

    it('spacebar toggles play/pause', () => {
      const video = player.getVideoElement();
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue();
      pressKey(' ');
      expect(playSpy).toHaveBeenCalled();
    });

    it('ArrowRight seeks forward by SEEK_STEP_SECONDS', () => {
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 120, writable: true });
      video.dispatchEvent(new Event('durationchange'));
      Object.defineProperty(video, 'currentTime', { value: 30, writable: true, configurable: true });
      pressKey('ArrowRight');
      expect(player.getState().currentTime).toBe(35);
    });

    it('ArrowLeft seeks backward by SEEK_STEP_SECONDS', () => {
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 120, writable: true });
      video.dispatchEvent(new Event('durationchange'));
      Object.defineProperty(video, 'currentTime', { value: 30, writable: true, configurable: true });
      pressKey('ArrowLeft');
      expect(player.getState().currentTime).toBe(25);
    });

    it('ArrowUp increases volume', () => {
      player.setVolume(0.5);
      pressKey('ArrowUp');
      expect(player.getState().volume).toBeCloseTo(0.6);
    });

    it('ArrowDown decreases volume', () => {
      player.setVolume(0.5);
      pressKey('ArrowDown');
      expect(player.getState().volume).toBeCloseTo(0.4);
    });

    it('m toggles mute', () => {
      expect(player.getState().isMuted).toBe(false);
      pressKey('m');
      expect(player.getState().isMuted).toBe(true);
    });

    it('> increases speed', () => {
      player.setPlaybackRate(1);
      pressKey('>');
      expect(player.getState().playbackRate).toBe(1.25);
    });

    it('< decreases speed', () => {
      player.setPlaybackRate(1);
      pressKey('<');
      expect(player.getState().playbackRate).toBe(0.75);
    });

    it('number keys 1-8 set speed presets', () => {
      pressKey('1');
      expect(player.getState().playbackRate).toBe(PLAYBACK_RATES[0]);
      pressKey('4');
      expect(player.getState().playbackRate).toBe(PLAYBACK_RATES[3]);
      pressKey('8');
      expect(player.getState().playbackRate).toBe(PLAYBACK_RATES[7]);
    });

    it('ignores shortcuts when modifier keys are pressed', () => {
      const video = player.getVideoElement();
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue();
      pressKey(' ', { ctrlKey: true });
      expect(playSpy).not.toHaveBeenCalled();
    });

    it('ignores shortcuts when external input is focused', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      const video = player.getVideoElement();
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue();
      pressKey(' ');
      expect(playSpy).not.toHaveBeenCalled();
      input.remove();
    });
  });

  describe('fullscreen', () => {
    beforeEach(() => {
      // jsdom doesn't implement fullscreen API; stub it
      container.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      (document as any).exitFullscreen = vi.fn().mockResolvedValue(undefined);
      player = new AdaptiveVideoPlayer(container, { enableFullscreen: true }, callbacks);
    });

    it('toggleFullscreen() calls requestFullscreen when not fullscreen', async () => {
      await player.toggleFullscreen();
      expect(container.requestFullscreen).toHaveBeenCalled();
    });

    it('toggleFullscreen() calls exitFullscreen when in fullscreen', async () => {
      Object.defineProperty(document, 'fullscreenElement', { value: container, configurable: true });
      document.dispatchEvent(new Event('fullscreenchange'));

      await player.toggleFullscreen();
      expect(document.exitFullscreen).toHaveBeenCalled();

      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    });

    it('does nothing when fullscreen is disabled', async () => {
      player.destroy();
      container.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      player = new AdaptiveVideoPlayer(container, { enableFullscreen: false }, callbacks);
      await player.toggleFullscreen();
      expect(container.requestFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('picture-in-picture', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, { enablePictureInPicture: true }, callbacks);
      // jsdom doesn't implement PIP API; stub it on the video element
      const video = player.getVideoElement();
      (video as any).requestPictureInPicture = vi.fn().mockResolvedValue({});
      (document as any).exitPictureInPicture = vi.fn().mockResolvedValue(undefined);
    });

    it('togglePictureInPicture() calls requestPictureInPicture', async () => {
      const video = player.getVideoElement();
      await player.togglePictureInPicture();
      expect(video.requestPictureInPicture).toHaveBeenCalled();
    });

    it('togglePictureInPicture() exits PIP when active', async () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('enterpictureinpicture'));

      await player.togglePictureInPicture();
      expect(document.exitPictureInPicture).toHaveBeenCalled();
    });

    it('does nothing when PIP is disabled', async () => {
      player.destroy();
      player = new AdaptiveVideoPlayer(container, { enablePictureInPicture: false }, callbacks);
      const video = player.getVideoElement();
      (video as any).requestPictureInPicture = vi.fn().mockResolvedValue({});
      await player.togglePictureInPicture();
      expect(video.requestPictureInPicture).not.toHaveBeenCalled();
    });
  });

  describe('source loading', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
    });

    it('loads mp4 source directly', async () => {
      const sources: VideoSource[] = [{ url: 'test.mp4', type: 'mp4' }];
      await player.loadSource(sources);
      expect(player.getVideoElement().src).toContain('test.mp4');
    });

    it('loads webm source directly', async () => {
      const sources: VideoSource[] = [{ url: 'test.webm', type: 'webm' }];
      await player.loadSource(sources);
      expect(player.getVideoElement().src).toContain('test.webm');
    });

    it('falls back to direct load when HLS is not supported', async () => {
      const sources: VideoSource[] = [{ url: 'stream.m3u8', type: 'hls' }];
      await player.loadSource(sources);
      expect(player.getVideoElement().src).toContain('stream.m3u8');
    });

    it('getSources() returns loaded sources', async () => {
      const sources: VideoSource[] = [
        { url: 'test.mp4', type: 'mp4' },
        { url: 'test.webm', type: 'webm' },
      ];
      await player.loadSource(sources);
      expect(player.getSources()).toEqual(sources);
    });
  });

  describe('adaptive quality selection and streaming', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, { adaptiveBitrate: true }, callbacks);
    });

    it('setQuality() does not throw when no streaming instance', () => {
      expect(() => player.setQuality(0)).not.toThrow();
    });

    it('setQuality() delegates to hlsInstance.currentLevel when HLS active', async () => {
      const mockHls = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        currentLevel: -1,
      };
      const MockHlsClass = vi.fn(() => mockHls);
      (MockHlsClass as any).isSupported = () => true;
      (MockHlsClass as any).Events = { MANIFEST_PARSED: 'hlsManifestParsed', LEVEL_SWITCHED: 'hlsLevelSwitched', ERROR: 'hlsError' };
      (window as any).Hls = MockHlsClass;

      const sources: VideoSource[] = [{ url: 'stream.m3u8', type: 'hls' }];
      await player.loadSource(sources);

      player.setQuality(2);
      expect(mockHls.currentLevel).toBe(2);

      delete (window as any).Hls;
    });

    it('loads HLS source using Hls.js when available and adaptiveBitrate is enabled', async () => {
      const mockHls = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        currentLevel: -1,
      };
      const MockHlsClass = vi.fn(() => mockHls);
      (MockHlsClass as any).isSupported = () => true;
      (MockHlsClass as any).Events = { MANIFEST_PARSED: 'hlsManifestParsed', LEVEL_SWITCHED: 'hlsLevelSwitched', ERROR: 'hlsError' };
      (window as any).Hls = MockHlsClass;

      const sources: VideoSource[] = [{ url: 'stream.m3u8', type: 'hls' }];
      await player.loadSource(sources);

      expect(mockHls.loadSource).toHaveBeenCalledWith('stream.m3u8');
      expect(mockHls.attachMedia).toHaveBeenCalledWith(player.getVideoElement());

      delete (window as any).Hls;
    });

    it('loads DASH source using dashjs when available and adaptiveBitrate is enabled', async () => {
      const mockDashPlayer = {
        initialize: vi.fn(),
        on: vi.fn(),
        getBitrateInfoListFor: vi.fn().mockReturnValue([]),
        reset: vi.fn(),
        setQualityFor: vi.fn(),
      };
      const mockDashjs = {
        MediaPlayer: () => ({ create: () => mockDashPlayer }),
      };
      (window as any).dashjs = mockDashjs;

      const sources: VideoSource[] = [{ url: 'stream.mpd', type: 'dash' }];
      await player.loadSource(sources);

      expect(mockDashPlayer.initialize).toHaveBeenCalledWith(
        player.getVideoElement(),
        'stream.mpd',
        false,
      );

      delete (window as any).dashjs;
    });

    it('setQuality() delegates to dashInstance when DASH active', async () => {
      const mockDashPlayer = {
        initialize: vi.fn(),
        on: vi.fn(),
        getBitrateInfoListFor: vi.fn().mockReturnValue([]),
        reset: vi.fn(),
        setQualityFor: vi.fn(),
      };
      const mockDashjs = {
        MediaPlayer: () => ({ create: () => mockDashPlayer }),
      };
      (window as any).dashjs = mockDashjs;

      const sources: VideoSource[] = [{ url: 'stream.mpd', type: 'dash' }];
      await player.loadSource(sources);

      player.setQuality(1);
      expect(mockDashPlayer.setQualityFor).toHaveBeenCalledWith('video', 1);

      delete (window as any).dashjs;
    });

    it('prefers HLS source over direct source when adaptiveBitrate is enabled', async () => {
      const mockHls = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        currentLevel: -1,
      };
      const MockHlsClass = vi.fn(() => mockHls);
      (MockHlsClass as any).isSupported = () => true;
      (MockHlsClass as any).Events = { MANIFEST_PARSED: 'hlsManifestParsed', LEVEL_SWITCHED: 'hlsLevelSwitched', ERROR: 'hlsError' };
      (window as any).Hls = MockHlsClass;

      const sources: VideoSource[] = [
        { url: 'test.mp4', type: 'mp4' },
        { url: 'stream.m3u8', type: 'hls' },
      ];
      await player.loadSource(sources);

      // HLS source should be used, not direct mp4
      expect(mockHls.loadSource).toHaveBeenCalledWith('stream.m3u8');

      delete (window as any).Hls;
    });

    it('falls back to direct source when adaptiveBitrate is disabled', async () => {
      player.destroy();
      player = new AdaptiveVideoPlayer(container, { adaptiveBitrate: false }, callbacks);

      const sources: VideoSource[] = [
        { url: 'stream.m3u8', type: 'hls' },
        { url: 'test.mp4', type: 'mp4' },
      ];
      await player.loadSource(sources);

      // Should use direct mp4 since adaptive is disabled
      expect(player.getVideoElement().src).toContain('test.mp4');
    });

    it('fires onQualityChange callback when quality switches (via HLS)', async () => {
      const mockHls = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        currentLevel: -1,
      };
      const MockHlsClass = vi.fn(() => mockHls);
      (MockHlsClass as any).isSupported = () => true;
      (MockHlsClass as any).Events = { MANIFEST_PARSED: 'hlsManifestParsed', LEVEL_SWITCHED: 'hlsLevelSwitched', ERROR: 'hlsError' };
      (window as any).Hls = MockHlsClass;

      const onQualityChange = vi.fn();
      player.destroy();
      player = new AdaptiveVideoPlayer(container, { adaptiveBitrate: true }, { ...callbacks, onQualityChange });

      const sources: VideoSource[] = [{ url: 'stream.m3u8', type: 'hls' }];
      await player.loadSource(sources);

      // Simulate MANIFEST_PARSED to populate qualities
      const manifestCallback = mockHls.on.mock.calls.find(
        (call: any[]) => call[0] === 'hlsManifestParsed'
      )?.[1];
      if (manifestCallback) {
        manifestCallback(null, {
          levels: [
            { height: 360, bitrate: 800000, width: 640 },
            { height: 720, bitrate: 2500000, width: 1280 },
            { height: 1080, bitrate: 5000000, width: 1920 },
          ],
        });
      }

      // Simulate LEVEL_SWITCHED
      const levelSwitchCallback = mockHls.on.mock.calls.find(
        (call: any[]) => call[0] === 'hlsLevelSwitched'
      )?.[1];
      if (levelSwitchCallback) {
        levelSwitchCallback(null, { level: 1 });
      }

      expect(onQualityChange).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 1,
          label: '720p',
          height: 720,
          active: true,
        })
      );

      delete (window as any).Hls;
    });

    it('fires onError callback on fatal streaming error', async () => {
      const mockHls = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        startLoad: vi.fn(),
        recoverMediaError: vi.fn(),
        currentLevel: -1,
      };
      const MockHlsClass = vi.fn(() => mockHls);
      (MockHlsClass as any).isSupported = () => true;
      (MockHlsClass as any).Events = { MANIFEST_PARSED: 'hlsManifestParsed', LEVEL_SWITCHED: 'hlsLevelSwitched', ERROR: 'hlsError' };
      (window as any).Hls = MockHlsClass;

      const sources: VideoSource[] = [{ url: 'stream.m3u8', type: 'hls' }];
      await player.loadSource(sources);

      // Simulate a fatal error
      const errorCallback = mockHls.on.mock.calls.find(
        (call: any[]) => call[0] === 'hlsError'
      )?.[1];
      if (errorCallback) {
        errorCallback(null, { fatal: true, type: 'networkError', details: 'manifestLoadError' });
      }

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: -1,
          message: 'Streaming error occurred',
        })
      );

      delete (window as any).Hls;
    });

    it('availableQualities is populated after HLS manifest is parsed', async () => {
      const mockHls = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
        currentLevel: -1,
      };
      const MockHlsClass = vi.fn(() => mockHls);
      (MockHlsClass as any).isSupported = () => true;
      (MockHlsClass as any).Events = { MANIFEST_PARSED: 'hlsManifestParsed', LEVEL_SWITCHED: 'hlsLevelSwitched', ERROR: 'hlsError' };
      (window as any).Hls = MockHlsClass;

      const sources: VideoSource[] = [{ url: 'stream.m3u8', type: 'hls' }];
      await player.loadSource(sources);

      // Simulate MANIFEST_PARSED
      const manifestCallback = mockHls.on.mock.calls.find(
        (call: any[]) => call[0] === 'hlsManifestParsed'
      )?.[1];
      if (manifestCallback) {
        manifestCallback(null, {
          levels: [
            { height: 360, bitrate: 800000, width: 640 },
            { height: 720, bitrate: 2500000, width: 1280 },
          ],
        });
      }

      const state = player.getState();
      expect(state.availableQualities).toHaveLength(2);
      expect(state.availableQualities[0]).toEqual(
        expect.objectContaining({ label: '360p', height: 360 })
      );
      expect(state.availableQualities[1]).toEqual(
        expect.objectContaining({ label: '720p', height: 720 })
      );

      delete (window as any).Hls;
    });
  });

  describe('timeline seeking and position memory', () => {
    it('startTime option sets initial position on loadedmetadata', () => {
      player = new AdaptiveVideoPlayer(container, { startTime: 42 }, callbacks);
      const video = player.getVideoElement();
      // Simulate loadedmetadata event
      video.dispatchEvent(new Event('loadedmetadata'));
      expect(video.currentTime).toBe(42);
    });

    it('startTime of 0 does not change position on loadedmetadata', () => {
      player = new AdaptiveVideoPlayer(container, { startTime: 0 }, callbacks);
      const video = player.getVideoElement();
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });
      video.dispatchEvent(new Event('loadedmetadata'));
      expect(video.currentTime).toBe(0);
    });

    it('fires onSeeked callback when seeked event occurs', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const video = player.getVideoElement();
      Object.defineProperty(video, 'currentTime', { value: 30, writable: true, configurable: true });
      video.dispatchEvent(new Event('seeked'));
      expect(callbacks.onSeeked).toHaveBeenCalledWith(30);
    });

    it('seek bar input triggers seek to correct time', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 200, writable: true });
      video.dispatchEvent(new Event('durationchange'));

      const seekBar = container.querySelector('.seek-bar') as HTMLInputElement;
      seekBar.value = '50'; // 50% of duration = 100 seconds
      seekBar.dispatchEvent(new Event('input'));
      expect(player.getState().currentTime).toBe(100);
    });

    it('seek bar updates as time progresses', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 100, writable: true });
      video.dispatchEvent(new Event('durationchange'));

      Object.defineProperty(video, 'currentTime', { value: 25, writable: true, configurable: true });
      video.dispatchEvent(new Event('timeupdate'));

      const seekBar = container.querySelector('.seek-bar') as HTMLInputElement;
      expect(parseFloat(seekBar.value)).toBe(25);
    });

    it('time display updates correctly during playback', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 300, writable: true });
      video.dispatchEvent(new Event('durationchange'));

      Object.defineProperty(video, 'currentTime', { value: 125, writable: true, configurable: true });
      video.dispatchEvent(new Event('timeupdate'));

      const currentTimeEl = container.querySelector('.current-time');
      expect(currentTimeEl?.textContent).toBe('2:05');
    });

    it('duration display shows video length after durationchange', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const video = player.getVideoElement();
      Object.defineProperty(video, 'duration', { value: 3661, writable: true });
      video.dispatchEvent(new Event('durationchange'));

      const durationEl = container.querySelector('.duration-display');
      expect(durationEl?.textContent).toBe('1:01:01');
    });
  });

  describe('event callbacks', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
    });

    it('fires onPlay when video plays', () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('play'));
      expect(callbacks.onPlay).toHaveBeenCalled();
    });

    it('fires onPause when video pauses', () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('pause'));
      expect(callbacks.onPause).toHaveBeenCalled();
    });

    it('fires onEnded when video ends', () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('ended'));
      expect(callbacks.onEnded).toHaveBeenCalled();
    });

    it('fires onBuffering(true) when waiting', () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('waiting'));
      expect(callbacks.onBuffering).toHaveBeenCalledWith(true);
    });

    it('fires onBuffering(false) when canplay', () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('canplay'));
      expect(callbacks.onBuffering).toHaveBeenCalledWith(false);
    });

    it('fires onError when video has error', () => {
      const video = player.getVideoElement();
      Object.defineProperty(video, 'error', {
        value: { code: 4, message: 'Not supported' },
        configurable: true,
      });
      video.dispatchEvent(new Event('error'));
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 4,
          message: 'Video format not supported',
        })
      );
    });

    it('fires onTimeUpdate during playback', () => {
      const video = player.getVideoElement();
      Object.defineProperty(video, 'currentTime', { value: 42, writable: true, configurable: true });
      video.dispatchEvent(new Event('timeupdate'));
      expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(42);
    });
  });

  describe('destroy', () => {
    it('removes keyboard event listener', () => {
      player = new AdaptiveVideoPlayer(container, { enableKeyboardShortcuts: true }, callbacks);
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      player.destroy();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('removes fullscreen event listener', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      player.destroy();
      expect(removeSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    });

    it('clears the container', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      player.destroy();
      expect(container.innerHTML).toBe('');
    });

    it('does not double-destroy', () => {
      player = new AdaptiveVideoPlayer(container, {}, callbacks);
      player.destroy();
      expect(() => player.destroy()).not.toThrow();
    });
  });

  describe('getState', () => {
    it('returns a copy of playback state', () => {
      player = new AdaptiveVideoPlayer(container, { volume: 0.7, playbackRate: 1.5 });
      const state = player.getState();
      expect(state.volume).toBe(0.7);
      expect(state.playbackRate).toBe(1.5);
      expect(state.isPlaying).toBe(false);
      expect(state.isPaused).toBe(true);
      // Mutation of returned state should not affect internal state
      state.volume = 0;
      expect(player.getState().volume).toBe(0.7);
    });
  });
});
