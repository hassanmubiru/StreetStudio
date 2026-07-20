/**
 * Real PostgreSQL persistence for recordings, composing the StreetJS `PgPool`.
 * All queries are parameterized ($1..$N) — no string interpolation of inputs.
 * The repository maps between DB rows and the rich {@link Recording} domain
 * model; it holds no business rules of its own.
 */
import { PgPool } from "streetjs";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import { Recording, type RecordingProps, type RecordingStatus } from "../domain/recording.js";

type Row = Record<string, string | null>;

function toIso(value: string | null): IsoTimestamp | undefined {
  return value === null ? undefined : (new Date(value).toISOString() as IsoTimestamp);
}

function mapRow(row: Row): Recording {
  const props: RecordingProps = {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    ownerId: row["owner_id"] as Uuid,
    title: row["title"] as string,
    status: row["status"] as RecordingStatus,
    createdAt: new Date(row["created_at"] as string).toISOString() as IsoTimestamp,
    ...(toIso(row["published_at"] ?? null) ? { publishedAt: toIso(row["published_at"] ?? null)! } : {}),
    ...(toIso(row["archived_at"] ?? null) ? { archivedAt: toIso(row["archived_at"] ?? null)! } : {}),
  };
  return Recording.fromProps(props);
}

/** Data access for {@link Recording} aggregates over a StreetJS `PgPool`. */
export class RecordingRepository {
  constructor(private readonly pool: PgPool) {}

  /** Insert a new recording. */
  async insert(recording: Recording): Promise<void> {
    const p = recording.toProps();
    await this.pool.query(
      `INSERT INTO recordings
         (id, organization_id, owner_id, title, status, created_at, published_at, archived_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        p.id,
        p.organizationId,
        p.ownerId,
        p.title,
        p.status,
        p.createdAt,
        p.publishedAt ?? null,
        p.archivedAt ?? null,
      ],
    );
  }

  /** Persist a status transition (publish/archive) for an existing recording. */
  async save(recording: Recording): Promise<void> {
    const p = recording.toProps();
    await this.pool.query(
      `UPDATE recordings
          SET title = $2, status = $3, published_at = $4, archived_at = $5
        WHERE id = $1`,
      [p.id, p.title, p.status, p.publishedAt ?? null, p.archivedAt ?? null],
    );
  }

  /** Find a recording by id, or `null` if it does not exist. */
  async findById(id: Uuid): Promise<Recording | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM recordings WHERE id = $1`,
      [id],
    );
    const row = rows[0] as Row | undefined;
    return row ? mapRow(row) : null;
  }

  /** List recordings in an organization, newest first, bounded by `limit`. */
  async listByOrganization(
    organizationId: Uuid,
    limit = 50,
    offset = 0,
  ): Promise<Recording[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safeOffset = Math.max(0, offset);
    const { rows } = await this.pool.query(
      `SELECT * FROM recordings
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [organizationId, safeLimit, safeOffset],
    );
    return (rows as Row[]).map(mapRow);
  }
}
