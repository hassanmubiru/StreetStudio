/**
 * Dashboard use-case flows: read-oriented orchestration over the SDK that the
 * UI layer will render. Each flow composes public SDK calls into the aggregate
 * a screen needs, and is transport-agnostic (testable with any
 * {@link HttpTransport}). No backend logic lives here.
 */
import type {
  CommentDto,
  FolderDto,
  NotificationDto,
  OrganizationDto,
  ProjectDto,
  SummaryDto,
  TranscriptDto,
  VideoDto,
} from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  ListNotificationsQuery,
  PlaybackManifest,
  SearchQuery,
} from "@streetstudio/sdk";
import type { DashboardSession } from "./session.js";

/** The data backing the workspace/home screen. */
export interface Workspace {
  /** Organizations the member belongs to. */
  readonly organizations: readonly OrganizationDto[];
  /** The active organization (when one is selected and present). */
  readonly activeOrganization?: OrganizationDto;
  /** Projects in the active organization (empty when no org is selected). */
  readonly projects: readonly ProjectDto[];
}

/**
 * Load the workspace overview: the member's organizations and, when an active
 * organization is selected on the session, that organization's projects.
 */
export async function loadWorkspace(session: DashboardSession): Promise<Workspace> {
  const organizations = await session.api.organizations.list();
  const activeId = session.organizationId;
  const activeOrganization = activeId
    ? organizations.find((o) => o.id === activeId)
    : undefined;
  const projects = activeId ? await session.api.projects.list() : [];
  return {
    organizations,
    ...(activeOrganization ? { activeOrganization } : {}),
    projects,
  };
}

/** The data backing a single project screen. */
export interface ProjectView {
  readonly project: ProjectDto;
  readonly folders: readonly FolderDto[];
}

/**
 * Open a project screen: the project and its folders, fetched concurrently
 * through the SDK. Videos are listed per folder via {@link listFolderVideos}
 * (the public list surface filters by folder, not project).
 */
export async function openProject(
  session: DashboardSession,
  projectId: Uuid,
): Promise<ProjectView> {
  const [project, folders] = await Promise.all([
    session.api.projects.get(projectId),
    session.api.folders.listByProject(projectId),
  ]);
  return { project, folders };
}

/** List the videos in a folder (paginated by the SDK's list query). */
export function listFolderVideos(
  session: DashboardSession,
  folderId: Uuid,
): Promise<VideoDto[]> {
  return session.api.videos.list({ folderId });
}

/** The data backing a single video screen. */
export interface VideoPage {
  readonly video: VideoDto;
  /** Comments on the video, in the order the API returned them. */
  readonly comments: readonly CommentDto[];
  /** The ABR playback manifest (renditions) for the video. */
  readonly playback: PlaybackManifest;
  /** Transcript, when one has been produced (absent until processed). */
  readonly transcript?: TranscriptDto;
  /** Provider summary, when one has been produced (absent until generated). */
  readonly summary?: SummaryDto;
}

/**
 * Resolve a promise to its value, or `undefined` if it rejects. Used for the
 * best-effort parts of a video screen (transcript/summary) that legitimately
 * may not exist yet while the video is still processing — their absence should
 * not fail the whole screen.
 */
async function optional<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch {
    return undefined;
  }
}

/**
 * Open a video screen: the video, its comments, and its playback manifest are
 * required and fetched concurrently; the transcript and summary are best-effort
 * (they may not exist until processing completes). If any required call fails,
 * the flow rejects.
 */
export async function openVideo(
  session: DashboardSession,
  videoId: Uuid,
): Promise<VideoPage> {
  const [video, comments, playback, transcript, summary] = await Promise.all([
    session.api.videos.get(videoId),
    session.api.comments.list(videoId),
    session.api.playback.manifest(videoId),
    optional(session.api.videos.transcript(videoId)),
    optional(session.api.videos.summary(videoId)),
  ]);
  return {
    video,
    comments,
    playback,
    ...(transcript ? { transcript } : {}),
    ...(summary ? { summary } : {}),
  };
}

/** A top-level comment together with its direct replies. */
export interface CommentThread {
  readonly comment: CommentDto;
  readonly replies: readonly CommentDto[];
}

/**
 * Group a flat comment list into threads: each comment without a
 * `parentCommentId` becomes a thread root, and every other comment is attached
 * as a reply to its parent. Roots preserve their input order; replies preserve
 * their input order under each root. Replies whose parent is absent from the
 * input are dropped (they belong to a thread not in view). Pure and
 * transport-agnostic — safe to call on the `comments` of a {@link VideoPage}.
 */
export function threadComments(
  comments: readonly CommentDto[],
): readonly CommentThread[] {
  const repliesByParent = new Map<Uuid, CommentDto[]>();
  const roots: CommentDto[] = [];
  for (const comment of comments) {
    if (comment.parentCommentId === undefined) {
      roots.push(comment);
    } else {
      const bucket = repliesByParent.get(comment.parentCommentId);
      if (bucket) {
        bucket.push(comment);
      } else {
        repliesByParent.set(comment.parentCommentId, [comment]);
      }
    }
  }
  return roots.map((comment) => ({
    comment,
    replies: repliesByParent.get(comment.id) ?? [],
  }));
}

/** The data backing the notification inbox. */
export interface NotificationInbox {
  readonly notifications: readonly NotificationDto[];
  /** Count of notifications not yet marked read (`readAt` absent). */
  readonly unreadCount: number;
}

/**
 * Load the notification inbox: the member's notifications and a derived count
 * of those still unread (`readAt` absent). Passes the optional query through to
 * the SDK (e.g. `{ unreadOnly: true }` or a `limit`).
 */
export async function loadNotifications(
  session: DashboardSession,
  query: ListNotificationsQuery = {},
): Promise<NotificationInbox> {
  const notifications = await session.api.notifications.list(query);
  const unreadCount = notifications.filter((n) => n.readAt === undefined).length;
  return { notifications, unreadCount };
}

/**
 * Search videos in the active organization. A blank or whitespace-only query
 * short-circuits to an empty result without a round-trip (the server also
 * rejects empty queries); otherwise the trimmed query is forwarded to the SDK.
 */
export function searchVideos(
  session: DashboardSession,
  query: string,
  options: Omit<SearchQuery, "q"> = {},
): Promise<VideoDto[]> {
  const q = query.trim();
  if (q === "") {
    return Promise.resolve([]);
  }
  return session.api.search.videos({ q, ...options });
}
