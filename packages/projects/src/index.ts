/**
 * @streetstudio/projects
 *
 * The content hierarchy: projects, folders, and workspaces, with create/move
 * permission enforcement and folder-nesting bounds.
 */
export const DOMAIN = "Content hierarchy: projects, folders, and workspaces." as const;

export {
  ContentService,
  repositoryContentStore,
  CREATE_PROJECT_PERMISSION,
  CREATE_FOLDER_PERMISSION,
  MAX_FOLDER_NESTING_DEPTH,
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
} from "./content.js";
export type {
  ContentServiceDeps,
  ContentStore,
  FolderRef,
} from "./content.js";

// Real PostgreSQL store adapter (de-seam onto real infrastructure).
export {
  ensureContentSchema,
  postgresContentStore,
  CONTENT_TABLES_DDL,
} from "./postgres-content-store.js";
