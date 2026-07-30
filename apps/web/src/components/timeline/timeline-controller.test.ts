/**
 * Unit tests for TimelineController
 * 
 * Tests frame-accurate seeking, zoom, markers, scrubbing, and jump-to-timestamp.
 * 
 * Requirements: 5.3, 5.10, 6.1
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TimelineController,
  snapToFrame,
  frameToTime,
  timeToFrame,
  formatTimecode,
  DEFAULT_FRAME_RATE,
  MIN_ZOOM,
  MAX_ZOOM,
} from './timeline-controller';
import type { TimelineMarker, TimelineCallbacks } from './timeline-controller';

describe('snapToFrame', () => {
  it('snaps to nearest frame boundary at 30fps', () => {
    // 1/30 ≈ 0.0333s per frame
    const result = snapToFrame(1.05, 30);
    // Should snap to nearest frame: frame 31 or 32
    const frameDuration = 1 / 30;
    const nearestFrame = Math.round(1.05 / frameDuration);
    expect(result).toBeCloseTo(nearestFrame * frameDuration, 10);
  });

  it('snaps 0 to 0', () => {
    expect(snapToFrame(0, 30)).toBe(0);
  });

  it('returns same time if already on frame boundary', () => {
    const frameDuration = 1 / 30;
    const time = 5 * frameDuration;
    expect(snapToFrame(time, 30)).toBeCloseTo(time, 10);
  });

  it('returns time unchanged if frameRate is 0', () => {
    expect(snapToFrame(1.5, 0)).toBe(1.5);
  });

  it('handles negative frameRate gracefully', () => {
    expect(snapToFrame(1.5, -1)).toBe(1.5);
  });
});

describe('frameToTime', () => {
  it('converts frame 0 to 0 seconds', () => {
    expect(frameToTime(0, 30)).toBe(0);
  });

  it('converts frame 30 to 1 second at 30fps', () => {
    expect(frameToTime(30, 30)).toBe(1);
  });

  it('converts frame 60 to 1 second at 60fps', () => {
    expect(frameToTime(60, 60)).toBe(1);
  });

  it('returns 0 for frameRate of 0', () => {
    expect(frameToTime(10, 0)).toBe(0);
  });
});

describe('timeToFrame', () => {
  it('converts 0 seconds to frame 0', () => {
    expect(timeToFrame(0, 30)).toBe(0);
  });

  it('converts 1 second to frame 30 at 30fps', () => {
    expect(timeToFrame(1, 30)).toBe(30);
  });

  it('rounds to nearest frame', () => {
    // 0.5 seconds at 30fps = frame 15
    expect(timeToFrame(0.5, 30)).toBe(15);
  });

  it('returns 0 for frameRate of 0', () => {
    expect(timeToFrame(5, 0)).toBe(0);
  });
});

describe('formatTimecode', () => {
  it('formats 0 as 00:00:00:00', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
  });

  it('formats 1 second at 30fps', () => {
    expect(formatTimecode(1, 30)).toBe('00:00:01:00');
  });

  it('formats with correct frame count', () => {
    // 1.5 seconds at 30fps = 45 frames = 1 second + 15 frames
    expect(formatTimecode(1.5, 30)).toBe('00:00:01:15');
  });

  it('formats hours correctly', () => {
    expect(formatTimecode(3661, 30)).toBe('01:01:01:00');
  });

  it('handles negative time', () => {
    expect(formatTimecode(-5, 30)).toBe('00:00:00:00');
  });

  it('handles NaN', () => {
    expect(formatTimecode(NaN, 30)).toBe('00:00:00:00');
  });

  it('handles Infinity', () => {
    expect(formatTimecode(Infinity, 30)).toBe('00:00:00:00');
  });
});

describe('TimelineController', () => {
  let controller: TimelineController;
  let callbacks: TimelineCallbacks;

  beforeEach(() => {
    callbacks = {
      onSeek: vi.fn(),
      onZoomChange: vi.fn(),
      onScrubStart: vi.fn(),
      onScrubEnd: vi.fn(),
      onMarkerClick: vi.fn(),
      onVisibleRangeChange: vi.fn(),
    };
    controller = new TimelineController({ frameRate: 30 }, callbacks);
    controller.setDuration(120); // 2 minutes
  });

  describe('initialization', () => {
    it('creates with default state', () => {
      const state = controller.getState();
      expect(state.duration).toBe(120);
      expect(state.currentTime).toBe(0);
      expect(state.zoomLevel).toBe(1);
      expect(state.frameRate).toBe(30);
      expect(state.isScrubbing).toBe(false);
      expect(state.markers).toEqual([]);
    });

    it('initializes with custom options', () => {
      const custom = new TimelineController({ frameRate: 60, defaultZoom: 2 });
      const state = custom.getState();
      expect(state.frameRate).toBe(60);
      expect(state.zoomLevel).toBe(2);
    });
  });

  describe('seeking', () => {
    it('seek() sets currentTime snapped to frame', () => {
      controller.seek(10.017);
      const state = controller.getState();
      // Should be snapped to nearest frame boundary at 30fps
      const expected = snapToFrame(10.017, 30);
      expect(state.currentTime).toBeCloseTo(expected, 10);
    });

    it('seek() clamps to 0 for negative values', () => {
      controller.seek(-5);
      expect(controller.getState().currentTime).toBe(0);
    });

    it('seek() clamps to duration for values exceeding duration', () => {
      controller.seek(200);
      expect(controller.getState().currentTime).toBeCloseTo(snapToFrame(120, 30), 10);
    });

    it('seek() calls onSeek callback', () => {
      controller.seek(30);
      expect(callbacks.onSeek).toHaveBeenCalled();
    });

    it('seekToFrame() seeks to correct time', () => {
      controller.seekToFrame(150); // frame 150 at 30fps = 5 seconds
      expect(controller.getState().currentTime).toBeCloseTo(5, 5);
    });

    it('seekRelativeFrames() moves forward by frames', () => {
      controller.seek(1); // Start at 1 second
      controller.seekRelativeFrames(10);
      // 1 second + 10 frames at 30fps = 1 + 10/30 ≈ 1.333s
      expect(controller.getState().currentTime).toBeCloseTo(1 + 10 / 30, 5);
    });

    it('seekRelativeFrames() moves backward by frames', () => {
      controller.seek(2); // Start at 2 seconds
      controller.seekRelativeFrames(-15);
      // 2 seconds - 15 frames at 30fps = 2 - 0.5 = 1.5s
      expect(controller.getState().currentTime).toBeCloseTo(1.5, 5);
    });
  });

  describe('scrubbing', () => {
    it('startScrub() sets isScrubbing state', () => {
      controller.startScrub();
      expect(controller.getState().isScrubbing).toBe(true);
    });

    it('startScrub() calls onScrubStart callback', () => {
      controller.startScrub();
      expect(callbacks.onScrubStart).toHaveBeenCalled();
    });

    it('updateScrub() updates time while scrubbing', () => {
      controller.startScrub();
      controller.updateScrub(45.5);
      const expected = snapToFrame(45.5, 30);
      expect(controller.getState().currentTime).toBeCloseTo(expected, 10);
    });

    it('updateScrub() does nothing when not scrubbing', () => {
      controller.updateScrub(45.5);
      expect(controller.getState().currentTime).toBe(0);
    });

    it('updateScrub() clamps to duration', () => {
      controller.startScrub();
      controller.updateScrub(200);
      expect(controller.getState().currentTime).toBeCloseTo(snapToFrame(120, 30), 10);
    });

    it('endScrub() clears isScrubbing and calls callbacks', () => {
      controller.startScrub();
      controller.updateScrub(30);
      controller.endScrub();
      expect(controller.getState().isScrubbing).toBe(false);
      expect(callbacks.onScrubEnd).toHaveBeenCalled();
      expect(callbacks.onSeek).toHaveBeenCalled();
    });
  });

  describe('zoom', () => {
    it('setZoom() sets zoom level', () => {
      controller.setZoom(5);
      expect(controller.getState().zoomLevel).toBe(5);
    });

    it('setZoom() clamps to minZoom', () => {
      controller.setZoom(0.1);
      expect(controller.getState().zoomLevel).toBe(MIN_ZOOM);
    });

    it('setZoom() clamps to maxZoom', () => {
      controller.setZoom(500);
      expect(controller.getState().zoomLevel).toBe(MAX_ZOOM);
    });

    it('setZoom() calls onZoomChange callback', () => {
      controller.setZoom(3);
      expect(callbacks.onZoomChange).toHaveBeenCalledWith(3);
    });

    it('zoomIn() increases zoom by factor', () => {
      controller.setZoom(2);
      controller.zoomIn(2);
      expect(controller.getState().zoomLevel).toBe(4);
    });

    it('zoomOut() decreases zoom by factor', () => {
      controller.setZoom(4);
      controller.zoomOut(2);
      expect(controller.getState().zoomLevel).toBe(2);
    });

    it('zoomToFit() resets to minZoom and scrollOffset 0', () => {
      controller.setZoom(10);
      controller.setScrollOffset(30);
      controller.zoomToFit();
      expect(controller.getState().zoomLevel).toBe(MIN_ZOOM);
      expect(controller.getState().scrollOffset).toBe(0);
    });
  });

  describe('visible range', () => {
    it('getVisibleDuration() returns duration / zoomLevel', () => {
      controller.setZoom(2);
      expect(controller.getVisibleDuration()).toBe(60); // 120 / 2
    });

    it('getVisibleDuration() returns full duration at zoom 1', () => {
      expect(controller.getVisibleDuration()).toBe(120);
    });

    it('setScrollOffset() updates visible range', () => {
      controller.setZoom(4); // visible = 30s
      controller.setScrollOffset(20);
      const state = controller.getState();
      expect(state.visibleStartTime).toBe(20);
      expect(state.visibleEndTime).toBe(50); // 20 + 30
    });

    it('setScrollOffset() clamps to max', () => {
      controller.setZoom(4); // visible = 30s
      controller.setScrollOffset(100); // max = 120 - 30 = 90
      expect(controller.getState().scrollOffset).toBe(90);
    });

    it('setScrollOffset() clamps to 0 for negative', () => {
      controller.setScrollOffset(-10);
      expect(controller.getState().scrollOffset).toBe(0);
    });

    it('calls onVisibleRangeChange when range changes', () => {
      controller.setZoom(2);
      expect(callbacks.onVisibleRangeChange).toHaveBeenCalled();
    });
  });

  describe('markers', () => {
    const marker1: TimelineMarker = { id: 'm1', time: 10, type: 'comment', label: 'Test comment' };
    const marker2: TimelineMarker = { id: 'm2', time: 30, type: 'annotation', label: 'Annotation' };
    const marker3: TimelineMarker = { id: 'm3', time: 60, type: 'chapter', label: 'Chapter 1' };

    it('addMarker() adds a marker', () => {
      controller.addMarker(marker1);
      expect(controller.getState().markers).toHaveLength(1);
      expect(controller.getState().markers[0]).toEqual(marker1);
    });

    it('addMarker() updates existing marker by id', () => {
      controller.addMarker(marker1);
      const updated = { ...marker1, label: 'Updated' };
      controller.addMarker(updated);
      expect(controller.getState().markers).toHaveLength(1);
      expect(controller.getState().markers[0]!.label).toBe('Updated');
    });

    it('addMarker() maintains sorted order by time', () => {
      controller.addMarker(marker3);
      controller.addMarker(marker1);
      controller.addMarker(marker2);
      const markers = controller.getState().markers;
      expect(markers[0]!.time).toBe(10);
      expect(markers[1]!.time).toBe(30);
      expect(markers[2]!.time).toBe(60);
    });

    it('addMarker() rejects markers outside duration range', () => {
      controller.addMarker({ id: 'x', time: -5, type: 'comment' });
      expect(controller.getState().markers).toHaveLength(0);

      controller.addMarker({ id: 'y', time: 200, type: 'comment' });
      expect(controller.getState().markers).toHaveLength(0);
    });

    it('removeMarker() removes a marker by id', () => {
      controller.addMarker(marker1);
      controller.addMarker(marker2);
      controller.removeMarker('m1');
      expect(controller.getState().markers).toHaveLength(1);
      expect(controller.getState().markers[0]!.id).toBe('m2');
    });

    it('clearMarkers() removes all markers', () => {
      controller.addMarker(marker1);
      controller.addMarker(marker2);
      controller.addMarker(marker3);
      controller.clearMarkers();
      expect(controller.getState().markers).toHaveLength(0);
    });

    it('getMarkersInRange() returns markers within time range', () => {
      controller.addMarker(marker1);
      controller.addMarker(marker2);
      controller.addMarker(marker3);
      const inRange = controller.getMarkersInRange(5, 35);
      expect(inRange).toHaveLength(2);
      expect(inRange[0]!.id).toBe('m1');
      expect(inRange[1]!.id).toBe('m2');
    });

    it('handleMarkerClick() calls onMarkerClick callback and seeks', () => {
      controller.addMarker(marker1);
      controller.handleMarkerClick(marker1);
      expect(callbacks.onMarkerClick).toHaveBeenCalledWith(marker1);
      expect(callbacks.onSeek).toHaveBeenCalled();
    });

    it('handleMarkerClick() does not seek when markerClickSeek is false', () => {
      const noSeekController = new TimelineController(
        { markerClickSeek: false },
        callbacks
      );
      noSeekController.setDuration(120);
      noSeekController.addMarker(marker1);
      noSeekController.handleMarkerClick(marker1);
      expect(callbacks.onMarkerClick).toHaveBeenCalledWith(marker1);
      expect(callbacks.onSeek).not.toHaveBeenCalled();
    });
  });

  describe('jump to timestamp', () => {
    it('jumpToTimestamp() seeks to the given time', () => {
      controller.jumpToTimestamp(45);
      expect(controller.getState().currentTime).toBeCloseTo(snapToFrame(45, 30), 10);
    });

    it('jumpToTimestamp() ensures the time is visible', () => {
      controller.setZoom(10); // visible = 12s
      controller.setScrollOffset(0);
      controller.jumpToTimestamp(90);
      const state = controller.getState();
      // The time should now be within the visible range
      expect(state.visibleStartTime).toBeLessThanOrEqual(90);
      expect(state.visibleEndTime).toBeGreaterThanOrEqual(90);
    });

    it('jumpToTimestamp() clamps to duration', () => {
      controller.jumpToTimestamp(200);
      expect(controller.getState().currentTime).toBeCloseTo(snapToFrame(120, 30), 10);
    });
  });

  describe('frame accessors', () => {
    it('getCurrentFrame() returns current frame number', () => {
      controller.seek(2); // 2 seconds = 60 frames at 30fps
      expect(controller.getCurrentFrame()).toBe(60);
    });

    it('getTotalFrames() returns total frames', () => {
      expect(controller.getTotalFrames()).toBe(3600); // 120s * 30fps
    });

    it('getTimecode() returns formatted timecode', () => {
      controller.seek(0);
      expect(controller.getTimecode()).toBe('00:00:00:00');
      controller.seek(61.5);
      expect(controller.getTimecode()).toBe('00:01:01:15');
    });
  });

  describe('event emitter', () => {
    it('on() registers an event listener', () => {
      const handler = vi.fn();
      controller.on('seek', handler);
      controller.seek(10);
      expect(handler).toHaveBeenCalled();
    });

    it('off() removes an event listener', () => {
      const handler = vi.fn();
      controller.on('seek', handler);
      controller.off('seek', handler);
      controller.seek(10);
      expect(handler).not.toHaveBeenCalled();
    });

    it('on() returns an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = controller.on('seek', handler);
      unsub();
      controller.seek(10);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setDuration', () => {
    it('rejects negative duration', () => {
      const c = new TimelineController();
      c.setDuration(-10);
      expect(c.getState().duration).toBe(0);
    });

    it('rejects NaN duration', () => {
      const c = new TimelineController();
      c.setDuration(NaN);
      expect(c.getState().duration).toBe(0);
    });

    it('rejects Infinity duration', () => {
      const c = new TimelineController();
      c.setDuration(Infinity);
      expect(c.getState().duration).toBe(0);
    });
  });

  describe('setCurrentTime', () => {
    it('clamps to duration', () => {
      controller.setCurrentTime(200);
      expect(controller.getState().currentTime).toBeCloseTo(snapToFrame(120, 30), 10);
    });

    it('clamps to 0 for negative values', () => {
      controller.setCurrentTime(-5);
      expect(controller.getState().currentTime).toBe(0);
    });

    it('snaps to frame boundary', () => {
      controller.setCurrentTime(1.017);
      const expected = snapToFrame(1.017, 30);
      expect(controller.getState().currentTime).toBeCloseTo(expected, 10);
    });
  });

  describe('destroy', () => {
    it('clears all listeners and markers', () => {
      const handler = vi.fn();
      controller.on('seek', handler);
      controller.addMarker({ id: 'm1', time: 10, type: 'comment' });

      controller.destroy();
      controller.seek(5);
      expect(handler).not.toHaveBeenCalled();
      expect(controller.getState().markers).toHaveLength(0);
    });
  });
});
