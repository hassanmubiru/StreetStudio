/**
 * Content Hierarchy Service (`packages/media`).
 *
 * Implements the design's "Content Hierarchy Service" section and Requirement
 * 5: Projects, Folders, and Workspaces. The service organizes recorded content
 * into a tenant-scoped hierarchy and relocates Videos without disturbing their
 * associations:
 *
 *  - {@link ContentService.createProject} creates a Project scoped to an
 *    Organization when the actor holds create permission and the name is 1–255
 *    characters (R5.1, R5.6, R5.8).
 *  - {@link ContentService.createFolder} creates a Folder scoped to a Project
 *    (optionally nested under a parent Folder) under the same create-permission
 *    gate and name bounds, and enforces a maximum nesting depth of 10 Folder
 *    levels (R5.2, R5.3, R5.6, R5.8).
 *  - {@link ContentService.moveVideo} relocates a Video to a Folder within the
 *    same Organization, preserving its identity, comments, transcripts, and
 *    permissions; a move that would cross an Organization boundary is rejected
 *    and the Video's location is left unchanged (R5.4, R5.7).
 *  - {@link ContentService.createWorkspace} creates a Workspace as a scope for
 *    real-time presence and events (R5.5).
 *
 * Authorization is delegated to the RBAC {@link AccessControl} evaluator from
 * `@streetstudio/auth`, evaluated in the owning Organization's scope. Every
 * failure is surfaced through the shared error taxonomy (`AppError`): invalid
 * names raise `VALIDATION_FAILED`, missing create permission raises
 * `AUTHORIZATION_DENIED`, and unknown/out-of-scope targets raise `NOT_FOUND`.
 *
 * Persistence is reached only through the narrow {@link ContentStore} port, so
 * the service is decoupled from the concrete database layer and unit-testable
 * with in-memory fakes. The default adapter ({@link repositoryContentStore}) is
 * backed by the tenant-scoped Project/Workspace/Video repositories and the
 * Folder repository exposed by `@streetstudio/database`.
 */
import { newUuid } from "@streetstudio/database";
import type {
  FolderRecord,
  ProjectRecord,
  VideoRecord,
  WorkspaceRecord,
  Repositories,
} from "@streetstudio/database";
import { systemClock, toIsoTimestamp, type Clock } from "@streetstudio/auth";
import type { AccessControl } from "@streetstudio/auth";
import type { AuthContext } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type {
  FolderDto,
  ProjectDto,
  Uuid,
  VideoDto,
  WorkspaceDto,
} from "@streetstudio/shared";

/** Minimum length of a Project, Folder, or Workspace name (R5.1, R5.2, R5.8). */
export const NAME_MIN_LENGTH = 1;

/** Maximum length of a Project, Folder, or Workspace name (R5.1, R5.2, R5.8). */
export const NAME_MAX_LENGTH = 255;

/**
 * Maximum number of nested Folder levels (R5.3). Folder depth is 0-based, so a
 * root-level Folder has depth 0 and the deepest permitted Folder has depth
 * {@link MAX_FOLDER_NESTING_DEPTH} − 1 (level 10). Creating a Folder whose depth
 * would reach {@link MAX_FOLDER_NESTING_DEPTH} is rejected.
 */
export const MAX_FOLDER_NESTING_DEPTH = 10;

/**
 * Permission a Role must grant to create a Project within an Organization
 * (R5.6). Evaluated by {@link AccessControl.can} in the owning Organization's
 * scope.
 */
export const CREATE_PROJECT_PERMISSION = "content:create_project";

/** Permission to read Projects/Folders within an Organization. */
export const READ_PROJECT_PERMISSION = "content:read_project";

/** Permission to rename/update a Project. */
export const UPDATE_PROJECT_PERMISSION = "content:update_project";

/** Permission to delete a Project. */
export const DELETE_PROJECT_PERMISSION = "content:delete_project";

/**
 * Permission a Role must grant to create a Folder within a Project (R5.6).
 * Evaluated in the owning Organization's scope.
 */
export const CREATE_FOLDER_PERMISSION = "content:create_folder";

/** Permission to read Folders. */
export const READ_FOLDER_PERMISSION = "content:read_folder";

