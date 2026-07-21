/**
 * Real PostgreSQL persistence for members over the StreetJS `PgPool`.
 * Parameterized SQL only. Detects unique-email conflicts.
 */
import { PgPool } from "streetjs";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import { Member, type MemberProps } from "../domain/member.js";

type Row = Record<string, string | null>;

function mapRow(row: Row): Member {
  const props: MemberProps = {
    id: row["id"] as Uuid,
    email: row["email"] as string,
    passwordHash: row["password_hash"] as string,
    createdAt: new Date(row["created_at"] as string).toISOString() as IsoTimestamp,
  };
  return Member.fromProps(props);
}

/** Raised when inserting a member whose email already exists. */
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A member with email ${email} already exists.`);
    this.name = "DuplicateEmailError";
  }
}

export class MemberRepository {
  constructor(private readonly pool: PgPool) {}

  /** Insert a new member. Throws {@link DuplicateEmailError} on email conflict. */
  async insert(member: Member): Promise<void> {
    const p = member.toProps();
    // Guard first (portable across drivers), then rely on the UNIQUE constraint.
    const existing = await this.findByEmail(p.email);
    if (existing) {
      throw new DuplicateEmailError(p.email);
    }
    try {
      await this.pool.query(
        `INSERT INTO members (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)`,
        [p.id, p.email, p.passwordHash, p.createdAt],
      );
    } catch (error) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
        throw new DuplicateEmailError(p.email);
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<Member | null> {
    const { rows } = await this.pool.query(`SELECT * FROM members WHERE email = $1`, [email]);
    const row = rows[0] as Row | undefined;
    return row ? mapRow(row) : null;
  }

  async findById(id: Uuid): Promise<Member | null> {
    const { rows } = await this.pool.query(`SELECT * FROM members WHERE id = $1`, [id]);
    const row = rows[0] as Row | undefined;
    return row ? mapRow(row) : null;
  }
}
