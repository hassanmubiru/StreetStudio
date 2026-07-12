/**
 * API Key Service.
 *
 * Owns the lifecycle of programmatic-access credentials described in the
 * design's "API Key Service" section and Requirement 18:
 *
 *  - {@link ApiKeyService.create} generates a key whose plaintext secret is
 *    returned exactly once, in the creation response; only a salted hash of the
 *    secret is persisted, so it is never retrievable afterward (R18.1, R18.2).
 *  - {@link ApiKeyService.getMeta} returns metadata only — the shape it returns
 *    ({@link ApiKeyDto}) has no secret field, so the secret can never leak
 *    through a read (R18.2).
 *  - {@link ApiKeyService.authenticate} accepts only a valid, non-revoked,
 *    non-expired key and resolves the key's organization scope and permissions;
 *    a malformed, unrecognized, expired, or revoked key is denied with the
 *    uniform, non-disclosing `AUTHENTICATION_FAILED` error and creates no
 *    session (R18.3, R18.5).
 *  - {@link ApiKeyService.revoke} revokes a key so every subsequent
 *    authentication is denied (R18.4).
 *  - {@link ApiKeyService.create} and {@link ApiKeyService.revoke} are
 *    permission-gated: a caller lacking API-management permission is denied with
 *    `AUTHORIZATION_DENIED` and no API key is created or changed (R18.6).
 *
 * Extension seams (kept narrow and injectable so no concrete vendor/evaluator is
 * hardcoded in this module):
 *
 *  - {@link ApiKeyStore} — persistence port, defaulted to a repository adapter
 *    over `@streetstudio/database` (see {@link repositoryApiKeyStore}).
 *  - {@link SecretHasher} — one-way salted hashing of secrets, defaulted to
 *    {@link Sha256SecretHasher}. API-key secrets are high-entropy random tokens,
 *    so a salted SHA-256 is sufficient and fast enough to run on every request.
 *  - {@link ApiKeyAuthorizer} — the permission-check seam for create/revoke.
 *    RBAC (task 8.1) may land concurrently, so this depends on a narrow
 *    interface rather than the concrete `AccessControl` evaluator.
 *
 * Note on the presented secret: it embeds the owning organization id and key id
 * alongside the random secret so {@link ApiKeyService.authenticate} can locate
 * the tenant-scoped record without a cross-organization scan. Security rests on
 * the random secret, which is verified against its salted hash; the embedded
 * ids are not sensitive.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { newUuid } from "@streetstudio/database";
import type { ApiKeyRecord, Repositories } from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type {
  ApiKeyDto,
  ApiKeyRevealDto,
  IsoTimestamp,
  Uuid,
} from "@streetstudio/shared";
import { systemClock, type Clock } from "./clock.js";
import { toIsoTimestamp } from "./tokens.js";

/** Maximum permitted API-key name length (Requirement 18.1). */
export const MAX_API_KEY_NAME_LENGTH = 255;

/** Prefix on every presented secret, used as a cheap malformed-input guard. */
const SECRET_PREFIX = "ssk";

/** Number of random bytes in the secret component (256 bits of entropy). */
const SECRET_BYTES = 32;

/**
 * The principal established by authenticating an API key.
 *
 * An API key is not a Member, so this is a dedicated context rather than the
 * member/session {@link import("./service.js").AuthContext}: it carries the
 * key's id, the organization it is scoped to, and the permissions the request
 * is authorized with (Requirement 18.3).
 */
export interface ApiKeyAuthContext {
  readonly apiKeyId: Uuid;
  readonly organizationId: Uuid;
  readonly permissions: readonly string[];
}

/**
 * One-way, salted hashing of API-key secrets. Kept behind a port so the
 * hashing scheme is swappable and tests can substitute a deterministic hasher.
 */
export interface SecretHasher {
  /** Produce an opaque, salted, non-reversible hash of `secret`. */
  hash(secret: string): string;
  /** True iff `secret` matches the previously produced `stored` hash. */
  verify(stored: string, secret: string): boolean;
}

/**
 * Permission-check seam for API-key management (Requirement 18.6). RBAC (task
 * 8.1) implements this against the deny-by-default evaluator; this module only
 * depends on the narrow question "may this actor manage API keys in this org?".
 */
export interface ApiKeyAuthorizer {
  /** True iff `actor` may create/revoke API keys within `organizationId`. */
  canManageApiKeys(actor: Uuid, organizationId: Uuid): Promise<boolean>;
}

/**
 * Persistence port for API keys. Narrow by design: the service reads a key by
 * its owning organization and id, creates keys, and marks them revoked.
 */
export interface ApiKeyStore {
  /** Persist a new API-key record and return it. */
  create(record: ApiKeyRecord): Promise<ApiKeyRecord>;
  /** Find a key by id, scoped to its organization, or null when absent. */
  findById(organizationId: Uuid, keyId: Uuid): Promise<ApiKeyRecord | null>;
  /**
   * Mark `record` revoked as of `revokedAt`, retaining its metadata. Idempotent
   * with respect to an already-revoked key.
   */
  markRevoked(record: ApiKeyRecord, revokedAt: IsoTimestamp): Promise<void>;
}

