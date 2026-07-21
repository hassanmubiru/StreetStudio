/**
 * Invitation domain model — the rich `Invitation` aggregate and its lifecycle
 * invariants. Pure domain logic: no framework dependencies, no I/O.
 * Business rules about invitation creation, expiry, and acceptance live here.
 */
import { AppError } from "@streetstudio/shared";
import type { Uuid, IsoTimestamp, InvitationStatus } from "@streetstudio/shared";

/** Invitation lifetime: 7 days after creation (Requirement 4.2) */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Email validation regex */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Prefix on every invitation token, used as malformed-input guard */
const INVITATION_TOKEN_PREFIX = "ssi";

/** Random bytes in the token's secret component (256 bits of entropy) */
const TOKEN_SECRET_BYTES = 32;

/** Persistent shape of an invitation */
export interface InvitationProps {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly email: string;
  readonly token: string;
  readonly status: InvitationStatus;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

/** Domain error for invitation-specific business rule violations */
export class InvitationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationDomainError";
  }
}

/**
 * Invitation aggregate root. Instances are immutable — state changes
 * return a new `Invitation` and never mutate the receiver. Enforces
 * all invitation-specific business invariants.
 */
export class Invitation {
  private constructor(private readonly props: InvitationProps) {}

  /** Rehydrate from persisted props (no validation - assume valid) */
  static fromProps(props: InvitationProps): Invitation {
    return new Invitation(props);
  }

  /**
   * Create a new pending invitation with validated email.
   * Token is built from organization ID, invitation ID, and secret.
   */
  static create(input: {
    id: Uuid;
    organizationId: Uuid;
    email: string;
    token: string;
    createdAt: IsoTimestamp;
  }): Invitation {
    if (!isWellFormedEmail(input.email)) {
      throw new InvitationDomainError("Email address is not well-formed.");
    }

    const createdAt = new Date(input.createdAt);
    const expiresAt = new Date(createdAt.getTime() + INVITATION_TTL_MS);

    return new Invitation({
      id: input.id,
      organizationId: input.organizationId,
      email: input.email,
      token: input.token,
      status: "pending",
      createdAt: input.createdAt,
      expiresAt: expiresAt.toISOString() as IsoTimestamp,
    });
  }

  // Getters
  get id(): Uuid { return this.props.id; }
  get organizationId(): Uuid { return this.props.organizationId; }
  get email(): string { return this.props.email; }
  get token(): string { return this.props.token; }
  get status(): InvitationStatus { return this.props.status; }
  get createdAt(): IsoTimestamp { return this.props.createdAt; }
  get expiresAt(): IsoTimestamp { return this.props.expiresAt; }

  /**
   * Check if invitation is expired at the given time.
   */
  isExpiredAt(currentTime: Date): boolean {
    return currentTime.getTime() >= new Date(this.props.expiresAt).getTime();
  }

  /**
   * Check if invitation can be accepted (pending and not expired).
   */
  canBeAcceptedAt(currentTime: Date): boolean {
    return (
      this.props.status === "pending" && 
      !this.isExpiredAt(currentTime)
    );
  }

  /**
   * Accept the invitation (change status to accepted).
   * Can only accept pending, non-expired invitations.
   */
  accept(currentTime: Date): Invitation {
    if (!this.canBeAcceptedAt(currentTime)) {
      throw new InvitationDomainError(
        "Cannot accept invitation: it is expired, already accepted, or revoked."
      );
    }

    return new Invitation({
      ...this.props,
      status: "accepted",
    });
  }

  /**
   * Revoke the invitation (change status to revoked).
   * Can only revoke pending invitations.
   */
  revoke(): Invitation {
    if (this.props.status !== "pending") {
      throw new InvitationDomainError(
        "Cannot revoke invitation: it is not pending."
      );
    }

    return new Invitation({
      ...this.props,
      status: "revoked",
    });
  }

  /** Serialize to the persistent/wire shape */
  toProps(): InvitationProps {
    return { ...this.props };
  }
}

/** True when email is syntactically well-formed and bounded */
function isWellFormedEmail(email: string): boolean {
  return (
    typeof email === "string" && 
    email.length <= 254 && 
    EMAIL_RE.test(email)
  );
}

/** Token generation and parsing utilities */
export class InvitationToken {
  /**
   * Build an invitation token from its parts. The organization and invitation
   * ids are base64url-encoded and the random secret is appended last.
   */
  static format(
    organizationId: Uuid,
    invitationId: Uuid,
    secret: string,
  ): string {
    return [
      INVITATION_TOKEN_PREFIX,
      Buffer.from(organizationId, "utf8").toString("base64url"),
      Buffer.from(invitationId, "utf8").toString("base64url"),
      secret,
    ].join(".");
  }

  /** Parse an invitation token, returning null for malformed input */
  static parse(token: unknown): { organizationId: Uuid; invitationId: Uuid } | null {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    
    const [prefix, orgB64, invB64, secret] = parts as [string, string, string, string];
    if (prefix !== INVITATION_TOKEN_PREFIX || secret.length === 0) return null;
    
    const organizationId = decodeSegment(orgB64);
    const invitationId = decodeSegment(invB64);
    if (organizationId === null || invitationId === null) return null;
    
    return { organizationId, invitationId };
  }

  /** Constant-time comparison of tokens for security */
  static tokensMatch(stored: string, presented: string): boolean {
    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(presented, "utf8");
    // Use timingSafeEqual from crypto for constant-time comparison
    const { timingSafeEqual } = require("node:crypto");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** Decode a base64url id segment, returning null when invalid */
function decodeSegment(segment: string): string | null {
  if (segment.length === 0) return null;
  const decoded = Buffer.from(segment, "base64url").toString("utf8");
  return decoded.length > 0 ? decoded : null;
}