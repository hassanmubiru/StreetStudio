/**
 * Performance Budgets and Monitoring Alerts
 *
 * Implements configurable performance budgets with threshold-based alerting.
 * Monitors metrics against defined budgets and fires callbacks when budgets
 * are exceeded.
 *
 * Validates: Requirements 12.7
 */

export interface PerformanceBudget {
  /** Unique metric name this budget applies to (e.g. 'LCP', 'video.load_time'). */
  metric: string;
  /** Warning threshold — value above this is flagged. */
  warningThreshold: number;
  /** Critical threshold — value above this triggers a critical alert. */
  criticalThreshold: number;
  /** Human-readable description. */
  description?: string;
}

export type AlertSeverity = 'warning' | 'critical';

export interface BudgetAlert {
  metric: string;
  severity: AlertSeverity;
  actualValue: number;
  threshold: number;
  timestamp: number;
  description?: string;
}

export type BudgetAlertCallback = (alert: BudgetAlert) => void;

/** Default budgets for Core Web Vitals and video operations. */
export const DEFAULT_BUDGETS: PerformanceBudget[] = [
  {
    metric: 'LCP',
    warningThreshold: 2500,
    criticalThreshold: 4000,
    description: 'Largest Contentful Paint should be under 2.5s',
  },
  {
    metric: 'FID',
    warningThreshold: 100,
    criticalThreshold: 300,
    description: 'First Input Delay should be under 100ms',
  },
  {
    metric: 'INP',
    warningThreshold: 200,
    criticalThreshold: 500,
    description: 'Interaction to Next Paint should be under 200ms',
  },
  {
    metric: 'CLS',
    warningThreshold: 0.1,
    criticalThreshold: 0.25,
    description: 'Cumulative Layout Shift should be under 0.1',
  },
  {
    metric: 'video.load_time',
    warningThreshold: 3000,
    criticalThreshold: 5000,
    description: 'Video load time should be under 3s',
  },
  {
    metric: 'video.playback_start_time',
    warningThreshold: 2000,
    criticalThreshold: 5000,
    description: 'Playback should start within 2s',
  },
  {
    metric: 'editor.operation_latency',
    warningThreshold: 500,
    criticalThreshold: 2000,
    description: 'Editor operations should complete within 500ms',
  },
  {
    metric: 'tti',
    warningThreshold: 3500,
    criticalThreshold: 7500,
    description: 'Time to Interactive should be under 3.5s',
  },
];

/**
 * Performance budget monitor.
 * Accepts metric values and checks them against configured budgets.
 */
export class PerformanceBudgetMonitor {
  private budgets: Map<string, PerformanceBudget> = new Map();
  private alertCallbacks: BudgetAlertCallback[] = [];
  private alertHistory: BudgetAlert[] = [];
  private maxHistorySize: number;

  constructor(budgets: PerformanceBudget[] = DEFAULT_BUDGETS, maxHistorySize = 100) {
    this.maxHistorySize = maxHistorySize;
    for (const budget of budgets) {
      this.budgets.set(budget.metric, budget);
    }
  }

  /**
   * Register a callback to fire when a budget is exceeded.
   */
  public onAlert(callback: BudgetAlertCallback): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      this.alertCallbacks = this.alertCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Add or update a performance budget.
   */
  public setBudget(budget: PerformanceBudget): void {
    this.budgets.set(budget.metric, budget);
  }

  /**
   * Remove a performance budget.
   */
  public removeBudget(metric: string): boolean {
    return this.budgets.delete(metric);
  }

  /**
   * Get the budget for a given metric.
   */
  public getBudget(metric: string): PerformanceBudget | undefined {
    return this.budgets.get(metric);
  }

  /**
   * Get all configured budgets.
   */
  public getAllBudgets(): PerformanceBudget[] {
    return [...this.budgets.values()];
  }

  /**
   * Check a metric value against its budget. Fires alerts if thresholds exceeded.
   * Returns the alert if one was generated, or null if within budget.
   */
  public checkMetric(metric: string, value: number): BudgetAlert | null {
    const budget = this.budgets.get(metric);
    if (!budget) return null;

    let severity: AlertSeverity | null = null;
    let threshold = 0;

    if (value > budget.criticalThreshold) {
      severity = 'critical';
      threshold = budget.criticalThreshold;
    } else if (value > budget.warningThreshold) {
      severity = 'warning';
      threshold = budget.warningThreshold;
    }

    if (severity === null) return null;

    const alert: BudgetAlert = {
      metric,
      severity,
      actualValue: value,
      threshold,
      timestamp: Date.now(),
      description: budget.description,
    };

    this.recordAlert(alert);
    this.emitAlert(alert);

    return alert;
  }

  /**
   * Get the alert history (most recent first).
   */
  public getAlertHistory(): BudgetAlert[] {
    return [...this.alertHistory];
  }

  /**
   * Clear alert history.
   */
  public clearHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Check if a metric is within its budget.
   */
  public isWithinBudget(metric: string, value: number): boolean {
    const budget = this.budgets.get(metric);
    if (!budget) return true; // No budget = no restriction
    return value <= budget.warningThreshold;
  }

  /**
   * Get a summary of current budget statuses given a map of metric values.
   */
  public getSummary(
    metricValues: Record<string, number>
  ): Array<{ metric: string; value: number; status: 'good' | 'warning' | 'critical' }> {
    const results: Array<{ metric: string; value: number; status: 'good' | 'warning' | 'critical' }> = [];

    for (const [metric, value] of Object.entries(metricValues)) {
      const budget = this.budgets.get(metric);
      if (!budget) {
        results.push({ metric, value, status: 'good' });
        continue;
      }

      let status: 'good' | 'warning' | 'critical';
      if (value > budget.criticalThreshold) {
        status = 'critical';
      } else if (value > budget.warningThreshold) {
        status = 'warning';
      } else {
        status = 'good';
      }

      results.push({ metric, value, status });
    }

    return results;
  }

  private recordAlert(alert: BudgetAlert): void {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistorySize);
    }
  }

  private emitAlert(alert: BudgetAlert): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch {
        // Don't let callback errors break the alert pipeline
      }
    }
  }
}

/** Singleton budget monitor with default budgets. */
export const performanceBudgets = new PerformanceBudgetMonitor();
