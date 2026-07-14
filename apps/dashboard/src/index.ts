/**
 * @streetstudio/dashboard
 *
 * Dashboard web application (the Web_Client SPA). This package hosts the
 * client-side application logic — session/credential/scope management and
 * use-case flows — that the UI renders. It talks to the API exclusively through
 * `@streetstudio/sdk`; there is no backend logic here.
 */
export const DOMAIN = "Dashboard web application (the Web_Client SPA)." as const;

export { DashboardSession } from "./session.js";
export type { DashboardSessionOptions } from "./session.js";

export {
  loadWorkspace,
  openProject,
  listFolderVideos,
  openVideo,
  threadComments,
  loadNotifications,
  searchVideos,
} from "./flows.js";
export type {
  Workspace,
  ProjectView,
  VideoPage,
  CommentThread,
  NotificationInbox,
} from "./flows.js";

export { UploadController, uploadProgress } from "./uploads.js";
export type { UploadProgress } from "./uploads.js";
