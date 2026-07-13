/**
 * Sharing & Content Permissions (`packages/media`).
 *
 * Implements the design's "Sharing & Content Permissions" section and
 * Requirement 15: Sharing and Content Permissions. Two collaborating pieces
 * live here:
 *
 *  - {@link ShareService} — creates, revokes, and resolves secure share links
 *    for a Video (R15.1, R15.2, R15.3, R15.5, R15.6, R15.7).
 *  - {@link ContentPermissionGuard} — enforces content permission on every
 *    read or modify of a Video, Asset, Comment, or Folder, making no change to
 *    the resource on denial (R15.4).
 *
 * ShareService semantics:
 *
 *  - {@link ShareService.createLink} gates on the actor's share permission in
 *    the Video's owning Organization scope, then mints a share credential that
 *    is globally unique across all existing share links (R15.1). An optional
 *    expiry and passcode are stored; the raw passcode is never persisted — only
 *    a salted hash (see {@link PasscodeHasher}).
 *  - {@link ShareService.revoke} gates on share permission and marks the link
 *    revoked; every subsequent {@link ShareService.resolve} through it is denied
 *    (R15.3). Revocation is idempotent and never mutates the Video.
 *  - {@link ShareService.resolve} grants access — resolving the credential to
 *    the Video it is bound to — IF AND ONLY IF the link is not revoked, not
 *    expired, not locked, and (when passcode-protected) the supplied passcode
 *    matches (R15.2, R15.3, R15.5, R15.6, R15.7). A link that is revoked or at
 *    or after its expiry is denied with a "no longer valid" error and no change
 *    to the Video (R15.2, R15.3). After 5 consecutive incorrect passcode
 *    attempts the link is locked for at least 15 minutes and every access
 *    attempt during the lock is denied with a "temporarily locked" error
 *    (R15.7); a correct passcode resets the consecutive-failure count.
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`):
 * invalid inputs raise `VALIDATION_FAILED`; an unknown Video raises `NOT_FOUND`;
 * missing share/content permission raises `AUTHORIZATION_DENIED`; a link that is
 * unknown, revoked, expired, or presents an invalid passcode is denied with the
 * uniform, non-disclosing `SHARE_LINK_EXPIRED` ("The share link is no longer
 * valid.") so a caller learns neither which factor failed nor whether the link
 * exists (design "Non-disclosure", R15.6); a locked link raises
 * `SHARE_LINK_LOCKED`.
 *
 * Persistence is reached only through the narrow {@link ShareStore} port and
 * authorization only through the {@link AccessControl} seam from
 * `@streetstudio/auth`, so both the service and the guard are decoupled from
 * the concrete database layer and unit-testable with in-memory fakes. The
 * default adapter ({@link repositoryShareStore}) is backed by the ShareLink and
 * Video repositories exposed by `@streetstudio/database`. Because the ShareLink
 * repository exposes no in-place update, {@link ShareStore.update} repoints a
 * link by deleting and re-inserting it with the mutated fields, preserving its
 * id and every other field (the same soft-update pattern used by the RBAC,
 * API-key, and content stores).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { newUuid } from "@streetstudio/database";
import type {
  Repositories,
  ShareLinkRecord,
  VideoRecord,
} from "@streetstudio/database";
import {
  systemClock,
  toIsoTimestamp,
  type AccessControl,
  type Action,
  type AuthContext,
  type Clock,
  type ResourceRef,
} from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type { ShareLinkDto, Uuid } from "@streetstudio/shared";

/**
 * Permission a Role must grant to create or revoke a share link for a Video
 * within an Organization (R15.1, R15.3). Evaluated by {@link AccessControl.can}
 * in the Video's owning Organization scope.
 */
export const SHARE_VIDEO_PERMISSION = "content:share_video";

/** Number of consecutive incorrect passcode attempts that locks a link (R15.7). */
export const MAX_PASSCODE_ATTEMPTS = 5;

/**
 * Minimum duration a link is locked after {@link MAX_PASSCODE_ATTEMPTS}
 * consecutive incorrect passcode attempts (R15.7): at least 15 minutes.
 */
export const SHARE_LOCK_DURATION_MS = 15 * 60 * 1000;

/** Number of random bytes in a generated share credential (256-bit). */
const CREDENTIAL_BYTES = 32;

/** Bound on credential-generation retries before conceding a collision. */
const MAX_CREDENTIAL_ATTEMPTS = 8;

