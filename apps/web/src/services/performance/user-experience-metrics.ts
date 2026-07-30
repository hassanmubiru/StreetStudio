/**
 * User Experience Metrics and Analytics
 *
 * Collects user experience metrics including Time to Interactive,
 * navigation timing, long task detection, memory usage, and
 * resource loading performance.
 *
 * Validates: Requirements 12.7
 */

export interface UXMetricEntry {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type UXMetricCallback = (entry: UXMetricEntry) => void;

export interface NavigationTimingData {
  dnsLookup: number;
  tcpConnection: number;
  tlsNegotiation: number;
  serverResponse: number;
  contentDownload: number;
  domParsing: number;
  domContentLoaded: number;
  pageLoad: number;
  redirectTime: number;
}

export interface ResourceTimingEntry {
  name: string;
  initiatorType: string;
  transferSize: number;
  duration: number;
  startTime: number;
}

/**
 * Collects and reports user experience metrics.
 */
export class UserExperienceMetrics {
  private callbacks: UXMetricCallback[] = [];
  private longTaskObserver: PerformanceObserver | null = null;
  private resourceObserver: PerformanceObserver | null = null;
  private longTaskCount = 0;
  private totalLongTaskDuration = 0;

  /**
   * Subscribe to UX metric reports.
   */
  public onMetric(callback: UXMetricCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Measure Time to Interactive (TTI) approximation.
   * Uses a heuristic based on long tasks: TTI is reached when no long tasks
   * occur within a 5-second window after DOM content loaded.
   */
  public measureTTI(): Promise<number> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      let lastLongTaskEnd = 0;
      let checkInterval: ReturnType<typeof setInterval>;

      const observer = this.createLongTaskObserverForTTI((entry) => {
        lastLongTaskEnd = entry.startTime + entry.duration;
      });

      // Check every 500ms if we've been quiet for 5s
      checkInterval = setInterval(() => {
        const now = performance.now();
        const quietPeriod = now - lastLongTaskEnd;

        // If quiet for 5s or if 30s have elapsed (timeout), report TTI
        if (quietPeriod >= 5000 || now - startTime > 30000) {
          clearInterval(checkInterval);
          observer?.disconnect();

          const tti = lastLongTaskEnd > 0 ? lastLongTaskEnd : performance.now() - startTime;

          this.emit({
            name: 'ux.time_to_interactive',
            value: tti,
            unit: 'ms',
            timestamp: Date.now(),
          });

          resolve(tti);
        }
      }, 500);
    });
  }

  /**
   * Start observing long tasks (tasks > 50ms that block the main thread).
   */
  public startLongTaskObservation(): (() => void) | undefined {
    if (typeof PerformanceObserver === 'undefined') return undefined;

    try {
      this.longTaskObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        for (const entry of entries) {
          this.longTaskCount++;
          this.totalLongTaskDuration += entry.duration;

          this.emit({
            name: 'ux.long_task',
            value: entry.duration,
            unit: 'ms',
            timestamp: Date.now(),
            metadata: {
              taskCount: this.longTaskCount,
              totalDuration: this.totalLongTaskDuration,
            },
          });
        }
      });

      this.longTaskObserver.observe({ type: 'longtask', buffered: true });

      return () => {
        this.longTaskObserver?.disconnect();
        this.longTaskObserver = null;
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Collect navigation timing data from the Navigation Timing API.
   * Returns null if timing data is not yet available.
   */
  public getNavigationTiming(): NavigationTimingData | null {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) {
      return null;
    }

    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const nav = entries[0];
    if (!nav) return null;

    const data: NavigationTimingData = {
      dnsLookup: nav.domainLookupEnd - nav.domainLookupStart,
      tcpConnection: nav.connectEnd - nav.connectStart,
      tlsNegotiation: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
      serverResponse: nav.responseStart - nav.requestStart,
      contentDownload: nav.responseEnd - nav.responseStart,
      domParsing: nav.domInteractive - nav.responseEnd,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      pageLoad: nav.loadEventEnd - nav.startTime,
      redirectTime: nav.redirectEnd - nav.redirectStart,
    };

    // Emit individual metrics
    this.emit({ name: 'navigation.dns_lookup', value: data.dnsLookup, unit: 'ms', timestamp: Date.now() });
    this.emit({ name: 'navigation.server_response', value: data.serverResponse, unit: 'ms', timestamp: Date.now() });
    this.emit({ name: 'navigation.dom_content_loaded', value: data.domContentLoaded, unit: 'ms', timestamp: Date.now() });
    this.emit({ name: 'navigation.page_load', value: data.pageLoad, unit: 'ms', timestamp: Date.now() });

    return data;
  }

  /**
   * Start observing resource loading performance.
   * Reports large or slow resources that impact page performance.
   */
  public startResourceObservation(options?: {
    /** Only report resources larger than this size in bytes. Default: 50KB */
    sizeThreshold?: number;
    /** Only report resources slower than this duration in ms. Default: 1000ms */
    durationThreshold?: number;
  }): (() => void) | undefined {
    if (typeof PerformanceObserver === 'undefined') return undefined;

    const sizeThreshold = options?.sizeThreshold ?? 50 * 1024;
    const durationThreshold = options?.durationThreshold ?? 1000;

    try {
      this.resourceObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries() as PerformanceResourceTiming[];
        for (const entry of entries) {
          const isLarge = entry.transferSize > sizeThreshold;
          const isSlow = entry.duration > durationThreshold;

          if (isLarge || isSlow) {
            this.emit({
              name: 'ux.slow_resource',
              value: entry.duration,
              unit: 'ms',
              timestamp: Date.now(),
              metadata: {
                url: entry.name,
                initiatorType: entry.initiatorType,
                transferSize: entry.transferSize,
                isLarge,
                isSlow,
              },
            });
          }
        }
      });

      this.resourceObserver.observe({ type: 'resource', buffered: false });

      return () => {
        this.resourceObserver?.disconnect();
        this.resourceObserver = null;
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get memory usage info (Chrome-only API).
   * Returns null if the API is not available.
   */
  public getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } | null {
    const perfMemory = (performance as any).memory;
    if (!perfMemory) return null;

    const usage = {
      usedJSHeapSize: perfMemory.usedJSHeapSize,
      totalJSHeapSize: perfMemory.totalJSHeapSize,
      jsHeapSizeLimit: perfMemory.jsHeapSizeLimit,
    };

    this.emit({
      name: 'ux.memory_used',
      value: usage.usedJSHeapSize,
      unit: 'bytes',
      timestamp: Date.now(),
      metadata: usage,
    });

    return usage;
  }

  /**
   * Get the count and total duration of long tasks observed so far.
   */
  public getLongTaskSummary(): { count: number; totalDuration: number } {
    return {
      count: this.longTaskCount,
      totalDuration: this.totalLongTaskDuration,
    };
  }

  /**
   * Get all resource timing entries.
   */
  public getResourceTimings(): ResourceTimingEntry[] {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) {
      return [];
    }

    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return entries.map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      duration: entry.duration,
      startTime: entry.startTime,
    }));
  }

  /**
   * Measure the first paint and first contentful paint from the paint timing API.
   */
  public getPaintTimings(): { firstPaint: number | null; firstContentfulPaint: number | null } {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) {
      return { firstPaint: null, firstContentfulPaint: null };
    }

    const entries = performance.getEntriesByType('paint');
    let firstPaint: number | null = null;
    let firstContentfulPaint: number | null = null;

    for (const entry of entries) {
      if (entry.name === 'first-paint') {
        firstPaint = entry.startTime;
      }
      if (entry.name === 'first-contentful-paint') {
        firstContentfulPaint = entry.startTime;
      }
    }

    if (firstContentfulPaint !== null) {
      this.emit({
        name: 'ux.first_contentful_paint',
        value: firstContentfulPaint,
        unit: 'ms',
        timestamp: Date.now(),
      });
    }

    return { firstPaint, firstContentfulPaint };
  }

  /**
   * Stop all observations and clean up.
   */
  public destroy(): void {
    this.longTaskObserver?.disconnect();
    this.resourceObserver?.disconnect();
    this.longTaskObserver = null;
    this.resourceObserver = null;
    this.callbacks = [];
  }

  private emit(entry: UXMetricEntry): void {
    for (const callback of this.callbacks) {
      try {
        callback(entry);
      } catch {
        // Don't let callback errors break the metric pipeline
      }
    }
  }

  private createLongTaskObserverForTTI(
    onLongTask: (entry: PerformanceEntry) => void
  ): PerformanceObserver | null {
    if (typeof PerformanceObserver === 'undefined') return null;

    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        for (const entry of entries) {
          onLongTask(entry);
        }
      });

      observer.observe({ type: 'longtask', buffered: true });
      return observer;
    } catch {
      return null;
    }
  }
}

/** Singleton user experience metrics instance. */
export const uxMetrics = new UserExperienceMetrics();
