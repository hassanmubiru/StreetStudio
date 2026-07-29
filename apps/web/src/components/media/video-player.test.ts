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
      player = new AdaptiveVideoPlayer(container, { enableFullscreen: true }, callbacks);
    });

    it('toggleFullscreen() calls requestFullscreen when not fullscreen', async () => {
      const requestSpy = vi.spyOn(container, 'requestFullscreen').mockResolvedValue();
      await player.toggleFullscreen();
      expect(requestSpy).toHaveBeenCalled();
    });

    it('toggleFullscreen() calls exitFullscreen when in fullscreen', async () => {
      Object.defineProperty(document, 'fullscreenElement', { value: container, configurable: true });
      document.dispatchEvent(new Event('fullscreenchange'));

      const exitSpy = vi.spyOn(document, 'exitFullscreen').mockResolvedValue();
      await player.toggleFullscreen();
      expect(exitSpy).toHaveBeenCalled();

      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    });

    it('does nothing when fullscreen is disabled', async () => {
      player.destroy();
      player = new AdaptiveVideoPlayer(container, { enableFullscreen: false }, callbacks);
      const requestSpy = vi.spyOn(container, 'requestFullscreen').mockResolvedValue();
      await player.toggleFullscreen();
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe('picture-in-picture', () => {
    beforeEach(() => {
      player = new AdaptiveVideoPlayer(container, { enablePictureInPicture: true }, callbacks);
    });

    it('togglePictureInPicture() calls requestPictureInPicture', async () => {
      const video = player.getVideoElement();
      const pipSpy = vi.spyOn(video, 'requestPictureInPicture').mockResolvedValue({} as any);
      await player.togglePictureInPicture();
      expect(pipSpy).toHaveBeenCalled();
    });

    it('togglePictureInPicture() exits PIP when active', async () => {
      const video = player.getVideoElement();
      video.dispatchEvent(new Event('enterpictureinpicture'));

      const exitSpy = vi.spyOn(document, 'exitPictureInPicture').mockResolvedValue();
      await player.togglePictureInPicture();
      expect(exitSpy).toHaveBeenCalled();
    });

    it('does nothing when PIP is disabled', async () => {
      player.destroy();
      player = new AdaptiveVideoPlayer(container, { enablePictureInPicture: false }, callbacks);
      const video = player.getVideoElement();
      const pipSpy = vi.spyOn(video, 'requestPictureInPicture').mockResolvedValue({} as any);
      await player.togglePictureInPicture();
      expect(pipSpy).not.toHaveBeenCalled();
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