/** Permission to delete a Folder. */
export const DELETE_FOLDER_PERMISSION = "content:delete_folder";

/** Permission to read Videos. */
export const READ_VIDEO_PERMISSION = "content:read_video";

/** Permission to update a Video (rename / move). */
export const UPDATE_VIDEO_PERMISSION = "content:update_video";

/** Permission to delete a Video. */
export const DELETE_VIDEO_PERMISSION = "content:delete_video";

/**
 * A reference to a location within the content hierarchy.
 *
 * For {@link ContentService.createFolder} it addresses the parent location: the
 * `projectId` the new Folder belongs to and, optionally, the `folderId` of the
 * parent Folder (omitted for a Folder created directly under the Project).
 *
 * For {@link ContentService.moveVideo} it addresses the destination: the
 * `folderId` the Video is moved into (omitted to move the Video to the
 * Project root). `organizationId` names the Organization that owns the target,
 * and is the scope in which same-organization membership is enforced.
 */
export interface FolderRef {
  /** The Organization that owns the target Project/Folder. */
  readonly organizationId: Uuid;
  /** The Project the target belongs to. */
  readonly projectId: Uuid;
  /** Parent (create) or destination (move) Folder; omitted addresses the Project root. */
  readonly folderId?: Uuid;
}

/**
 * Persistence port for the content hierarchy. Deliberately narrow: the service
 * inserts Projects/Workspaces/Folders, resolves a Project or Folder for
 * scoping, resolves a Video within an Organization for same-organization moves,
 * and repoints a Video at a new Folder.
 */
export interface ContentStore {
  /** Persist a new Project and return it. */
  insertProject(record: ProjectRecord): Promise<ProjectRecord>;
  /** Persist a new Workspace and return it. */
  insertWorkspace(record: WorkspaceRecord): Promise<WorkspaceRecord>;
  /** Persist a new Folder and return it. */
  insertFolder(record: FolderRecord): Promise<FolderRecord>;
  /** Find a Project by id within an Organization, or null when absent. */
  findProject(
    organizationId: Uuid,
    projectId: Uuid,
  ): Promise<ProjectRecord | null>;
  /** List every Project in an Organization (tenant-scoped). */
  listProjects(organizationId: Uuid): Promise<ProjectRecord[]>;
  /** Persist an updated Project (same id), returning the updated record. */
  updateProject(record: ProjectRecord): Promise<ProjectRecord>;
  /** Delete a Project by id within its Organization. */
  deleteProject(organizationId: Uuid, projectId: Uuid): Promise<void>;
  /** Find a Folder by id, or null when absent. */
  findFolder(folderId: Uuid): Promise<FolderRecord | null>;
  /** List every Folder in a Project. */
  listFoldersByProject(projectId: Uuid): Promise<FolderRecord[]>;
  /** Delete a Folder by id. */
  deleteFolder(folderId: Uuid): Promise<void>;
  /** Find a Video by id within an Organization, or null when absent. */
  findVideo(
    organizationId: Uuid,
    videoId: Uuid,
  ): Promise<VideoRecord | null>;
  /**
   * Move `video` into `folderId` (or the Project root when null), preserving
   * the Video's identity and every other field, and return the updated record.
   */
  updateVideoFolder(
    video: VideoRecord,
    folderId: Uuid | null,
  ): Promise<VideoRecord>;
}

