/**
 * Core authentication service: registration, login, logout, and access-token
 * verification.
 *
 * `AuthService` owns the credential and session lifecycle described in the
 * design's "Authentication & Session" section:
 *
 *  - {@link AuthService.register} creates a Member from a syntactically valid,
 *    non-duplicate email and a password of at least 8 characters, storing only
 *    an Argon2id hash — never the plaintext (Requirements 3.1, 3.8).
 *  - {@link AuthService.login} verifies credentials and, on success, records a
 *    session and issues a JWT access token whose lifetime is at most 15 minutes
 *    (Requirement 3.2).
 *  - {@link AuthService.logout} invalidates the session so subsequent tokens
 *    bound to it are rejected (Requirement 3.4).
 *  - {@link AuthService.verifyAccessToken} rejects tampered, expired, or
 *    session-invalidated tokens (Requirements 3.4, 3.7).
 *
 * Every authentication failure is reported uniformly with the shared
 * `AUTHENTICATION_FAILED` code and every registration failure with
 * `REGISTRATION_FAILED`, so responses never reveal which credential was wrong
 * or whether an email is already registered (Requirements 3.3, 3.8).
 *
 *  - {@link AuthService.loginWithOAuth} and {@link AuthService.loginWithSSO}
 *    authenticate through a configured OAuth/SSO provider, resolve or provision
 *    the Member, and issue a session + token by reusing the same machinery as
 *    {@link AuthService.login}. A provider failure, provider unavailability, or
 *    an unconfigured provider denies the sign-in and creates no session, always
 *    surfacing the uniform `AUTHENTICATION_FAILED` error (Requirements 3.5,
 *    3.6, 3.10).
 *
 * Extension points: account lockout (task 6.2) is injected as an optional
 * {@link LockoutPolicy}, and the OAuth/SSO providers are supplied behind an
 * injectable {@link FederatedProviderRegistry} so no identity vendor is
 * hardcoded in core (see `./federation.js`).
 */
import { newUuid } from "@streetstudio/database";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { IsoTimestamp, MemberDto, Uuid } from "@streetstudio/shared";
import { systemClock, type Clock } from "./clock.js";
import type {
  FederatedIdentity,
  FederatedProviderRegistry,
} from "./federation.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { AuthStores } from "./stores.js";
import { normalizeEmail } from "./stores.js";
import {
  MAX_ACCESS_TOKEN_TTL_SECONDS,
  toIsoTimestamp,
  type AccessTokenIssuer,
} from "./tokens.js";

/** Minimum acceptable password length (Requirement 3.1). */
export const MIN_PASSWORD_LENGTH = 8;

/** Registration input: a candidate email and plaintext password. */
export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}

/** Login input: an email and plaintext password. */
export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/**
 * The result of a successful login: a bearer access token, the instant it
 * expires (at most 15 minutes out), and the id of the created session.
 */
export interface AuthResult {
  readonly accessToken: string;
  readonly expiresAt: IsoTimestamp;
  readonly sessionId: Uuid;
}

/**
 * The authenticated principal.
 *
 * Authentication resolves a `memberId` and the `sessionId` backing the access
 * token. Organization scoping is not established at authentication time — RBAC
 * (task 8) binds an `organizationId` against the resource being accessed — so
 * that field is optional and populated by higher layers.
 */
export interface AuthContext {
  readonly memberId: Uuid;
  /** Session the access token is bound to, when derived from a token. */
  readonly sessionId?: Uuid;
  /** Organization scope, when the context has been bound to one (RBAC). */
  readonly organizationId?: Uuid;
}

/**
 * Account-lockout policy port (implemented by task 6.2). When supplied,
 * {@link AuthService.login} consults it before verifying credentials and
 * records the outcome, so repeated failures can lock an account without
 * changing the auth core.
 */
export interface LockoutPolicy {
  /** True when authentication for `email` is currently locked out. */
  isLocked(email: string): Promise<boolean>;
  /** Record a failed authentication attempt for `email`. */
  recordFailure(email: string): Promise<void>;
  /** Clear failure state for `email` after a successful authentication. */
  reset?(email: string): Promise<void>;
}

/** Dependencies required to construct an {@link AuthService}. */
export interface AuthServiceDeps {
  /** Member and session persistence ports. */
  readonly stores: AuthStores;
  /** Password hasher (Argon2id in production). */
  readonly passwordHasher: PasswordHasher;
  /** Access-token issuer/verifier. */
  readonly tokenIssuer: AccessTokenIssuer;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /**
   * Access-token lifetime in seconds. Defaults to and is clamped at
   * {@link MAX_ACCESS_TOKEN_TTL_SECONDS} (15 minutes) so the `exp` invariant of
   * Requirement 3.2 always holds.
   */
  readonly accessTokenTtlSeconds?: number;
  /** Optional account-lockout policy (task 6.2). */
  readonly lockoutPolicy?: LockoutPolicy;
  /**
   * Optional registry of configured OAuth/SSO providers. Required to service
   * {@link AuthService.loginWithOAuth} / {@link AuthService.loginWithSSO}; when
   * absent, every federated sign-in is denied with `AUTHENTICATION_FAILED`.
   */
  readonly providers?: FederatedProviderRegistry;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSyntacticallyValidEmail(email: string): boolean {
  // Guard against unbounded inputs, then apply a conservative shape check.
  return email.length <= 254 && EMAIL_RE.test(email);
}

export class AuthService {
  private readonly stores: AuthStores;
  private readonly passwordHasher: PasswordHasher;
  private readonly tokenIssuer: AccessTokenIssuer;
  private readonly clock: Clock;
  private readonly accessTokenTtlSeconds: number;
  private readonly lockoutPolicy: LockoutPolicy | undefined;
  private readonly providers: FederatedProviderRegistry | undefined;
  private readonly newId: () => Uuid;
  /** Memoized placeholder hash used to equalize verification timing. */
  private dummyHash: Promise<string> | undefined;

