/**
 * @streetstudio/analytics
 *
 * Public entry point for view-event recording and aggregation. All queries are
 * organization-scoped.
 */
export const DOMAIN = "View events and aggregation." as const;

/** Aggregate playback metrics for an organization time range. */
export interface Metrics {
  readonly totalViews: number;
  readonly distinctViewers: number;
  readonly totalWatchDuration: number;
}