/** Dependencies required to construct a {@link ContentService}. */
export interface ContentServiceDeps {
  /** Content persistence port. */
  readonly store: ContentStore;
  /** RBAC evaluator used to gate create operations (R5.6). */
  readonly access: AccessControl;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

function isValidName(name: string): boolean {
  return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH;
}

/**
 * The Content Hierarchy Service. See the module doc for the exact semantics of
 * each operation.
 */
export class ContentService {
  private readonly store: ContentStore;
  private readonly access: AccessControl;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: ContentServiceDeps) {
    this.store = deps.store;
    this.access = deps.access;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Create a Project scoped to `orgId`. The name must be 1–255 characters
   * (R5.1, R5.8) and the actor must hold create permission in the Organization
   * (R5.6); otherwise no Project is created.
   */
  async createProject(
    actor: AuthContext,
    orgId: Uuid,
    name: string,
  ): Promise<ProjectDto> {
    if (!isValidName(name)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const permitted = await this.access.can(actor, CREATE_PROJECT_PERMISSION, {
      organizationId: orgId,
      type: "project",
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    const record: ProjectRecord = {
      id: this.newId(),
      organizationId: orgId,
      name,
      createdAt: this.nowIso(),
    };
    const created = await this.store.insertProject(record);
    return this.toProjectDto(created);
  }

  /**
   * List the Projects in `orgId`. The actor must hold read permission in the
   * Organization; otherwise no Projects are returned (deny-by-default).
   */
  async listProjects(actor: AuthContext, orgId: Uuid): Promise<ProjectDto[]> {
    await this.requireProjectPermission(actor, orgId, READ_PROJECT_PERMISSION);
    const records = await this.store.listProjects(orgId);
    return records.map((r) => this.toProjectDto(r));
  }

  /**
   * Get a single Project by id within `orgId`. Requires read permission; an
   * absent Project (or one in another Organization) is `NOT_FOUND`.
   */
  async getProject(
    actor: AuthContext,
    orgId: Uuid,
    projectId: Uuid,
  ): Promise<ProjectDto> {
    await this.requireProjectPermission(actor, orgId, READ_PROJECT_PERMISSION);
    const record = await this.store.findProject(orgId, projectId);
    if (!record) {
      throw new AppError("NOT_FOUND");
    }
    return this.toProjectDto(record);
  }

  /**
   * Rename a Project. Requires update permission and a valid name (1–255);
   * an absent Project is `NOT_FOUND` and nothing changes.
   */
  async updateProject(
    actor: AuthContext,
    orgId: Uuid,
    projectId: Uuid,
    name: string,
  ): Promise<ProjectDto> {
    await this.requireProjectPermission(actor, orgId, UPDATE_PROJECT_PERMISSION);
    if (!isValidName(name)) {
      throw new AppError("VALIDATION_FAILED");
    }
    const record = await this.store.findProject(orgId, projectId);
    if (!record) {
      throw new AppError("NOT_FOUND");
    }
    const updated = await this.store.updateProject({ ...record, name });
    return this.toProjectDto(updated);
  }

  /**
   * Delete a Project. Requires delete permission; an absent Project is
   * `NOT_FOUND`.
   */
  async deleteProject(
    actor: AuthContext,
    orgId: Uuid,
    projectId: Uuid,
  ): Promise<void> {
    await this.requireProjectPermission(actor, orgId, DELETE_PROJECT_PERMISSION);
    const record = await this.store.findProject(orgId, projectId);
    if (!record) {
      throw new AppError("NOT_FOUND");
    }
    await this.store.deleteProject(orgId, projectId);
  }

  /** Deny-by-default permission gate scoped to the owning Organization. */
  private async requireProjectPermission(
    actor: AuthContext,
    orgId: Uuid,
    permission: string,
  ): Promise<void> {
    const permitted = await this.access.can(actor, permission, {
      organizationId: orgId,
      type: "project",
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }

  /**
   * Get a Folder by id within `orgId`. Requires read permission; a Folder whose
   * Project is not in `orgId` (or is absent) is `NOT_FOUND` — no cross-org
   * disclosure.
   */
  async getFolder(
    actor: AuthContext,
    orgId: Uuid,
    folderId: Uuid,
  ): Promise<FolderDto> {
    await this.requireProjectPermission(actor, orgId, READ_FOLDER_PERMISSION);
    const folder = await this.store.findFolder(folderId);
    if (!folder) {
      throw new AppError("NOT_FOUND");
    }
    // Verify the Folder's Project belongs to the caller's Organization.
    const project = await this.store.findProject(orgId, folder.projectId);
    if (!project) {
      throw new AppError("NOT_FOUND");
    }
    return this.toFolderDto(folder);
  }

  /**
   * List the Folders in `projectId` within `orgId`. Requires read permission
   * and that the Project belongs to the Organization.
   */
  async listFolders(
    actor: AuthContext,
    orgId: Uuid,
    projectId: Uuid,
  ): Promise<FolderDto[]> {
    await this.requireProjectPermission(actor, orgId, READ_FOLDER_PERMISSION);
    const project = await this.store.findProject(orgId, projectId);
    if (!project) {
      throw new AppError("NOT_FOUND");
    }
    const folders = await this.store.listFoldersByProject(projectId);
    return folders.map((f) => this.toFolderDto(f));
  }

  /**
   * Delete a Folder within `orgId`. Requires delete permission; a Folder whose
   * Project is not in `orgId` (or is absent) is `NOT_FOUND`.
   */
  async deleteFolder(
    actor: AuthContext,
    orgId: Uuid,
    folderId: Uuid,
  ): Promise<void> {
    await this.requireProjectPermission(actor, orgId, DELETE_FOLDER_PERMISSION);
    const folder = await this.store.findFolder(folderId);
    if (!folder) {
      throw new AppError("NOT_FOUND");
    }
    const project = await this.store.findProject(orgId, folder.projectId);
    if (!project) {
      throw new AppError("NOT_FOUND");
    }
    await this.store.deleteFolder(folderId);
  }

  /**
   * Create a Folder scoped to `parent.projectId`, optionally nested under
   * `parent.folderId`. The name must be 1–255 characters (R5.2, R5.8), the
   * actor must hold create permission in the owning Organization (R5.6), the
   * Project (and parent Folder, when given) must exist within that Organization,
   * and the resulting nesting depth must not reach {@link MAX_FOLDER_NESTING_DEPTH}
   * (R5.3). No Folder is created when any check fails.
   */
  async createFolder(
    actor: AuthContext,
    parent: FolderRef,
    name: string,
  ): Promise<FolderDto> {
    if (!isValidName(name)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const permitted = await this.access.can(actor, CREATE_FOLDER_PERMISSION, {
      organizationId: parent.organizationId,
      type: "folder",
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    // The Project must exist within the owning Organization (scoping, R5.2).
    const project = await this.store.findProject(
      parent.organizationId,
      parent.projectId,
    );
    if (!project) {
      throw new AppError("NOT_FOUND");
    }

    let depth = 0;
    let parentFolderId: Uuid | null = null;
    if (parent.folderId) {
      const parentFolder = await this.store.findFolder(parent.folderId);
      // The parent Folder must exist and belong to the same Project.
      if (!parentFolder || parentFolder.projectId !== parent.projectId) {
        throw new AppError("NOT_FOUND");
      }
      depth = parentFolder.depth + 1;
      // R5.3 — cap nesting at 10 Folder levels (depths 0..9).
      if (depth >= MAX_FOLDER_NESTING_DEPTH) {
        throw new AppError("VALIDATION_FAILED");
      }
      parentFolderId = parentFolder.id;
    }

    const record: FolderRecord = {
      id: this.newId(),
      projectId: parent.projectId,
      parentFolderId,
      name,
      depth,
    };
    const created = await this.store.insertFolder(record);
    return this.toFolderDto(created);
  }

  /**
   * Create a Workspace scoped to `orgId` — a scope for real-time presence and
   * events (R5.5). The name must be 1–255 characters.
   */
  async createWorkspace(
    actor: AuthContext,
    orgId: Uuid,
    name: string,
  ): Promise<WorkspaceDto> {
    // `actor` is accepted for a uniform service signature and future gating; the
    // acceptance criteria (R5.5) impose no permission gate on Workspace creation.
    void actor;
    if (!isValidName(name)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const record: WorkspaceRecord = {
      id: this.newId(),
      organizationId: orgId,
      name,
      createdAt: this.nowIso(),
    };
    const created = await this.store.insertWorkspace(record);
    return this.toWorkspaceDto(created);
  }

  /**
   * Move a Video into `targetFolder` within the same Organization, preserving
   * the Video's identity and its associated comments, transcripts, and
   * permissions (R5.4). Because only the Video's `folderId` changes and its id
   * and `organizationId` are retained, every association keyed by the Video's id
   * is left intact.
   *
   * The move is same-Organization only: the Video is resolved within
   * `targetFolder.organizationId`, and the destination Folder's Project must
   * belong to that same Organization. A Video that does not exist in the target
   * Organization (including any cross-Organization target) is rejected with
   * `NOT_FOUND` and its current location is left unchanged (R5.7).
   */
  async moveVideo(
    actor: AuthContext,
    videoId: Uuid,
    targetFolder: FolderRef,
  ): Promise<VideoDto> {
    void actor;
    const orgId = targetFolder.organizationId;

    // Resolve the Video within the target Organization. A Video that belongs to
    // a different Organization is not found here, so a cross-organization move
    // is rejected with the location preserved (R5.7).
    const video = await this.store.findVideo(orgId, videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    let destinationFolderId: Uuid | null = null;
    if (targetFolder.folderId) {
      const folder = await this.store.findFolder(targetFolder.folderId);
      if (!folder) {
        throw new AppError("NOT_FOUND");
      }
      // The destination Folder's Project must belong to the same Organization
      // as the Video, keeping the move within one Organization (R5.4, R5.7).
      const project = await this.store.findProject(orgId, folder.projectId);
      if (!project) {
        throw new AppError("NOT_FOUND");
      }
      destinationFolderId = folder.id;
    }

    const updated = await this.store.updateVideoFolder(
      video,
      destinationFolderId,
    );
    return this.toVideoDto(updated);
  }

  /* -------------------------- internals -------------------------------- */

  private nowIso() {
    return toIsoTimestamp(this.clock.now());
  }

  private toProjectDto(record: ProjectRecord): ProjectDto {
    return {
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      createdAt: record.createdAt,
    };
  }

  private toFolderDto(record: FolderRecord): FolderDto {
    return {
      id: record.id,
      projectId: record.projectId,
      ...(record.parentFolderId !== null
        ? { parentFolderId: record.parentFolderId }
        : {}),
      name: record.name,
      depth: record.depth,
    };
  }

  private toWorkspaceDto(record: WorkspaceRecord): WorkspaceDto {
    return {
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      createdAt: record.createdAt,
    };
  }

  private toVideoDto(record: VideoRecord): VideoDto {
    return {
      id: record.id,
      organizationId: record.organizationId,
      ...(record.folderId !== null ? { folderId: record.folderId } : {}),
      title: record.title,
      durationSeconds: record.durationSeconds,
      status: record.status,
      developerMode: record.developerMode,
      createdAt: record.createdAt,
    };
  }
}

/**
 * Default {@link ContentStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Projects, Workspaces, and Videos use tenant-scoped repositories, so every
 * read/write is constrained to a single Organization. Folders use the global
 * (id-keyed) repository. Because the Video repository exposes no in-place
 * update, {@link ContentStore.updateVideoFolder} repoints a Video by deleting
 * and re-inserting it with the new `folderId`, preserving its id,
 * `organizationId`, and every other field (the same soft-update pattern used by
 * the RBAC and API-key stores).
 */
export function repositoryContentStore(
  repositories: Pick<
    Repositories,
    "projects" | "workspaces" | "folders" | "videos"
  >,
): ContentStore {
  const { projects, workspaces, folders, videos } = repositories;
  return {
    insertProject: (record) => projects.insert(record),
    insertWorkspace: (record) => workspaces.insert(record),
    insertFolder: (record) => folders.insert(record),
    findProject: (organizationId, projectId) =>
      projects.findById(organizationId, projectId),
    listProjects: (organizationId) => projects.listByOrganization(organizationId),
    updateProject: (record) => projects.update(record),
    deleteProject: (organizationId, projectId) =>
      projects.deleteById(organizationId, projectId),
    findFolder: (folderId) => folders.findById(folderId),
    async listFoldersByProject(projectId) {
      // `folders` is a GlobalRepository (folder ids are globally unique); it has
      // no project-scoped list, so filter by projectId. Callers authorize the
      // Project against the owning org first, so this discloses no other tenant.
      const all = await folders.list();
      return all.filter((f) => f.projectId === projectId);
    },
    deleteFolder: (folderId) => folders.deleteById(folderId),
    findVideo: (organizationId, videoId) =>
      videos.findById(organizationId, videoId),
    async updateVideoFolder(video, folderId) {
      await videos.deleteById(video.organizationId, video.id);
      const updated: VideoRecord = { ...video, folderId };
      await videos.insert(updated);
      return updated;
    },
  };
}