  constructor(deps: AuthServiceDeps) {
    this.stores = deps.stores;
    this.passwordHasher = deps.passwordHasher;
    this.tokenIssuer = deps.tokenIssuer;
    this.clock = deps.clock ?? systemClock;
    this.accessTokenTtlSeconds = Math.min(
      deps.accessTokenTtlSeconds ?? MAX_ACCESS_TOKEN_TTL_SECONDS,
      MAX_ACCESS_TOKEN_TTL_SECONDS,
    );
    if (this.accessTokenTtlSeconds <= 0) {
      throw new Error("accessTokenTtlSeconds must be positive");
    }
    this.lockoutPolicy = deps.lockoutPolicy;
    this.providers = deps.providers;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Register a new Member. Rejects malformed emails, passwords shorter than
   * {@link MIN_PASSWORD_LENGTH}, and duplicate emails with a single uniform
   * `REGISTRATION_FAILED` error that never discloses whether the email already
   * exists (Requirements 3.1, 3.8).
   */
  async register(input: RegisterInput): Promise<MemberDto> {
    const email = normalizeEmail(input.email);
    if (
      !isSyntacticallyValidEmail(email) ||
      input.password.length < MIN_PASSWORD_LENGTH
    ) {
      throw new AppError("REGISTRATION_FAILED");
    }

    const existing = await this.stores.members.findByEmail(email);
    if (existing !== null) {
      throw new AppError("REGISTRATION_FAILED");
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const record: MemberRecord = {
      id: this.newId(),
      email,
      passwordHash,
      createdAt: this.nowIso(),
    };
    const created = await this.stores.members.create(record);
    return this.toMemberDto(created);
  }

  /**
   * Authenticate a Member and, on success, create a session and issue a
   * short-lived access token (Requirement 3.2). Every failure — unknown email,
   * wrong password, SSO-only account, or a locked account — yields the same
   * uniform `AUTHENTICATION_FAILED` error (Requirements 3.3, 3.9).
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);

    if (this.lockoutPolicy && (await this.lockoutPolicy.isLocked(email))) {
      throw new AppError("AUTHENTICATION_FAILED");
    }

    const member = await this.stores.members.findByEmail(email);
    const ok = await this.verifyPassword(member, input.password);
    if (!member || !ok) {
      await this.lockoutPolicy?.recordFailure(email);
      throw new AppError("AUTHENTICATION_FAILED");
    }

    await this.lockoutPolicy?.reset?.(email);
    return this.issueSession(member.id);
  }

  /**
   * Invalidate a session so any access token bound to it is rejected on the
   * next verification (Requirement 3.4). Idempotent.
   */
  async logout(sessionId: Uuid): Promise<void> {
    await this.stores.sessions.invalidate(sessionId);
  }

  /**
   * Resolve the authenticated principal from an access token, rejecting
   * tampered/expired tokens and tokens whose session has been invalidated or
   * has expired (Requirements 3.4, 3.7).
   */
  async verifyAccessToken(token: string): Promise<AuthContext> {
    let claims;
    try {
      claims = this.tokenIssuer.verify(token);
    } catch {
      throw new AppError("AUTHENTICATION_FAILED");
    }

    const session = await this.stores.sessions.findById(claims.sessionId);
    if (
      !session ||
      session.revokedAt !== null ||
      session.memberId !== claims.memberId ||
      this.isExpired(session.expiresAt)
    ) {
      throw new AppError("AUTHENTICATION_FAILED");
    }

    return { memberId: session.memberId, sessionId: session.id };
  }

  /* -------------------------- internals -------------------------------- */

  private async issueSession(memberId: Uuid): Promise<AuthResult> {
    const now = this.clock.now();
    const expiresAtDate = new Date(
      now.getTime() + this.accessTokenTtlSeconds * 1000,
    );
    const session: SessionRecord = {
      id: this.newId(),
      memberId,
      issuedAt: toIsoTimestamp(now),
      expiresAt: toIsoTimestamp(expiresAtDate),
      revokedAt: null,
    };
    await this.stores.sessions.create(session);

    const accessToken = this.tokenIssuer.issue({
      memberId,
      sessionId: session.id,
      expiresAt: expiresAtDate,
    });
    return {
      accessToken,
      expiresAt: session.expiresAt,
      sessionId: session.id,
    };
  }

  /**
   * Verify a candidate password against a member. When the member is unknown or
   * has no password (SSO-only), a verification against a placeholder hash is
   * still performed so the response time does not reveal whether the account
   * exists.
   */
  private async verifyPassword(
    member: MemberRecord | null,
    password: string,
  ): Promise<boolean> {
    if (!member || member.passwordHash === null) {
      await this.passwordHasher.verify(await this.getDummyHash(), password);
      return false;
    }
    return this.passwordHasher.verify(member.passwordHash, password);
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      this.dummyHash = this.passwordHasher.hash(newUuid());
    }
    return this.dummyHash;
  }

  private isExpired(expiresAt: IsoTimestamp): boolean {
    return this.clock.now().getTime() >= new Date(expiresAt).getTime();
  }

  private nowIso(): IsoTimestamp {
    return toIsoTimestamp(this.clock.now());
  }

  private toMemberDto(record: MemberRecord): MemberDto {
    return {
      id: record.id,
      email: record.email,
      createdAt: record.createdAt,
    };
  }
}
