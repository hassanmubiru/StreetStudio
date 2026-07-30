/**
 * Core Web Vitals Tracking
 *
 * Tracks Largest Contentful Paint (LCP), First Input Delay (FID),
 * Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS)
 * using the PerformanceObserver API.
 *
 * Validates: Requirements 12.7
 */

export interface WebVitalMetric {
  name: 'LCP' | 'FID' | 'INP' | 'CLS';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
  entries: PerformanceEntry[];
}

export type WebVitalCallback = (metric: WebVitalMetric) => void;

/** Thresholds per Google's Web Vitals guidelines */
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
} as const;

function getRating(name: keyof typeof THRESHOLDS, value: number): WebVitalMetric['rating'] {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Tracks Largest Contentful Paint — measures loading performance.
 * Reports the render time of the largest content element visible in the viewport.
 */
export function observeLCP(callback: WebVitalCallback): (() => void) | undefined {
  if (typeof PerformanceObserver === 'undefined') return undefined;

  let lastEntry: PerformanceEntry | null = null;

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      // LCP may fire multiple times; always take the latest entry
      lastEntry = entries[entries.length - 1];
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    // Report final LCP on page hide (the last entry before user navigates away)
    const reportFinalLCP = () => {
      if (lastEntry) {
        const value = (lastEntry as any).startTime ?? lastEntry.startTime;
        callback({
          name: 'LCP',
          value,
          rating: getRating('LCP', value),
          timestamp: Date.now(),
          entries: [lastEntry],
        });
      }
      observer.disconnect();
    };

    // visibilitychange is the reliable event for final LCP
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportFinalLCP();
      }
    });

    return () => {
      observer.disconnect();
    };
  } catch {
    // PerformanceObserver type not supported in this browser
    return undefined;
  }
}

/**
 * Tracks First Input Delay — measures interactivity responsiveness.
 * Reports the delay between the first user interaction and the browser response.
 */
export function observeFID(callback: WebVitalCallback): (() => void) | undefined {
  if (typeof PerformanceObserver === 'undefined') return undefined;

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      // FID only fires once for the very first input
      const firstInput = entries[0] as PerformanceEventTiming;
      if (firstInput) {
        const value = firstInput.processingStart - firstInput.startTime;
        callback({
          name: 'FID',
          value,
          rating: getRating('FID', value),
          timestamp: Date.now(),
          entries: [firstInput],
        });
        observer.disconnect();
      }
    });

    observer.observe({ type: 'first-input', buffered: true });

    return () => {
      observer.disconnect();
    };
  } catch {
    return undefined;
  }
}

/**
 * Tracks Interaction to Next Paint — measures overall responsiveness.
 * Reports the worst-case latency of user interactions during the page lifecycle.
 */
export function observeINP(callback: WebVitalCallback): (() => void) | undefined {
  if (typeof PerformanceObserver === 'undefined') return undefined;

  const interactions = new Map<number, number>();

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries() as PerformanceEventTiming[];
      for (const entry of entries) {
        // Group by interactionId — INP considers the worst interaction
        const interactionId = (entry as any).interactionId as number | undefined;
        if (interactionId && interactionId > 0) {
          const existing = interactions.get(interactionId) ?? 0;
          const duration = entry.duration;
          if (duration > existing) {
            interactions.set(interactionId, duration);
          }
        }
      }
    });

    observer.observe({ type: 'event', buffered: true });

    // Report final INP on page hide — take the p98 interaction duration
    const reportFinalINP = () => {
      if (interactions.size === 0) return;

      const sortedDurations = [...interactions.values()].sort((a, b) => b - a);
      // Use the high-percentile interaction (approximation of p98)
      const index = Math.min(
        Math.floor(sortedDurations.length * 0.02),
        sortedDurations.length - 1
      );
      const value = sortedDurations[index];

      callback({
        name: 'INP',
        value,
        rating: getRating('INP', value),
        timestamp: Date.now(),
        entries: [],
      });
      observer.disconnect();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportFinalINP();
      }
    });

    return () => {
      observer.disconnect();
    };
  } catch {
    return undefined;
  }
}

/**
 * Tracks Cumulative Layout Shift — measures visual stability.
 * Reports the sum of unexpected layout shift scores during the page lifecycle,
 * using the session window approach (5s gap, 1s max session).
 */
export function observeCLS(callback: WebVitalCallback): (() => void) | undefined {
  if (typeof PerformanceObserver === 'undefined') return undefined;

  let clsValue = 0;
  let sessionValue = 0;
  let sessionEntries: PerformanceEntry[] = [];
  let previousSessionEndTime = 0;

  try {
    const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();

      for (const entry of entries) {
        const layoutShift = entry as any;
        // Ignore shifts with recent user input
        if (layoutShift.hadRecentInput) continue;

        const shiftValue: number = layoutShift.value ?? 0;

        // Session window: gap of more than 1s or session exceeds 5s
        if (
          sessionValue > 0 &&
          (entry.startTime - previousSessionEndTime > 1000 ||
            entry.startTime - sessionEntries[0].startTime > 5000)
        ) {
          // New session: keep the max session value
          if (sessionValue > clsValue) {
            clsValue = sessionValue;
          }
          sessionValue = 0;
          sessionEntries = [];
        }

        sessionValue += shiftValue;
        sessionEntries.push(entry);
        previousSessionEndTime = entry.startTime;
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Report final CLS on page hide
    const reportFinalCLS = () => {
      // Take the max of the current session and the largest prior session
      const finalValue = Math.max(clsValue, sessionValue);

      callback({
        name: 'CLS',
        value: finalValue,
        rating: getRating('CLS', finalValue),
        timestamp: Date.now(),
        entries: sessionEntries,
      });
      observer.disconnect();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportFinalCLS();
      }
    });

    return () => {
      observer.disconnect();
    };
  } catch {
    return undefined;
  }
}

/**
 * Convenience function to observe all Core Web Vitals at once.
 * Returns a teardown function that disconnects all observers.
 */
export function observeAllWebVitals(callback: WebVitalCallback): () => void {
  const teardowns: Array<(() => void) | undefined> = [
    observeLCP(callback),
    observeFID(callback),
    observeINP(callback),
    observeCLS(callback),
  ];

  return () => {
    for (const teardown of teardowns) {
      teardown?.();
    }
  };
}
