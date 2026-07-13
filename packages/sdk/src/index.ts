/**
 * @streetstudio/sdk
 *
 * Public client library providing typed access to every public REST and
 * WebSocket interface, guaranteeing UI/API parity.
 */

export const DOMAIN =
  "Public client library for the StreetStudio REST and WebSocket API." as const;

// Typed client for the public REST + WebSocket API. `SdkClientOptions` remains
// exported from the package entry point (now additively carrying auth and
// injectable transport seams).
export { StreetStudioClient, fetchTransport } from "./client.js";

export {
  AuthResource,
  OrganizationsResource,
  ProjectsResource,
  FoldersResource,
  VideosResource,
  UploadsResource,
  CommentsResource,
  PlaybackResource,
  SearchResource,
  SharingResource,
  NotificationsResource,
  WebhooksResource,
  ApiKeysResource,
  AnalyticsResource,
} from "./client.js";

export type {
  SdkClientOptions,
  SdkAuth,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  FetchLike,
  FetchLikeResponse,
  RealtimeEvent,
  RealtimeHandlers,
  RealtimeConnection,
  RealtimeTransport,
  QueryParams,
  PlaybackManifest,
  RegisterInput,
  LoginInput,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  InviteMemberInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateFolderInput,
  MoveFolderInput,
  UpdateVideoInput,
  ListVideosQuery,
  CreateUploadInput,
  CreateCommentInput,
  ReactionInput,
  SearchQuery,
  CreateShareLinkInput,
  ResolveShareLinkInput,
  ListNotificationsQuery,
  UpdateNotificationPreferenceInput,
  CreateWebhookInput,
  CreateApiKeyInput,
  MetricsQuery,
} from "./client.js";
