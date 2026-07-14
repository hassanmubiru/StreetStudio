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
