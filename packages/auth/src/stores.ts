/**
 * Persistence ports for authentication and their default adapters over the
 * `@streetstudio/database` repositories.
 *
 * The {@link AuthService} core depends only on the narrow {@link MemberStore}
 * and {@link SessionStore} ports, which keeps it decoupled from the concrete
 * persistence layer and trivially unit-testable with in-memory fakes. The
 * default production adapters ({@link repositoryMemberStore},
 * {@link repositorySessionStore}) are backed by the Member and Session
 * repositories exposed by `@streetstudio/database`.
 */
import type {
  MemberRecord,
  Repositories,
  SessionRecord,
} from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";

/** Normalize an email for storage and lookup (case-insensitive, trimmed). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Read/write access to member accounts required by authentication. */
export interface MemberStore {
  /** Find a member by (normalized) email, or null when none exists. */
  findByEmail(email: string): Promise<MemberRecord | null>;
  /** Find a member by id, or null when none exists. */
  findById(id: Uuid): Promise<MemberRecord | null>;
  /** Persist a new member record and return it. */
  create(record: MemberRecord): Promise<MemberRecord>;
}

/** Read/write access to sessions required by authentication. */
export interface SessionStore {
  /** Persist a new session record and return it. */
  create(record: SessionRecord): Promise<SessionRecord>;
  /** Find a session by id, or null when none exists. */
  findById(id: Uuid): Promise<SessionRecord | null>;
  /**
   * Invalidate the session with `id`, if present. Idempotent: invalidating an
   * unknown or already-invalid session is a no-op.
   */
  invalidate(id: Uuid): Promise<void>;
}

/** The pair of stores the {@link AuthService} needs. */
export interface AuthStores {
  readonly members: MemberStore;
  readonly sessions: SessionStore;
}

/**
 * A {@link MemberStore} backed by the Member repository.
 *
 * The repository exposes id-keyed reads/writes but no email lookup, so
 * {@link MemberStore.findByEmail} scans the (small, admin-scale) member set and
 * matches on the normalized email. A dedicated indexed lookup on the repository
 * can replace the scan without changing this port.
 */
export function repositoryMemberStore(
  repositories: Pick<Repositories, "members">,
): MemberStore {
  const { members } = repositories;
  return {
    async findByEmail(email: string): Promise<MemberRecord | null> {
      const normalized = normalizeEmail(email);
      const all = await members.list();
      return all.find((m) => normalizeEmail(m.email) === normalized) ?? null;
    },
    findById(id: Uuid): Promise<MemberRecord | null> {
      return members.findById(id);
    },
    create(record: MemberRecord): Promise<MemberRecord> {
      return members.insert(record);
    },
  };
}

/**
 * A {@link SessionStore} backed by the Session repository. Invalidation removes
 * the session row so that {@link SessionStore.findById} returns null and access
 * is rejected (Requirement 3.4).
 */
export function repositorySessionStore(
  repositories: Pick<Repositories, "sessions">,
): SessionStore {
  const { sessions } = repositories;
  return {
    create(record: SessionRecord): Promise<SessionRecord> {
      return sessions.insert(record);
    },
    findById(id: Uuid): Promise<SessionRecord | null> {
      return sessions.findById(id);
    },
    invalidate(id: Uuid): Promise<void> {
      return sessions.deleteById(id);
    },
  };
}

/** Build both default repository-backed stores from a repository set. */
export function repositoryAuthStores(
  repositories: Pick<Repositories, "members" | "sessions">,
): AuthStores {
  return {
    members: repositoryMemberStore(repositories),
    sessions: repositorySessionStore(repositories),
  };
}
