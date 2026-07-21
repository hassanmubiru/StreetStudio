/**
 * Real PostgreSQL adapter for the {@link ContentStore} port, composing the
 * StreetJS `PgPool` (de-seam onto real infrastructure). Satisfies the same port
 * the in-memory/repository adapter does, so {@link ContentService} runs
 * unchanged on real data. All queries are parameterized; DDL is idempotent.
 */
import { PgPool } from "streetjs";
import type {
  FolderRecord,
  ProjectRecord,
  VideoRecord,
  WorkspaceRecord,
} from "@streetstudio/database";
import type { IsoTimestamp, Uuid, VideoStatus } from "@streetstudio/shared";
import type { ContentStore } from "./content.js";

type Row = Record<string, string | null>;
const iso = (v: string): IsoTimestamp => new Date(v).toISOString() as IsoTimestamp;

export const CONTENT_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY,
  organization_id UUID        NOT NULL,
  name            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
  id              UUID PRIMARY KEY,
  organization_id UUID        NOT NULL,
  name            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id               UUID PRIMARY KEY,
  project_id       UUID    NOT NULL,
  parent_folder_id UUID,
  name             TEXT    NOT NULL,
  depth            INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS videos (
  id                UUID PRIMARY KEY,
  organization_id   UUID        NOT NULL,
  folder_id         UUID,
  title             TEXT        NOT NULL,
  duration_seconds  INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL,
  source_object_key TEXT,
  developer_mode    BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_org_idx ON videos (organization_id);
`;

/** Create the content hierarchy schema (projects, workspaces, folders, videos). */
export async function ensureContentSchema(pool: PgPool): Promise<void> {
  await pool.query(CONTENT_TABLES_DDL);
}

function mapProject(row: Row): ProjectRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    name: row["name"] as string,
    createdAt: iso(row["created_at"] as string),
  };
}
function mapWorkspace(row: Row): WorkspaceRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    name: row["name"] as string,
    createdAt: iso(row["created_at"] as string),
  };
}
function mapFolder(row: Row): FolderRecord {
  return {
    id: row["id"] as Uuid,
    projectId: row["project_id"] as Uuid,
    parentFolderId: (row["parent_folder_id"] as Uuid | null) ?? null,
    name: row["name"] as string,
    depth: Number(row["depth"]),
  };
}
function mapVideo(row: Row): VideoRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    folderId: (row["folder_id"] as Uuid | null) ?? null,
    title: row["title"] as string,
    durationSeconds: Number(row["duration_seconds"]),
    status: row["status"] as VideoStatus,
    sourceObjectKey: (row["source_object_key"] as string | null) ?? null,
    developerMode: row["developer_mode"] === "t" || row["developer_mode"] === "true",
    createdAt: iso(row["created_at"] as string),
  };
}

/** A {@link ContentStore} backed by real PostgreSQL. */
export function postgresContentStore(pool: PgPool): ContentStore {
  const one = async (sql: string, params: unknown[]): Promise<Row | undefined> => {
    const { rows } = await pool.query(sql, params);
    return rows[0] as Row | undefined;
  };
  return {
    async insertProject(record) {
      await pool.query(
        `INSERT INTO projects (id, organization_id, name, created_at) VALUES ($1, $2, $3, $4)`,
        [record.id, record.organizationId, record.name, record.createdAt],
      );
      return record;
    },
    async insertWorkspace(record) {
      await pool.query(
        `INSERT INTO workspaces (id, organization_id, name, created_at) VALUES ($1, $2, $3, $4)`,
        [record.id, record.organizationId, record.name, record.createdAt],
      );
      return record;
    },
    async insertFolder(record) {
      await pool.query(
        `INSERT INTO folders (id, project_id, parent_folder_id, name, depth) VALUES ($1, $2, $3, $4, $5)`,
        [record.id, record.projectId, record.parentFolderId, record.name, record.depth],
      );
      return record;
    },
    async findProject(organizationId, projectId) {
      const row = await one(`SELECT * FROM projects WHERE organization_id = $1 AND id = $2`, [organizationId, projectId]);
      return row ? mapProject(row) : null;
    },
    async findFolder(folderId) {
      const row = await one(`SELECT * FROM folders WHERE id = $1`, [folderId]);
      return row ? mapFolder(row) : null;
    },
    async findVideo(organizationId, videoId) {
      const row = await one(`SELECT * FROM videos WHERE organization_id = $1 AND id = $2`, [organizationId, videoId]);
      return row ? mapVideo(row) : null;
    },
    async updateVideoFolder(video, folderId) {
      await pool.query(`UPDATE videos SET folder_id = $2 WHERE id = $1`, [video.id, folderId]);
      return { ...video, folderId };
    },
  };
}
