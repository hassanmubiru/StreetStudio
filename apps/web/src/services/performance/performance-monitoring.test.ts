/**
 * Performance Monitoring Tests
 *
 * Unit tests for Core Web Vitals tracking, video metrics,
 * performance budgets, and user experience metrics.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  observeLCP,
  observeFID,
  observeINP,
  observeCLS,
  observeAllWebVitals,
} from './core-web-vitals.js';
import { VideoPerformanceTracker, videoMetrics } from './video-metrics.js';
import {
  PerformanceBudgetMonitor,
  DEFAULT_BUDGETS,
  performanceBudgets,
} from './performance-budgets.js';
import { UserExperienceMetrics } from './user-experience-metrics.js';
import { PerformanceMonitor } from './index.js';

// --- Helpers to mock PerformanceObserver ---

type ObserverCallback = (list: { getEntries: () => any[] }) => void;

function createMockPerformanceObserver() {
  let registeredCallbacks: Array<{ type: string; callback: ObserverCallback }> = [];

  const MockPerformanceObserver = vi.fn().mockImplementation((callback: ObserverCallback) => {
    const instance = {
      observe: vi.fn().mockImplementation((options: { type: string }) => {
        registeredCallbacks.push({ type: options.type, callback });
      }),
      disconnect: vi.fn(),
    };
    return instance;
  });

  function fireEntries(type: string, entries: any[]) {
    const matching = registeredCallbacks.filter((r) => r.type === type);
    for (const { callback } of matching) {
      callback({ getEntries: () => entries });
    }
  }

  function reset() {
    registeredCallbacks = [];
  }

  return { MockPerformanceObserver, fireEntries, reset };
}

describe('Core Web Vitals', () => {
  let mockPO: ReturnType<typeof createMockPerformanceObserver>;

  beforeEach(() => {
    mockPO = createMockPerformanceObserver();
    vi.stubGlobal('PerformanceObserver', mockPO.MockPerformanceObserver);
  });

  afterEach(() => {
    mockPO.reset();
  });

  describe('observeLCP', () => {
    it('reports LCP metric when visibility changes to hidden', () => {
      const callback = vi.fn();
      observeLCP(callback);

      // Simulate LCP entry
      mockPO.fireEntries('largest-contentful-paint', [{ startTime: 1800 }]);

      // Trigger visibility change
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LCP',
          value: 1800,
          rating: 'good',
        })
      );
    });

    it('rates LCP as needs-improvement when between 2500 and 4000', () => {
      const callback = vi.fn();
      observeLCP(callback);

      mockPO.fireEntries('largest-contentful-paint', [{ startTime: 3200 }]);

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LCP',
          rating: 'needs-improvement',
        })
      );
    });

    it('rates LCP as poor when above 4000', () => {
      const callback = vi.fn();
      observeLCP(callback);

      mockPO.fireEntries('largest-contentful-paint', [{ startTime: 5000 }]);

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LCP',
          rating: 'poor',
        })
      );
    });

    it('returns a teardown function that disconnects the observer', () => {
      const callback = vi.fn();
      const teardown = observeLCP(callback);
      expect(teardown).toBeTypeOf('function');
    });

    it('returns undefined when PerformanceObserver is not available', () => {
      vi.stubGlobal('PerformanceObserver', undefined);
      const callback = vi.fn();
      const result = observeLCP(callback);
      expect(result).toBeUndefined();
    });
  });

  describe('observeFID', () => {
    it('reports FID metric for first input', () => {
      const callback = vi.fn();
      observeFID(callback);

      mockPO.fireEntries('first-input', [
        { startTime: 100, processingStart: 120 },
      ]);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FID',
          value: 20,
          rating: 'good',
        })
      );
    });

    it('rates FID as poor when delay exceeds 300ms', () => {
      const callback = vi.fn();
      observeFID(callback);

      mockPO.fireEntries('first-input', [
        { startTime: 100, processingStart: 500 },
      ]);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FID',
          rating: 'poor',
        })
      );
    });
  });

  describe('observeCLS', () => {
    it('reports CLS metric on visibility change', () => {
      const callback = vi.fn();
      observeCLS(callback);

      // Simulate layout shifts
      mockPO.fireEntries('layout-shift', [
        { startTime: 1000, value: 0.05, hadRecentInput: false },
        { startTime: 1500, value: 0.03, hadRecentInput: false },
      ]);

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'CLS',
          value: 0.08,
          rating: 'good',
        })
      );
    });

    it('ignores layout shifts with recent user input', () => {
      const callback = vi.fn();
      observeCLS(callback);

      mockPO.fireEntries('layout-shift', [
        { startTime: 1000, value: 0.5, hadRecentInput: true },
        { startTime: 1500, value: 0.02, hadRecentInput: false },
      ]);

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'CLS',
          value: 0.02,
        })
      );
    });
  });

  describe('observeAllWebVitals', () => {
    it('returns a teardown function', () => {
      const callback = vi.fn();
      const teardown = observeAllWebVitals(callback);
      expect(teardown).toBeTypeOf('function');
    });
  });
});

describe('VideoPerformanceTracker', () => {
  let tracker: VideoPerformanceTracker;

  beforeEach(() => {
    tracker = new VideoPerformanceTracker();
  });

  it('tracks video load time', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.startVideoLoad('video-1');
    // Simulate some time passing
    const duration = tracker.endVideoLoad('video-1');

    expect(duration).toBeGreaterThanOrEqual(0);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.load_time',
        unit: 'ms',
        metadata: expect.objectContaining({ videoId: 'video-1' }),
      })
    );
  });

  it('tracks playback start time', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.startPlaybackStart('video-2');
    const duration = tracker.endPlaybackStart('video-2');

    expect(duration).toBeGreaterThanOrEqual(0);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.playback_start_time',
        unit: 'ms',
        metadata: expect.objectContaining({ videoId: 'video-2' }),
      })
    );
  });

  it('tracks editor operation latency', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.startEditorOperation('op-1', 'trim');
    const duration = tracker.endEditorOperation('op-1');

    expect(duration).toBeGreaterThanOrEqual(0);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'editor.operation_latency',
        unit: 'ms',
        metadata: expect.objectContaining({ operationId: 'op-1', operationType: 'trim' }),
      })
    );
  });

  it('returns -1 for unstarted operations', () => {
    expect(tracker.endVideoLoad('unknown')).toBe(-1);
    expect(tracker.endPlaybackStart('unknown')).toBe(-1);
    expect(tracker.endEditorOperation('unknown')).toBe(-1);
  });

  it('records buffering events', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.recordBufferingEvent('video-3', 250);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.buffering_duration',
        value: 250,
        unit: 'ms',
      })
    );
  });

  it('records frame drop ratio', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.recordFrameDrops('video-4', 5, 100);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.frame_drop_ratio',
        value: 0.05,
        unit: 'ratio',
      })
    );
  });

  it('records upload throughput', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.recordUploadThroughput('upload-1', 1024 * 1024, 1000);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.upload_throughput',
        value: 1024 * 1024, // 1 MB/s
        unit: 'bytes',
      })
    );
  });

  it('records seek latency', () => {
    const callback = vi.fn();
    tracker.onMetric(callback);

    tracker.recordSeekLatency('video-5', 150);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.seek_latency',
        value: 150,
        unit: 'ms',
      })
    );
  });

  it('lists pending operations', () => {
    tracker.startVideoLoad('v1');
    tracker.startEditorOperation('op1', 'split');

    const pending = tracker.getPendingOperations();
    expect(pending).toContain('video-load:v1');
    expect(pending).toContain('editor-op:op1');
  });

  it('clears pending operations on reset', () => {
    tracker.startVideoLoad('v1');
    tracker.reset();

    expect(tracker.getPendingOperations()).toHaveLength(0);
  });

  it('unsubscribes callbacks correctly', () => {
    const callback = vi.fn();
    const unsubscribe = tracker.onMetric(callback);

    tracker.recordSeekLatency('v1', 100);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    tracker.recordSeekLatency('v1', 100);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('PerformanceBudgetMonitor', () => {
  let monitor: PerformanceBudgetMonitor;

  beforeEach(() => {
    monitor = new PerformanceBudgetMonitor(DEFAULT_BUDGETS);
  });

  it('returns null when metric is within budget', () => {
    const result = monitor.checkMetric('LCP', 2000);
    expect(result).toBeNull();
  });

  it('fires warning alert when warning threshold is exceeded', () => {
    const alertCallback = vi.fn();
    monitor.onAlert(alertCallback);

    const alert = monitor.checkMetric('LCP', 3000);

    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('warning');
    expect(alert!.actualValue).toBe(3000);
    expect(alert!.threshold).toBe(2500);
    expect(alertCallback).toHaveBeenCalledWith(alert);
  });

  it('fires critical alert when critical threshold is exceeded', () => {
    const alertCallback = vi.fn();
    monitor.onAlert(alertCallback);

    const alert = monitor.checkMetric('LCP', 5000);

    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('critical');
    expect(alert!.threshold).toBe(4000);
  });

  it('returns null for unknown metrics', () => {
    const result = monitor.checkMetric('unknown_metric', 9999);
    expect(result).toBeNull();
  });

  it('allows adding custom budgets', () => {
    monitor.setBudget({
      metric: 'custom.metric',
      warningThreshold: 100,
      criticalThreshold: 200,
    });

    const result = monitor.checkMetric('custom.metric', 150);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
  });

  it('allows removing budgets', () => {
    monitor.removeBudget('LCP');
    const result = monitor.checkMetric('LCP', 99999);
    expect(result).toBeNull();
  });

  it('maintains alert history', () => {
    monitor.checkMetric('LCP', 3000);
    monitor.checkMetric('FID', 400);

    const history = monitor.getAlertHistory();
    expect(history).toHaveLength(2);
    expect(history[0].metric).toBe('FID'); // Most recent first
    expect(history[1].metric).toBe('LCP');
  });

  it('clears alert history', () => {
    monitor.checkMetric('LCP', 3000);
    monitor.clearHistory();
    expect(monitor.getAlertHistory()).toHaveLength(0);
  });

  it('checks isWithinBudget correctly', () => {
    expect(monitor.isWithinBudget('LCP', 2000)).toBe(true);
    expect(monitor.isWithinBudget('LCP', 2500)).toBe(true);
    expect(monitor.isWithinBudget('LCP', 3000)).toBe(false);
  });

  it('returns true for unknown metrics in isWithinBudget', () => {
    expect(monitor.isWithinBudget('not_tracked', 9999)).toBe(true);
  });

  it('provides budget summary', () => {
    const summary = monitor.getSummary({ LCP: 1000, FID: 200, CLS: 0.3 });

    expect(summary).toContainEqual({ metric: 'LCP', value: 1000, status: 'good' });
    expect(summary).toContainEqual({ metric: 'FID', value: 200, status: 'warning' });
    expect(summary).toContainEqual({ metric: 'CLS', value: 0.3, status: 'critical' });
  });

  it('unsubscribes alert callbacks correctly', () => {
    const callback = vi.fn();
    const unsubscribe = monitor.onAlert(callback);

    monitor.checkMetric('LCP', 3000);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    monitor.checkMetric('LCP', 3000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('respects max history size', () => {
    const smallMonitor = new PerformanceBudgetMonitor(DEFAULT_BUDGETS, 5);

    for (let i = 0; i < 10; i++) {
      smallMonitor.checkMetric('LCP', 5000);
    }

    expect(smallMonitor.getAlertHistory()).toHaveLength(5);
  });

  it('returns all configured budgets', () => {
    const budgets = monitor.getAllBudgets();
    expect(budgets.length).toBe(DEFAULT_BUDGETS.length);
  });

  it('retrieves a specific budget', () => {
    const budget = monitor.getBudget('LCP');
    expect(budget).toBeDefined();
    expect(budget!.warningThreshold).toBe(2500);
  });
});

describe('UserExperienceMetrics', () => {
  let metrics: UserExperienceMetrics;
  let mockPO: ReturnType<typeof createMockPerformanceObserver>;

  beforeEach(() => {
    metrics = new UserExperienceMetrics();
    mockPO = createMockPerformanceObserver();
    vi.stubGlobal('PerformanceObserver', mockPO.MockPerformanceObserver);
  });

  afterEach(() => {
    metrics.destroy();
    mockPO.reset();
  });

  it('observes long tasks and reports them', () => {
    const callback = vi.fn();
    metrics.onMetric(callback);

    metrics.startLongTaskObservation();

    // Simulate a long task
    mockPO.fireEntries('longtask', [{ duration: 120, startTime: 500 }]);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ux.long_task',
        value: 120,
        unit: 'ms',
      })
    );
  });

  it('tracks long task summary', () => {
    metrics.startLongTaskObservation();

    mockPO.fireEntries('longtask', [
      { duration: 80, startTime: 100 },
      { duration: 150, startTime: 300 },
    ]);

    const summary = metrics.getLongTaskSummary();
    expect(summary.count).toBe(2);
    expect(summary.totalDuration).toBe(230);
  });

  it('returns navigation timing data when available', () => {
    const mockNavEntry = {
      domainLookupStart: 0,
      domainLookupEnd: 10,
      connectStart: 10,
      connectEnd: 30,
      secureConnectionStart: 15,
      requestStart: 30,
      responseStart: 50,
      responseEnd: 100,
      domInteractive: 200,
      domContentLoadedEventEnd: 250,
      loadEventEnd: 400,
      startTime: 0,
      redirectStart: 0,
      redirectEnd: 0,
    };

    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => {
      if (type === 'navigation') return [mockNavEntry] as any;
      return [];
    });

    const timing = metrics.getNavigationTiming();

    expect(timing).not.toBeNull();
    expect(timing!.dnsLookup).toBe(10);
    expect(timing!.serverResponse).toBe(20);
    expect(timing!.domContentLoaded).toBe(250);
    expect(timing!.pageLoad).toBe(400);
  });

  it('returns null when navigation timing is not available', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const timing = metrics.getNavigationTiming();
    expect(timing).toBeNull();
  });

  it('returns paint timings when available', () => {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => {
      if (type === 'paint') {
        return [
          { name: 'first-paint', startTime: 100 },
          { name: 'first-contentful-paint', startTime: 200 },
        ] as any;
      }
      return [];
    });

    const callback = vi.fn();
    metrics.onMetric(callback);

    const paints = metrics.getPaintTimings();

    expect(paints.firstPaint).toBe(100);
    expect(paints.firstContentfulPaint).toBe(200);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ux.first_contentful_paint',
        value: 200,
      })
    );
  });

  it('returns memory usage when API is available', () => {
    Object.defineProperty(performance, 'memory', {
      value: {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
      },
      configurable: true,
    });

    const usage = metrics.getMemoryUsage();

    expect(usage).not.toBeNull();
    expect(usage!.usedJSHeapSize).toBe(50 * 1024 * 1024);
  });

  it('returns null for memory usage when API is unavailable', () => {
    Object.defineProperty(performance, 'memory', {
      value: undefined,
      configurable: true,
    });

    const usage = metrics.getMemoryUsage();
    expect(usage).toBeNull();
  });

  it('unsubscribes callbacks correctly', () => {
    const callback = vi.fn();
    const unsub = metrics.onMetric(callback);

    metrics.startLongTaskObservation();
    mockPO.fireEntries('longtask', [{ duration: 80, startTime: 100 }]);
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
    mockPO.fireEntries('longtask', [{ duration: 80, startTime: 200 }]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for long task observation when PerformanceObserver is unavailable', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    const result = metrics.startLongTaskObservation();
    expect(result).toBeUndefined();
  });

  it('returns resource timings', () => {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => {
      if (type === 'resource') {
        return [
          {
            name: 'https://cdn.example.com/video.mp4',
            initiatorType: 'video',
            transferSize: 1024000,
            duration: 500,
            startTime: 100,
          },
        ] as any;
      }
      return [];
    });

    const resources = metrics.getResourceTimings();
    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('https://cdn.example.com/video.mp4');
    expect(resources[0].transferSize).toBe(1024000);
  });
});

describe('PerformanceMonitor (integration)', () => {
  let monitor: PerformanceMonitor;
  let mockPO: ReturnType<typeof createMockPerformanceObserver>;

  beforeEach(() => {
    mockPO = createMockPerformanceObserver();
    vi.stubGlobal('PerformanceObserver', mockPO.MockPerformanceObserver);
  });

  afterEach(() => {
    monitor?.stop();
    mockPO.reset();
  });

  it('starts and stops monitoring', () => {
    monitor = new PerformanceMonitor();
    expect(monitor.isRunning()).toBe(false);

    monitor.start();
    expect(monitor.isRunning()).toBe(true);

    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('does not start twice', () => {
    monitor = new PerformanceMonitor();
    monitor.start();
    monitor.start(); // Should be a no-op
    expect(monitor.isRunning()).toBe(true);
  });

  it('calls onMetric callback when video metrics fire', () => {
    const onMetric = vi.fn();
    monitor = new PerformanceMonitor({ onMetric });
    monitor.start();

    videoMetrics.recordSeekLatency('v1', 50);

    expect(onMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.seek_latency',
        value: 50,
      })
    );
  });

  it('calls onAlert callback when budgets are exceeded', () => {
    const onAlert = vi.fn();
    monitor = new PerformanceMonitor({ onAlert, enableBudgets: true });
    monitor.start();

    // Use performanceBudgets directly to trigger a critical alert
    performanceBudgets.checkMetric('LCP', 5000);

    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'LCP',
        severity: 'critical',
      })
    );
  });
});
