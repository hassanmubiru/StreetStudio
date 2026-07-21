/**
 * Real PostgreSQL persistence for upload sessions, composing the StreetJS
 * `PgPool`. Parameterized SQL only. `received_parts` is stored as JSONB.
 */
import { PgPool } from "streetjs";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import {
  UploadSession,
  type UploadSessionProps,
  type UploadStatus,
} from "../domain/upload-session.js";

type Row = Record<string, string | null>;

function toIso(value: string | null): IsoTimestamp | undefined {
  return value === null ? undefined : (new Date(value).toISOString() as IsoTimestamp);
}

function parseParts(value: string | null): number[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
}

function mapRow(row: Row): UploadSession {
  const props: UploadSessionProps = {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    ownerId: row["owner_id"] as Uuid,
    objectKey: row["object_key"] as string,
    totalParts: Number(row["total_parts"]),
    receivedParts: parseParts(row["received_parts"]),
    status: row["status"] as UploadStatus,
    createdAt: new Date(row["created_at"] as string).toISOString() as IsoTimestamp,
    ...(toIso(row["completed_at"] ?? null) ? { completedAt: toIso(row["completed_at"] ?? null)! } : {}),
    ...(toIso(row["aborted_at"] ?? null) ? { abortedAt: toIso(row["aborted_at"] ?? null)! } : {}),
  };
  return UploadSession.fromProps(props);
}

export class UploadSessionRepository {
  constructor(private readonly pool: PgPool) {}

  async insert(session: UploadSession): Promise<void> {
    const p = session.toProps();
    await this.pool.query(
      `INSERT INTO upload_sessions
         (id, organization_id, owner_id, object_key, total_parts, received_parts, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        p.id,
        p.organizationId,
        p.ownerId,
        p.objectKey,
        p.totalParts,
        JSON.stringify(p.receivedParts),
        p.status,
        p.createdAt,
      ],
    );
  }

  async save(session: UploadSession): Promise<void> {
    const p = session.toProps();
    await this.pool.query(
      `UPDATE upload_sessions
          SET received_parts = $2::jsonb, status = $3, completed_at = $4, aborted_at = $5
        WHERE id = $1`,
      [p.id, JSON.stringify(p.receivedParts), p.status, p.completedAt ?? null, p.abortedAt ?? null],
    );
  }

  async findById(id: Uuid): Promise<UploadSession | null> {
    const { rows } = await this.pool.query(`SELECT * FROM upload_sessions WHERE id = $1`, [id]);
    const row = rows[0] as Row | undefined;
    return row ? mapRow(row) : null;
  }
}