/** Dependencies required to construct an {@link ApiKeyService}. */
export interface ApiKeyServiceDeps {
  /** API-key persistence port. */
  readonly store: ApiKeyStore;
  /** Secret hasher; defaults to {@link Sha256SecretHasher}. */
  readonly secretHasher?: SecretHasher;
  /**
   * Permission-check seam for create/revoke. When omitted, management
   * operations are permitted (suitable for trusted/system callers and tests);
   * production wiring supplies the RBAC-backed authorizer.
   */
  readonly authorizer?: ApiKeyAuthorizer;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
  /** Random-secret generator; defaults to a 256-bit CSPRNG token. */
  readonly generateSecret?: () => string;
}

/**
 * Default {@link SecretHasher}: a random per-secret salt combined with the
 * secret under SHA-256. The stored form is `"<saltHex>:<digestHex>"`; the salt
 * is not itself secret. Verification is constant-time.
 */
export class Sha256SecretHasher implements SecretHasher {
  private static readonly SALT_BYTES = 16;

  hash(secret: string): string {
    const salt = randomBytes(Sha256SecretHasher.SALT_BYTES);
    return `${salt.toString("hex")}:${Sha256SecretHasher.digest(salt, secret)}`;
  }

  verify(stored: string, secret: string): boolean {
    const sep = stored.indexOf(":");
    if (sep <= 0) return false;
    const saltHex = stored.slice(0, sep);
    const expectedHex = stored.slice(sep + 1);
    let salt: Buffer;
    try {
      salt = Buffer.from(saltHex, "hex");
    } catch {
      return false;
    }
    const actualHex = Sha256SecretHasher.digest(salt, secret);
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private static digest(salt: Buffer, secret: string): string {
    return createHash("sha256")
      .update(salt)
      .update(Buffer.from(secret, "utf8"))
      .digest("hex");
  }
}

/** Generate a URL-safe, 256-bit random secret component. */
function defaultGenerateSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/** The parsed components of a presented API-key secret. */
interface ParsedSecret {
  readonly organizationId: Uuid;
  readonly keyId: Uuid;
  readonly raw: string;
}

export class ApiKeyService {
  private readonly store: ApiKeyStore;
  private readonly secretHasher: SecretHasher;
  private readonly authorizer: ApiKeyAuthorizer | undefined;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;
  private readonly generateSecret: () => string;

  constructor(deps: ApiKeyServiceDeps) {
    this.store = deps.store;
    this.secretHasher = deps.secretHasher ?? new Sha256SecretHasher();
    this.authorizer = deps.authorizer;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
    this.generateSecret = deps.generateSecret ?? defaultGenerateSecret;
  }

  /**
   * Create an API key in `organizationId` on behalf of `actor`. Requires
   * API-management permission; a caller without it is denied and no key is
   * created (R18.6). The plaintext secret is returned in the reveal exactly
   * once — only its salted hash is stored (R18.1, R18.2).
   *
   * @param permissions Permissions the key authorizes requests with (R18.3).
   */
  async create(
    organizationId: Uuid,
    actor: Uuid,
    name: string,
    permissions: readonly string[] = [],
  ): Promise<ApiKeyRevealDto> {
    if (name.length < 1 || name.length > MAX_API_KEY_NAME_LENGTH) {
      throw new AppError("VALIDATION_FAILED");
    }
    await this.requireManagePermission(actor, organizationId);

    const keyId = this.newId();
    const raw = this.generateSecret();
    const record: ApiKeyRecord = {
      id: keyId,
      organizationId,
      name,
      secretHash: this.secretHasher.hash(raw),
      permissions: [...permissions],
      createdAt: toIsoTimestamp(this.clock.now()),
      revokedAt: null,
    };
    const created = await this.store.create(record);

    return {
      apiKey: toApiKeyDto(created),
      secret: formatSecret(organizationId, keyId, raw),
    };
  }

  /**
   * Return metadata for an existing key. The returned {@link ApiKeyDto} has no
   * secret field, so the secret is never disclosed through a read (R18.2). An
   * unknown key is reported as `NOT_FOUND`.
   */
  async getMeta(organizationId: Uuid, keyId: Uuid): Promise<ApiKeyDto> {
    const record = await this.store.findById(organizationId, keyId);
    if (!record) {
      throw new AppError("NOT_FOUND");
    }
    return toApiKeyDto(record);
  }

