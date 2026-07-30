/**
 * Performance Monitoring Service
 *
 * Comprehensive client-side performance monitoring including Core Web Vitals,
 * video-specific metrics, performance budgets, and user experience analytics.
 *
 * Usage:
 *   import { performanceMonitor } from './services/performance';
 *   performanceMonitor.start();
 *
 * Validates: Requirements 12.7
 */

export {
  observeLCP,
  observeFID,
  observeINP,
  observeCLS,
  observeAllWebVitals,
  type WebVitalMetric,
  type WebVitalCallback,
} from './core-web-vitals.js';

export {
  VideoPerformanceTracker,
  videoMetrics,
  type VideoMetricEntry,
  type VideoMetricCallback,
} from './video-metrics.js';

export {
  PerformanceBudgetMonitor,
  performanceBudgets,
  DEFAULT_BUDGETS,
  type PerformanceBudget,
  type BudgetAlert,
  type BudgetAlertCallback,
  type AlertSeverity,
} from './performance-budgets.js';

export {
  UserExperienceMetrics,
  uxMetrics,
  type UXMetricEntry,
  type UXMetricCallback,
  type NavigationTimingData,
  type ResourceTimingEntry,
} from './user-experience-metrics.js';

import { observeAllWebVitals, type WebVitalMetric } from './core-web-vitals.js';
import { videoMetrics, type VideoMetricEntry } from './video-metrics.js';
import { performanceBudgets, type BudgetAlert } from './performance-budgets.js';
import { uxMetrics, type UXMetricEntry } from './user-experience-metrics.js';

export interface PerformanceMonitorConfig {
  /** Enable Core Web Vitals tracking. Default: true */
  trackWebVitals?: boolean;
  /** Enable long task observation. Default: true */
  trackLongTasks?: boolean;
  /** Enable resource observation. Default: true */
  trackResources?: boolean;
  /** Enable performance budget checks. Default: true */
  enableBudgets?: boolean;
  /** Callback for all metrics. */
  onMetric?: (metric: WebVitalMetric | VideoMetricEntry | UXMetricEntry) => void;
  /** Callback for budget alerts. */
  onAlert?: (alert: BudgetAlert) => void;
  /** Resource observation thresholds. */
  resourceThresholds?: { sizeThreshold?: number; durationThreshold?: number };
}

/**
 * Unified performance monitor that orchestrates all sub-systems.
 */
export class PerformanceMonitor {
  private teardowns: Array<(() => void) | undefined> = [];
  private running = false;
  private config: PerformanceMonitorConfig;

  constructor(config: PerformanceMonitorConfig = {}) {
    this.config = {
      trackWebVitals: true,
      trackLongTasks: true,
      trackResources: true,
      enableBudgets: true,
      ...config,
    };
  }

  /**
   * Start all performance monitoring.
   */
  public start(): void {
    if (this.running) return;
    this.running = true;

    const { onMetric, onAlert } = this.config;

    // Wire up budget monitoring for Web Vitals and video metrics
    if (this.config.enableBudgets && onAlert) {
      this.teardowns.push(performanceBudgets.onAlert(onAlert));
    }

    // Core Web Vitals
    if (this.config.trackWebVitals) {
      const teardown = observeAllWebVitals((metric) => {
        onMetric?.(metric);
        if (this.config.enableBudgets) {
          performanceBudgets.checkMetric(metric.name, metric.value);
        }
      });
      this.teardowns.push(teardown);
    }

    // Video metrics → budget integration
    this.teardowns.push(
      videoMetrics.onMetric((entry) => {
        onMetric?.(entry);
        if (this.config.enableBudgets) {
          performanceBudgets.checkMetric(entry.name, entry.value);
        }
      })
    );

    // UX metrics → budget integration
    this.teardowns.push(
      uxMetrics.onMetric((entry) => {
        onMetric?.(entry);
        if (this.config.enableBudgets) {
          performanceBudgets.checkMetric(entry.name, entry.value);
        }
      })
    );

    // Long tasks
    if (this.config.trackLongTasks) {
      this.teardowns.push(uxMetrics.startLongTaskObservation());
    }

    // Resource loading
    if (this.config.trackResources) {
      this.teardowns.push(uxMetrics.startResourceObservation(this.config.resourceThresholds));
    }
  }

  /**
   * Stop all performance monitoring and clean up observers.
   */
  public stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const teardown of this.teardowns) {
      teardown?.();
    }
    this.teardowns = [];
    uxMetrics.destroy();
    videoMetrics.reset();
  }

  /**
   * Check if monitoring is currently active.
   */
  public isRunning(): boolean {
    return this.running;
  }
}

/** Singleton performance monitor. */
export const performanceMonitor = new PerformanceMonitor();
