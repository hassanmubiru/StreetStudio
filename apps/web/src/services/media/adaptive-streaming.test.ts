/**
 * Unit Tests: Adaptive Bitrate Streaming Manager
 *
 * Tests for quality selection logic, bandwidth estimation,
 * buffer-based downgrades, save-data handling, and quality change events.
 *
 * Validates: Requirements 12.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AdaptiveBitrateManager,
  type NetworkConditions,
  type BufferState,
  type QualityLevel,
} from './adaptive-streaming.js';

describe('AdaptiveBitrateManager', () => {
  let abr: AdaptiveBitrateManager;

  beforeEach(() => {
    vi.useFakeTimers();
    abr = new AdaptiveBitrateManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeNetwork(overrides: Partial<NetworkConditions> = {}): NetworkConditions {
    return {
      bandwidth: 10_000_000, // 10 Mbps
      rtt: 50,
      effectiveType: '4g',
      saveData: false,
      ...overrides,
    };
  }

  function makeBuffer(overrides: Partial<BufferState> = {}): BufferState {
    return {
      bufferedAhead: 15,
      isRebuffering: false,
      duration: 120,
      currentTime: 30,
      ...overrides,
    };
  }

  describe('initial state', () => {
    it('starts at the lowest available quality level', () => {
      const level = abr.getCurrentLevel();
      expect(level).toBe('240p');
    });

    it('returns all default quality levels', () => {
      const levels = abr.getAvailableLevels();
      expect(levels.length).toBe(6);
      expect(levels[0].level).toBe('2160p');
      expect(levels[levels.length - 1].level).toBe('240p');
    });
  });

  describe('quality selection based on bandwidth', () => {
    it('selects 1080p when bandwidth supports it and buffer is healthy', () => {
      // Need to advance time past minSwitchInterval for changes to apply
      vi.advanceTimersByTime(6000);

      // 1080p bitrate is 5Mbps. With 0.7 safety factor, need at least 5/0.7 ≈ 7.15 Mbps
      const network = makeNetwork({ bandwidth: 8_000_000 }); // 8 Mbps * 0.7 = 5.6 Mbps > 5 Mbps
      const buffer = makeBuffer({ bufferedAhead: 15 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('1080p');
    });

    it('selects 720p when bandwidth is moderate', () => {
      vi.advanceTimersByTime(6000);

      // 720p bitrate is 2.5Mbps. With 0.7 safety factor, need at least 2.5/0.7 ≈ 3.57 Mbps
      const network = makeNetwork({ bandwidth: 4_000_000 }); // 4 Mbps * 0.7 = 2.8 Mbps > 2.5 Mbps
      const buffer = makeBuffer({ bufferedAhead: 15 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('720p');
    });

    it('selects lowest quality when bandwidth is very low', () => {
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 200_000 }); // 200 Kbps
      const buffer = makeBuffer({ bufferedAhead: 15 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('240p');
    });

    it('applies bandwidth safety factor (0.7) when selecting quality', () => {
      vi.advanceTimersByTime(6000);

      // At exactly 5Mbps * 0.7 = 3.5Mbps effective, should get 720p (bitrate 2.5Mbps)
      const network = makeNetwork({ bandwidth: 5_000_000 });
      const buffer = makeBuffer({ bufferedAhead: 15 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('720p');
    });
  });

  describe('buffer-based quality adjustment', () => {
    it('downgrades quality when buffer is critically low', () => {
      vi.advanceTimersByTime(6000);

      // First get to a higher quality
      abr.setQualityLevel('1080p');
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 10_000_000 });
      const buffer = makeBuffer({ bufferedAhead: 2 }); // Below critical (3s)

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('720p'); // One level down from 1080p
    });

    it('downgrades immediately when rebuffering', () => {
      vi.advanceTimersByTime(6000);

      abr.setQualityLevel('720p');
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 10_000_000 });
      const buffer = makeBuffer({ isRebuffering: true, bufferedAhead: 5 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('480p');
    });

    it('does not upgrade quality unless buffer exceeds minBufferForUpgrade', () => {
      vi.advanceTimersByTime(6000);

      // Start low
      const network = makeNetwork({ bandwidth: 10_000_000 });
      const buffer = makeBuffer({ bufferedAhead: 5 }); // Below 10s threshold

      const level = abr.selectQuality(network, buffer);
      // Should stay at current level (240p) because buffer isn't healthy enough to upgrade
      expect(level).toBe('240p');
    });

    it('upgrades when buffer is above minBufferForUpgrade threshold', () => {
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 10_000_000 });
      const buffer = makeBuffer({ bufferedAhead: 12 }); // Above 10s threshold

      const level = abr.selectQuality(network, buffer);
      // With 10Mbps * 0.7 = 7Mbps effective, should select 1080p (5Mbps bitrate)
      expect(level).toBe('1080p');
    });
  });

  describe('save-data and metered connections', () => {
    it('forces minimum quality when saveData is true', () => {
      vi.advanceTimersByTime(6000);

      abr.setQualityLevel('1080p');
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 50_000_000, saveData: true });
      const buffer = makeBuffer({ bufferedAhead: 30 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('240p');
    });

    it('respects save-data preference even with excellent conditions', () => {
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({
        bandwidth: 100_000_000, // 100 Mbps
        saveData: true,
      });
      const buffer = makeBuffer({ bufferedAhead: 60 });

      const level = abr.selectQuality(network, buffer);
      expect(level).toBe('240p');
    });

    it('ignores save-data when respectSaveData is disabled', () => {
      const customAbr = new AdaptiveBitrateManager({ respectSaveData: false });
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 10_000_000, saveData: true });
      const buffer = makeBuffer({ bufferedAhead: 15 });

      const level = customAbr.selectQuality(network, buffer);
      // Should not force minimum quality
      expect(level).not.toBe('240p');
    });
  });

  describe('minimum switch interval', () => {
    it('does not switch quality within minSwitchInterval', () => {
      vi.advanceTimersByTime(6000);

      const network = makeNetwork({ bandwidth: 10_000_000 });
      const buffer = makeBuffer({ bufferedAhead: 15 });

      // First switch
      abr.selectQuality(network, buffer);

      // Try to switch again immediately (within 5000ms default interval)
      vi.advanceTimersByTime(2000);
      const level = abr.selectQuality(
        makeNetwork({ bandwidth: 200_000 }),
        buffer
      );

      // Should remain at current level since switch interval hasn't passed
      expect(level).toBe(abr.getCurrentLevel());
    });

    it('allows switching after minSwitchInterval has elapsed', () => {
      vi.advanceTimersByTime(6000);

      const buffer = makeBuffer({ bufferedAhead: 15 });
      abr.selectQuality(makeNetwork({ bandwidth: 10_000_000 }), buffer);
      const firstLevel = abr.getCurrentLevel();

      // Advance past switch interval
      vi.advanceTimersByTime(6000);

      // Now try to downgrade
      const level = abr.selectQuality(
        makeNetwork({ bandwidth: 200_000 }),
        makeBuffer({ bufferedAhead: 15 })
      );

      expect(level).not.toBe(firstLevel);
    });
  });

  describe('bandwidth smoothing', () => {
    it('returns 0 when no samples are recorded', () => {
      const freshAbr = new AdaptiveBitrateManager();
      expect(freshAbr.getSmoothedBandwidth()).toBe(0);
    });

    it('returns the single sample when only one exists', () => {
      abr.recordBandwidthSample(5_000_000);
      expect(abr.getSmoothedBandwidth()).toBe(5_000_000);
    });

    it('applies EWMA smoothing across multiple samples', () => {
      abr.recordBandwidthSample(5_000_000);
      abr.recordBandwidthSample(10_000_000);

      const smoothed = abr.getSmoothedBandwidth();
      // EWMA with alpha=0.3: 0.3 * 10M + 0.7 * 5M = 6.5M
      expect(smoothed).toBeCloseTo(6_500_000, -3);
    });

    it('keeps at most 10 bandwidth samples', () => {
      for (let i = 0; i < 15; i++) {
        abr.recordBandwidthSample(1_000_000 * (i + 1));
      }

      // After 15 samples, only last 10 should remain
      // The smoothed value should reflect later (higher) samples
      const smoothed = abr.getSmoothedBandwidth();
      expect(smoothed).toBeGreaterThan(5_000_000);
    });
  });

  describe('manual quality selection', () => {
    it('sets quality level and fires change event', () => {
      const listener = vi.fn();
      abr.onQualityChange(listener);

      abr.setQualityLevel('720p');

      expect(abr.getCurrentLevel()).toBe('720p');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          previousLevel: '240p',
          newLevel: '720p',
          reason: 'user',
        })
      );
    });

    it('does not fire event when setting same quality', () => {
      abr.setQualityLevel('720p');

      const listener = vi.fn();
      abr.onQualityChange(listener);

      abr.setQualityLevel('720p');
      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores invalid quality levels', () => {
      abr.setQualityLevel('720p');
      abr.setQualityLevel('invalid' as QualityLevel);
      expect(abr.getCurrentLevel()).toBe('720p');
    });
  });

  describe('quality change callbacks', () => {
    it('subscribes and unsubscribes callbacks', () => {
      const listener = vi.fn();
      const unsubscribe = abr.onQualityChange(listener);

      abr.setQualityLevel('480p');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      abr.setQualityLevel('720p');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      abr.onQualityChange(listener1);
      abr.onQualityChange(listener2);

      abr.setQualityLevel('1080p');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('respects maxQuality configuration', () => {
      const limited = new AdaptiveBitrateManager({ maxQuality: '720p' });
      const levels = limited.getAvailableLevels();

      expect(levels[0].level).toBe('720p');
      expect(levels.every((l) => l.level !== '1080p' && l.level !== '2160p')).toBe(true);
    });

    it('respects minQuality configuration', () => {
      const limited = new AdaptiveBitrateManager({ minQuality: '480p' });
      const levels = limited.getAvailableLevels();

      const lastLevel = levels[levels.length - 1];
      expect(lastLevel.level).toBe('480p');
      expect(levels.every((l) => l.level !== '360p' && l.level !== '240p')).toBe(true);
    });

    it('updates config at runtime', () => {
      abr.updateConfig({ maxQuality: '720p' });
      const levels = abr.getAvailableLevels();
      expect(levels[0].level).toBe('720p');
    });
  });

  describe('reset', () => {
    it('clears bandwidth history and resets to initial level', () => {
      abr.recordBandwidthSample(10_000_000);
      abr.setQualityLevel('1080p');

      abr.reset();

      expect(abr.getSmoothedBandwidth()).toBe(0);
      expect(abr.getCurrentLevel()).toBe('240p');
    });
  });

  describe('getQualityInfo', () => {
    it('returns quality metadata for a valid level', () => {
      const info = abr.getQualityInfo('1080p');
      expect(info).toBeDefined();
      expect(info!.bitrate).toBe(5_000_000);
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
    });

    it('returns undefined for unavailable levels', () => {
      const limited = new AdaptiveBitrateManager({ maxQuality: '720p' });
      const info = limited.getQualityInfo('1080p');
      expect(info).toBeUndefined();
    });
  });
});
