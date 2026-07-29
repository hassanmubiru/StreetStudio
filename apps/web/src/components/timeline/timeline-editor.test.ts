/**
 * Unit tests for TimelineEditor
 * 
 * Tests frame-accurate timeline, zoom/navigation controls, trim tools,
 * split functionality, and audio waveform visualization.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TimelineEditor,
  WaveformRenderer,
  frameToTimecode,
  timecodeToFrame,
  frameToSeconds,
  secondsToFrame,
  frameToPixel,
  pixelToFrame,
  DEFAULT_FRAME_RATE,
  PIXELS_PER_FRAME_BASE,
  MIN_CLIP_FRAMES,
} from './timeline-editor';
import type {
  TimelineClip,
  TimelineEditorOptions,
  TimelineEditorCallbacks,
  WaveformData,
} from './timeline-editor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  // Simulate width for layout calculations
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  document.body.appendChild(container);
  return container;
}

function createTestClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-1',
    startFrame: 0,
    endFrame: 300,
    inPoint: 0,
    outPoint: 300,
    duration: 300,
    sourceUrl: 'test-video.mp4',
    type: 'video',
    ...overrides,
  };
}

function pressKey(key: string, options: Partial<KeyboardEvent> = {}): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
}

// ─── Utility Function Tests ───────────────────────────────────────────────────

describe('frameToTimecode', () => {
  it('formats frame 0 as 00:00:00:00', () => {
    expect(frameToTimecode(0, 30)).toBe('00:00:00:00');
  });

  it('formats frames within a second', () => {
    expect(frameToTimecode(15, 30)).toBe('00:00:00:15');
  });

  it('formats exact seconds', () => {
    expect(frameToTimecode(30, 30)).toBe('00:00:01:00');
  });

  it('formats minutes and seconds', () => {
    // 2 minutes, 5 seconds, frame 10 at 30fps
    const frame = 2 * 60 * 30 + 5 * 30 + 10;
    expect(frameToTimecode(frame, 30)).toBe('00:02:05:10');
  });

  it('formats hours', () => {
    const frame = 1 * 3600 * 30 + 23 * 60 * 30 + 45 * 30 + 12;
    expect(frameToTimecode(frame, 30)).toBe('01:23:45:12');
  });

  it('handles negative input gracefully', () => {
    expect(frameToTimecode(-1, 30)).toBe('00:00:00:00');
  });

  it('handles NaN gracefully', () => {
    expect(frameToTimecode(NaN, 30)).toBe('00:00:00:00');
  });

  it('handles zero frame rate gracefully', () => {
    expect(frameToTimecode(100, 0)).toBe('00:00:00:00');
  });

  it('works with 24fps', () => {
    expect(frameToTimecode(48, 24)).toBe('00:00:02:00');
  });

  it('works with 60fps', () => {
    expect(frameToTimecode(90, 60)).toBe('00:00:01:30');
  });
});

describe('timecodeToFrame', () => {
  it('converts 00:00:00:00 to frame 0', () => {
    expect(timecodeToFrame('00:00:00:00', 30)).toBe(0);
  });

  it('converts a valid timecode to correct frame', () => {
    expect(timecodeToFrame('00:00:01:00', 30)).toBe(30);
  });

  it('converts complex timecodes', () => {
    expect(timecodeToFrame('01:00:00:00', 30)).toBe(108000);
  });

  it('returns 0 for invalid timecodes', () => {
    expect(timecodeToFrame('invalid', 30)).toBe(0);
  });

  it('round-trips with frameToTimecode', () => {
    const frame = 1234;
    const timecode = frameToTimecode(frame, 30);
    expect(timecodeToFrame(timecode, 30)).toBe(frame);
  });
});

describe('frameToSeconds / secondsToFrame', () => {
  it('converts frames to seconds correctly', () => {
    expect(frameToSeconds(60, 30)).toBe(2);
  });

  it('converts seconds to frames correctly', () => {
    expect(secondsToFrame(2, 30)).toBe(60);
  });

  it('handles zero frame rate', () => {
    expect(frameToSeconds(100, 0)).toBe(0);
  });

  it('round-trips correctly', () => {
    const frame = 150;
    const seconds = frameToSeconds(frame, 30);
    expect(secondsToFrame(seconds, 30)).toBe(frame);
  });
});

describe('frameToPixel / pixelToFrame', () => {
  it('converts frame to pixel at zoom 1', () => {
    expect(frameToPixel(10, 1)).toBe(10 * PIXELS_PER_FRAME_BASE);
  });

  it('scales with zoom level', () => {
    expect(frameToPixel(10, 2)).toBe(10 * PIXELS_PER_FRAME_BASE * 2);
  });

  it('converts pixel to frame at zoom 1', () => {
    const pixel = 40;
    expect(pixelToFrame(pixel, 1)).toBe(Math.round(pixel / PIXELS_PER_FRAME_BASE));
  });

  it('handles zoom 0 gracefully', () => {
    expect(pixelToFrame(100, 0)).toBe(0);
  });

  it('round-trips correctly', () => {
    const frame = 50;
    const zoom = 1.5;
    const pixel = frameToPixel(frame, zoom);
    expect(pixelToFrame(pixel, zoom)).toBe(frame);
  });
});

// ─── TimelineEditor Tests ─────────────────────────────────────────────────────

describe('TimelineEditor', () => {
  let container: HTMLElement;
  let editor: TimelineEditor;
  let callbacks: TimelineEditorCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = {
      onPlayheadChange: vi.fn(),
      onTrimStart: vi.fn(),
      onTrimEnd: vi.fn(),
      onTrimUpdate: vi.fn(),
      onSplit: vi.fn(),
      onZoomChange: vi.fn(),
      onClipSelect: vi.fn(),
      onStateChange: vi.fn(),
    };
    editor = new TimelineEditor(container, {}, callbacks);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = '';
  });

  describe('initialization', () => {
    it('creates timeline DOM structure', () => {
      expect(container.querySelector('.timeline-editor')).not.toBeNull();
      expect(container.querySelector('.timeline-controls')).not.toBeNull();
      expect(container.querySelector('.timeline-area')).not.toBeNull();
      expect(container.querySelector('.timeline-ruler')).not.toBeNull();
      expect(container.querySelector('.timeline-track')).not.toBeNull();
      expect(container.querySelector('.timeline-playhead')).not.toBeNull();
    });

    it('starts with default state', () => {
      const state = editor.getState();
      expect(state.playheadFrame).toBe(0);
      expect(state.clips).toEqual([]);
      expect(state.zoomLevel).toBe(1);
      expect(state.isPlaying).toBe(false);
      expect(state.frameRate).toBe(DEFAULT_FRAME_RATE);
      expect(state.selectedClipId).toBeNull();
    });

    it('creates waveform canvas when enabled', () => {
      expect(container.querySelector('.timeline-waveform')).not.toBeNull();
    });

    it('omits waveform canvas when disabled', () => {
      editor.destroy();
      document.body.innerHTML = '';
      const c = createContainer();
      const e = new TimelineEditor(c, { enableWaveform: false }, {});
      expect(c.querySelector('.timeline-waveform')).toBeNull();
      e.destroy();
    });

    it('sets ARIA attributes on track', () => {
      const track = container.querySelector('.timeline-track');
      expect(track?.getAttribute('role')).toBe('slider');
      expect(track?.getAttribute('aria-label')).toBe('Timeline track');
      expect(track?.getAttribute('tabindex')).toBe('0');
    });

    it('creates control toolbar with proper ARIA', () => {
      const toolbar = container.querySelector('.timeline-controls');
      expect(toolbar?.getAttribute('role')).toBe('toolbar');
      expect(toolbar?.getAttribute('aria-label')).toBe('Timeline editor controls');
    });
  });

  describe('clip management', () => {
    it('adds a clip and updates state', () => {
      const clip = createTestClip();
      editor.addClip(clip);
      const state = editor.getState();
      expect(state.clips).toHaveLength(1);
      expect(state.clips[0].id).toBe('clip-1');
      expect(state.duration).toBe(300);
    });

    it('removes a clip by ID', () => {
      editor.addClip(createTestClip());
      const removed = editor.removeClip('clip-1');
      expect(removed).toBe(true);
      expect(editor.getState().clips).toHaveLength(0);
    });

    it('returns false when removing non-existent clip', () => {
      expect(editor.removeClip('non-existent')).toBe(false);
    });

    it('loads multiple clips', () => {
      const clips = [
        createTestClip({ id: 'a', outPoint: 100, duration: 100 }),
        createTestClip({ id: 'b', inPoint: 100, outPoint: 200, duration: 100 }),
      ];
      editor.loadClips(clips);
      expect(editor.getState().clips).toHaveLength(2);
      expect(editor.getState().duration).toBe(200);
    });

    it('selects a clip', () => {
      editor.addClip(createTestClip());
      editor.selectClip('clip-1');
      expect(editor.getState().selectedClipId).toBe('clip-1');
      expect(callbacks.onClipSelect).toHaveBeenCalledWith('clip-1');
    });

    it('deselects clip on remove', () => {
      editor.addClip(createTestClip());
      editor.selectClip('clip-1');
      editor.removeClip('clip-1');
      expect(editor.getState().selectedClipId).toBeNull();
    });

    it('gets a specific clip', () => {
      editor.addClip(createTestClip());
      const clip = editor.getClip('clip-1');
      expect(clip).toBeDefined();
      expect(clip?.id).toBe('clip-1');
    });
  });

  describe('playhead and seeking', () => {
    beforeEach(() => {
      editor.addClip(createTestClip());
    });

    it('seeks to a specific frame', () => {
      editor.seekToFrame(100);
      expect(editor.getState().playheadFrame).toBe(100);
      expect(callbacks.onPlayheadChange).toHaveBeenCalledWith(100);
    });

    it('clamps frame to 0 on negative values', () => {
      editor.seekToFrame(-10);
      expect(editor.getState().playheadFrame).toBe(0);
    });

    it('clamps frame to duration on overflow', () => {
      editor.seekToFrame(9999);
      expect(editor.getState().playheadFrame).toBe(300);
    });

    it('rounds to nearest frame', () => {
      editor.seekToFrame(100.7);
      expect(editor.getState().playheadFrame).toBe(101);
    });

    it('advances by one frame with nextFrame()', () => {
      editor.seekToFrame(50);
      editor.nextFrame();
      expect(editor.getState().playheadFrame).toBe(51);
    });

    it('goes back one frame with prevFrame()', () => {
      editor.seekToFrame(50);
      editor.prevFrame();
      expect(editor.getState().playheadFrame).toBe(49);
    });

    it('seeks relative frames', () => {
      editor.seekToFrame(50);
      editor.seekRelativeFrames(10);
      expect(editor.getState().playheadFrame).toBe(60);
    });

    it('does not go below 0 with prevFrame', () => {
      editor.seekToFrame(0);
      editor.prevFrame();
      expect(editor.getState().playheadFrame).toBe(0);
    });
  });

  describe('play/pause toggle', () => {
    it('toggles between play and pause', () => {
      expect(editor.getState().isPlaying).toBe(false);
      editor.togglePlayPause();
      expect(editor.getState().isPlaying).toBe(true);
      editor.togglePlayPause();
      expect(editor.getState().isPlaying).toBe(false);
    });

    it('updates play button text', () => {
      const btn = container.querySelector('.btn-play-pause');
      expect(btn?.textContent).toBe('▶');
      editor.togglePlayPause();
      expect(btn?.textContent).toBe('⏸');
    });
  });

  describe('zoom controls', () => {
    it('zooms in', () => {
      const initialZoom = editor.getState().zoomLevel;
      editor.zoomIn();
      expect(editor.getState().zoomLevel).toBeGreaterThan(initialZoom);
      expect(callbacks.onZoomChange).toHaveBeenCalled();
    });

    it('zooms out', () => {
      editor.setZoom(2);
      const zoomBefore = editor.getState().zoomLevel;
      editor.zoomOut();
      expect(editor.getState().zoomLevel).toBeLessThan(zoomBefore);
    });

    it('clamps zoom to min', () => {
      editor.setZoom(0.001);
      expect(editor.getState().zoomLevel).toBeGreaterThanOrEqual(0.1);
    });

    it('clamps zoom to max', () => {
      editor.setZoom(999);
      expect(editor.getState().zoomLevel).toBeLessThanOrEqual(10);
    });

    it('zoom to fit adjusts based on duration', () => {
      editor.addClip(createTestClip({ outPoint: 600 }));
      editor.zoomToFit();
      // After fit, the entire timeline should be visible
      expect(editor.getState().zoomLevel).toBeGreaterThan(0);
    });

    it('setZoom does nothing if value is same', () => {
      editor.setZoom(1);
      (callbacks.onZoomChange as ReturnType<typeof vi.fn>).mockClear();
      editor.setZoom(1);
      expect(callbacks.onZoomChange).not.toHaveBeenCalled();
    });
  });

  describe('trim operations', () => {
    beforeEach(() => {
      editor.addClip(createTestClip());
    });

    it('sets in point at current playhead', () => {
      editor.seekToFrame(50);
      editor.selectClip('clip-1');
      editor.setInPoint();
      const clip = editor.getClip('clip-1');
      expect(clip?.inPoint).toBe(50);
      expect(clip?.duration).toBe(250);
      expect(callbacks.onTrimEnd).toHaveBeenCalled();
    });

    it('sets out point at current playhead', () => {
      editor.seekToFrame(200);
      editor.selectClip('clip-1');
      editor.setOutPoint();
      const clip = editor.getClip('clip-1');
      expect(clip?.outPoint).toBe(200);
      expect(clip?.duration).toBe(200);
    });

    it('does not set in point beyond out point', () => {
      editor.seekToFrame(300);
      editor.selectClip('clip-1');
      editor.setInPoint();
      // Should not change because frame >= outPoint
      const clip = editor.getClip('clip-1');
      expect(clip?.inPoint).toBe(0);
    });

    it('does not set out point before in point', () => {
      editor.addClip(createTestClip({ id: 'clip-2', inPoint: 50, outPoint: 200, duration: 150 }));
      editor.seekToFrame(30);
      editor.selectClip('clip-2');
      editor.setOutPoint();
      // Should not change because frame <= inPoint
      const clip = editor.getClip('clip-2');
      expect(clip?.outPoint).toBe(200);
    });

    it('uses clip at playhead if no clip selected', () => {
      editor.selectClip(null);
      editor.seekToFrame(100);
      editor.setInPoint();
      const clip = editor.getClip('clip-1');
      expect(clip?.inPoint).toBe(100);
    });
  });
