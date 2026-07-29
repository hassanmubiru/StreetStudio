/**
 * Unit tests for AdaptiveVideoPlayer
 * 
 * Tests playback controls, keyboard shortcuts, adaptive streaming,
 * picture-in-picture, and fullscreen modes.
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

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