/**
 * Options for {@link ShareService.createLink}. Both fields are optional: an
 * omitted `expiresAt` yields a non-expiring link and an omitted `passcode`
 * yields an open (non-passcode-protected) link.
 */
export interface ShareOptions {
  /** When the link should stop granting access (R15.2); omitted never expires. */
  readonly expiresAt?: Date;
  /** A passcode required to resolve the link (R15.5–R15.7); omitted is open. */
  readonly passcode?: string;
}

/** The Video a resolved share credential grants access to. */
export interface ShareAccess {
  /** The Video the credential is bound to. */
  readonly videoId: Uuid;
}

/**
 * Hashes and verifies share-link passcodes. The raw passcode is never persisted
 * (design "Sharing" data model); only the {@link PasscodeHasher.hash} output is
 * stored, and {@link PasscodeHasher.verify} checks a candidate against it.
 */
export interface PasscodeHasher {
  /** Produce a stored representation of `passcode`. */
  hash(passcode: string): string;
  /** Whether `passcode` matches the previously stored representation. */
  verify(stored: string, passcode: string): boolean;
}

/**
 * Default {@link PasscodeHasher}: a random per-passcode salt combined with the
 * passcode under SHA-256. The stored form is `"<saltHex>:<digestHex>"`; the
 * salt is not itself secret. Verification is constant-time. Mirrors the
 * API-key secret hasher so passcodes are never stored in the clear.
 */
export class Sha256PasscodeHasher implements PasscodeHasher {
  private static readonly SALT_BYTES = 16;

  hash(passcode: string): string {
    const salt = randomBytes(Sha256PasscodeHasher.SALT_BYTES);
    return `${salt.toString("hex")}:${Sha256PasscodeHasher.digest(salt, passcode)}`;
  }

  verify(stored: string, passcode: string): boolean {
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
    const actualHex = Sha256PasscodeHasher.digest(salt, passcode);
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private static digest(salt: Buffer, passcode: string): string {
    return createHash("sha256")
      .update(salt)
      .update(Buffer.from(passcode, "utf8"))
      .digest("hex");
  }
}

/**
 * Persistence port for share links. Deliberately narrow: the service inserts a
 * link, checks a candidate credential for global uniqueness, resolves a link by
 * credential or id, resolves the Video a link is bound to (for authorization
 * scope), and persists the mutated state of an existing link.
 */
export interface ShareStore {
  /** Persist a new share link and return it. */
  insert(record: ShareLinkRecord): Promise<ShareLinkRecord>;
  /** Find a share link by its credential, or null when none matches. */
  findByCredential(credential: string): Promise<ShareLinkRecord | null>;
  /** Find a share link by id, or null when absent. */
  findById(id: Uuid): Promise<ShareLinkRecord | null>;
  /** Find the Video a link targets, or null when absent. */
  findVideo(videoId: Uuid): Promise<VideoRecord | null>;
  /** Persist the mutated state of an existing link, preserving its id. */
  update(record: ShareLinkRecord): Promise<ShareLinkRecord>;
}

/** Dependencies required to construct a {@link ShareService}. */
export interface ShareServiceDeps {
  /** Share-link persistence port. */
  readonly store: ShareStore;
  /** RBAC evaluator used to gate create/revoke (R15.1, R15.3). */
  readonly access: AccessControl;
  /** Passcode hasher; defaults to a salted SHA-256 hasher. */
  readonly passcodeHasher?: PasscodeHasher;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
  /** Share-credential generator; defaults to a 256-bit CSPRNG token. */
  readonly generateCredential?: () => string;
}

/** Generate a URL-safe, 256-bit random share credential. */
function defaultGenerateCredential(): string {
  return randomBytes(CREDENTIAL_BYTES).toString("base64url");
}

/**
 * The Sharing service. See the module doc for the exact semantics of each
 * operation.
 */
export class ShareService {
  private readonly store: ShareStore;
  private readonly access: AccessControl;
  private readonly passcodeHasher: PasscodeHasher;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;
  private readonly generateCredential: () => string;

  constructor(deps: ShareServiceDeps) {
    this.store = deps.store;
    this.access = deps.access;
    this.passcodeHasher = deps.passcodeHasher ?? new Sha256PasscodeHasher();
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
    this.generateCredential =
      deps.generateCredential ?? defaultGenerateCredential;
  }

