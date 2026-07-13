/**
 * @streetstudio/analytics
 *
 * Public entry point for view-event recording and aggregation. All queries are
 * organization-scoped.
 */
export const DOMAIN = "View events and aggregation." as const;

// Analytics Service: view-event recording + organization-scoped aggregation.
export { AnalyticsService } from "./service.js";
export type {
  Metrics,
  TimeRange,
  AnalyticsActor,
  AnalyticsServiceDeps,
  ViewEventStore,
  VideoOrganizationResolver,
  AnalyticsAuthorizer,
  AnalyticsPermissionCheck,
} from "./service.js";
export {
  repositoryViewEventStore,
  repositoryVideoOrganizationResolver,
  permissionAnalyticsAuthorizer,
  ANALYTICS_READ_PERMISSION,
} from "./service.js";