  /**
   * Authenticate a presented secret. Succeeds only for a well-formed secret
   * that resolves to a known, non-revoked, non-expired key whose random
   * component matches the stored salted hash, returning the key's organization
   * scope and permissions (R18.3).
   *
   * Every failure — malformed input, unrecognized key, hash mismatch, expired,
   * or revoked — throws the identical uniform `AUTHENTICATION_FAILED` error and
   * creates no session, so nothing about the key's existence is revealed
   * (R18.5).
   */
  async authenticate(presented: string): Promise<ApiKeyAuthContext> {
    const parsed = parseSecret(presented);
    if (!parsed) {
      throw new AppError("AUTHENTICATION_FAILED");
    }

    const record = await this.store.findById(
      parsed.organizationId,
      parsed.keyId,
    );
    if (
      !record ||
      record.revokedAt !== null ||
      this.isExpired(record) ||
      !this.secretHasher.verify(record.secretHash, parsed.raw)
    ) {
      throw new AppError("AUTHENTICATION_FAILED");
    }

    return {
      apiKeyId: record.id,
      organizationId: record.organizationId,
      permissions: [...record.permissions],
    };
  }

  /**
   * Revoke a key so subsequent {@link authenticate} calls presenting it are
   * denied (R18.4). Requires API-management permission; a caller without it is
   * denied and no key is changed (R18.6). An unknown key is `NOT_FOUND`.
   */
  async revoke(
    organizationId: Uuid,
    keyId: Uuid,
    actor: Uuid,
  ): Promise<void> {
    await this.requireManagePermission(actor, organizationId);

    const record = await this.store.findById(organizationId, keyId);
    if (!record) {
      throw new AppError("NOT_FOUND");
    }
    if (record.revokedAt !== null) {
      return; // already revoked — idempotent
    }
    await this.store.markRevoked(record, toIsoTimestamp(this.clock.now()));
  }

  /* -------------------------- internals -------------------------------- */

  private async requireManagePermission(
    actor: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    if (!this.authorizer) return;
    const allowed = await this.authorizer.canManageApiKeys(
      actor,
      organizationId,
    );
    if (!allowed) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }

  /**
   * Whether the key has passed its expiry. The current data model has no expiry
   * column, so keys do not expire by time today; this hook keeps the uniform
   * denial path wired for when an `expiresAt` is added to the record (R18.5).
   */
  private isExpired(record: ApiKeyRecord): boolean {
    const expiresAt = (record as { expiresAt?: IsoTimestamp | null }).expiresAt;
    if (!expiresAt) return false;
    return this.clock.now().getTime() >= new Date(expiresAt).getTime();
  }
}

/* ---------------------------- helpers ---------------------------------- */

/** Project a record onto its non-disclosing DTO (never includes the secret). */
function toApiKeyDto(record: ApiKeyRecord): ApiKeyDto {
  const dto: ApiKeyDto = {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    permissions: [...record.permissions],
    createdAt: record.createdAt,
  };
  return record.revokedAt !== null
    ? { ...dto, revokedAt: record.revokedAt }
    : dto;
}

/**
 * Build the presented secret from its parts. The organization and key ids are
 * base64url-encoded so they cannot collide with the `.` delimiter, and the
 * random component is appended last.
 */
function formatSecret(organizationId: Uuid, keyId: Uuid, raw: string): string {
  return [
    SECRET_PREFIX,
    Buffer.from(organizationId, "utf8").toString("base64url"),
    Buffer.from(keyId, "utf8").toString("base64url"),
    raw,
  ].join(".");
}

/** Parse a presented secret, returning null for any malformed input. */
function parseSecret(presented: unknown): ParsedSecret | null {
  if (typeof presented !== "string") return null;
  const parts = presented.split(".");
  if (parts.length !== 4) return null;
  const [prefix, orgB64, keyB64, raw] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (prefix !== SECRET_PREFIX || raw.length === 0) return null;
  const organizationId = decodeSegment(orgB64);
  const keyId = decodeSegment(keyB64);
  if (organizationId === null || keyId === null) return null;
  return { organizationId, keyId, raw };
}

/** Decode a base64url id segment, returning null when it is empty/invalid. */
function decodeSegment(segment: string): string | null {
  if (segment.length === 0) return null;
  const decoded = Buffer.from(segment, "base64url").toString("utf8");
  return decoded.length > 0 ? decoded : null;
}

/**
 * Default {@link ApiKeyStore} backed by the tenant-scoped API-key repository.
 *
 * The repository exposes insert/read/delete but no in-place update, so
 * {@link ApiKeyStore.markRevoked} performs a soft revoke by re-inserting the
 * record with `revokedAt` set, preserving its metadata.
 */
export function repositoryApiKeyStore(
  repositories: Pick<Repositories, "apiKeys">,
): ApiKeyStore {
  const { apiKeys } = repositories;
  return {
    create(record: ApiKeyRecord): Promise<ApiKeyRecord> {
      return apiKeys.insert(record);
    },
    findById(organizationId: Uuid, keyId: Uuid): Promise<ApiKeyRecord | null> {
      return apiKeys.findById(organizationId, keyId);
    },
    async markRevoked(
      record: ApiKeyRecord,
      revokedAt: IsoTimestamp,
    ): Promise<void> {
      await apiKeys.deleteById(record.organizationId, record.id);
      await apiKeys.insert({ ...record, revokedAt });
    },
  };
}
