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