  /**
   * Create a share link for `videoId`. The actor must hold share permission in
   * the Video's owning Organization (R15.1); otherwise no link is created. The
   * returned credential is unique across all existing share links (R15.1). When
   * a passcode is supplied it is stored only as a salted hash; when an expiry is
   * supplied the link stops granting access at or after it (R15.2).
   */
  async createLink(
    actor: AuthContext,
    videoId: Uuid,
    opts: ShareOptions = {},
  ): Promise<ShareLinkDto> {
    // An empty passcode is meaningless; reject rather than store an open link
    // that appears protected.
    if (opts.passcode !== undefined && opts.passcode.length === 0) {
      throw new AppError("VALIDATION_FAILED");
    }

    // Resolve the Video so authorization is evaluated in its owning scope.
    const video = await this.store.findVideo(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    const permitted = await this.access.can(actor, SHARE_VIDEO_PERMISSION, {
      organizationId: video.organizationId,
      type: "video",
      id: video.id,
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    const credential = await this.mintUniqueCredential();
    const passcodeHash =
      opts.passcode !== undefined
        ? this.passcodeHasher.hash(opts.passcode)
        : null;

    const record: ShareLinkRecord = {
      id: this.newId(),
      videoId: video.id,
      credential,
      expiresAt: opts.expiresAt ? toIsoTimestamp(opts.expiresAt) : null,
      passcodeHash,
      revokedAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    };
    const created = await this.store.insert(record);
    return toShareLinkDto(created);
  }

  /**
   * Revoke the share link `linkId`. The actor must hold share permission in the
   * bound Video's owning Organization (R15.3); otherwise nothing changes. After
   * revocation every {@link ShareService.resolve} through the link is denied.
   * Revocation is idempotent and never mutates the Video.
   */
  async revoke(actor: AuthContext, linkId: Uuid): Promise<void> {
    const link = await this.store.findById(linkId);
    if (!link) {
      throw new AppError("NOT_FOUND");
    }

    const video = await this.store.findVideo(link.videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    const permitted = await this.access.can(actor, SHARE_VIDEO_PERMISSION, {
      organizationId: video.organizationId,
      type: "video",
      id: video.id,
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    // Idempotent: an already-revoked link stays revoked with its original
    // timestamp preserved.
    if (link.revokedAt !== null) {
      return;
    }

    await this.store.update({
      ...link,
      revokedAt: toIsoTimestamp(this.clock.now()),
    });
  }

  /**
   * Resolve `credential` to the Video it grants access to, enforcing expiry,
   * revocation, passcode, and lockout. Grants access IF AND ONLY IF the link is
   * not revoked, not at/after its expiry, not currently locked, and — when
   * passcode-protected — `passcode` matches (R15.2, R15.3, R15.5, R15.6, R15.7).
   * Denials never mutate the Video.
   */
  async resolve(credential: string, passcode?: string): Promise<ShareAccess> {
    const link = await this.store.findByCredential(credential);
    // Unknown credential: uniform, non-disclosing denial (R15.6 non-disclosure).
    if (!link) {
      throw new AppError("SHARE_LINK_EXPIRED");
    }

    const now = this.clock.now();

    // Revoked links deny every subsequent access (R15.3), with no change.
    if (link.revokedAt !== null) {
      throw new AppError("SHARE_LINK_EXPIRED");
    }

    // Expired links (at or after the configured expiry) deny access (R15.2).
    if (link.expiresAt !== null && new Date(link.expiresAt).getTime() <= now.getTime()) {
      throw new AppError("SHARE_LINK_EXPIRED");
    }

    // A currently-active lock blocks all access (R15.7), with no change to the
    // Video. A lock whose deadline has passed is cleared below before any
    // passcode is evaluated, so consecutive-failure counting restarts.
    const locked =
      link.lockedUntil !== null &&
      new Date(link.lockedUntil).getTime() > now.getTime();
    if (locked) {
      throw new AppError("SHARE_LINK_LOCKED");
    }

    // Open (non-passcode) link: grant access.
    if (link.passcodeHash === null) {
      throw_if_unexpected_passcode: {
        break throw_if_unexpected_passcode;
      }
      return { videoId: link.videoId };
    }

    // Passcode-protected link. An expired lock is reset here so the fresh
    // attempt is counted from zero.
    const baseAttempts =
      link.lockedUntil !== null ? 0 : link.failedAttempts;

    const supplied = passcode ?? "";
    const matches =
      supplied.length > 0 && this.passcodeHasher.verify(link.passcodeHash, supplied);

    if (matches) {
      // Correct passcode resets the consecutive-failure count and clears any
      // expired lock (R15.5).
      if (link.failedAttempts !== 0 || link.lockedUntil !== null) {
        await this.store.update({
          ...link,
          failedAttempts: 0,
          lockedUntil: null,
        });
      }
      return { videoId: link.videoId };
    }

    // Incorrect passcode (R15.6): record the failure. The 5th consecutive
    // failure locks the link for at least 15 minutes (R15.7).
    const failedAttempts = baseAttempts + 1;
    if (failedAttempts >= MAX_PASSCODE_ATTEMPTS) {
      await this.store.update({
        ...link,
        failedAttempts,
        lockedUntil: toIsoTimestamp(
          new Date(now.getTime() + SHARE_LOCK_DURATION_MS),
        ),
      });
      throw new AppError("SHARE_LINK_LOCKED");
    }

    await this.store.update({
      ...link,
      failedAttempts,
      lockedUntil: null,
    });
    throw new AppError("SHARE_LINK_EXPIRED");
  }

  /**
   * Mint a credential that does not collide with any existing share link
   * (R15.1). Collisions are astronomically unlikely for a 256-bit token, but
   * the guarantee is enforced by checking each candidate; a persistent
   * collision (e.g. an injected non-random generator) is surfaced as a conflict
   * rather than silently reusing a credential.
   */
  private async mintUniqueCredential(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CREDENTIAL_ATTEMPTS; attempt++) {
      const candidate = this.generateCredential();
      const existing = await this.store.findByCredential(candidate);
      if (!existing) {
        return candidate;
      }
    }
    throw new AppError("CONFLICT");
  }
}

/**
 * The set of content resource kinds whose reads and modifications are gated by
 * content permission (R15.4).
 */
export type ContentResourceType = "video" | "asset" | "comment" | "folder";

/** A reference to a content resource whose access is being checked (R15.4). */
export interface ContentResourceRef extends ResourceRef {
  /** The kind of content resource. */
  readonly type: ContentResourceType;
}

/**
 * Enforces content permission on every read or modify of a Video, Asset,
 * Comment, or Folder (R15.4). {@link ContentPermissionGuard.enforce} evaluates
 * the requester's permission through the RBAC {@link AccessControl} seam in the
 * resource's owning Organization scope and throws `AUTHORIZATION_DENIED` when
 * the requester lacks it — leaving the resource unchanged. A caller that
 * performs the read/modify only after `enforce` resolves therefore never
 * mutates a resource it is not permitted to access.
 */
export class ContentPermissionGuard {
  private readonly access: AccessControl;

  constructor(access: AccessControl) {
    this.access = access;
  }

  /**
   * Throw `AUTHORIZATION_DENIED` unless `actor` may perform `action` on
   * `resource` in the resource's owning Organization scope (R15.4). Resolves
   * with no value when permitted.
   */
  async enforce(
    actor: AuthContext,
    action: Action,
    resource: ContentResourceRef,
  ): Promise<void> {
    const permitted = await this.access.can(actor, action, resource);
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }
}

/** Map a {@link ShareLinkRecord} to its wire DTO; the passcode is never leaked. */
function toShareLinkDto(record: ShareLinkRecord): ShareLinkDto {
  return {
    id: record.id,
    videoId: record.videoId,
    credential: record.credential,
    ...(record.expiresAt !== null ? { expiresAt: record.expiresAt } : {}),
    passcodeProtected: record.passcodeHash !== null,
    ...(record.revokedAt !== null ? { revokedAt: record.revokedAt } : {}),
    ...(record.lockedUntil !== null ? { lockedUntil: record.lockedUntil } : {}),
  };
}

/**
 * Default {@link ShareStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Share links use the global (id-keyed) repository; a credential lookup filters
 * that table. Videos use the tenant-scoped repository via an unscoped id lookup
 * so the link's Video can be resolved from a credential alone (its
 * `organizationId` then scopes the authorization decision). Because the
 * ShareLink repository exposes no in-place update, {@link ShareStore.update}
 * repoints a link by deleting and re-inserting it with the mutated fields,
 * preserving its id and every other field.
 */
export function repositoryShareStore(
  repositories: Pick<Repositories, "shareLinks" | "videos">,
): ShareStore {
  const { shareLinks, videos } = repositories;
  return {
    insert: (record) => shareLinks.insert(record),
    async findByCredential(credential) {
      const all = await shareLinks.list();
      return all.find((l) => l.credential === credential) ?? null;
    },
    findById: (id) => shareLinks.findById(id),
    findVideo: (videoId) => videos.findByIdUnscoped(videoId),
    async update(record) {
      await shareLinks.deleteById(record.id);
      await shareLinks.insert(record);
      return record;
    },
  };
}
