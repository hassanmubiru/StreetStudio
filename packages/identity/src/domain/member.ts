/**
 * Identity domain — the `Member` model and its validation invariants. Pure: no
 * framework, no I/O, no hashing (hashing lives in `password.ts`).
 */
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";

/** Thrown when member input violates a domain invariant. */
export class MemberStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberStateError";
  }
}

/** Persistent shape of a member (matches the `members` table columns). */
export interface MemberProps {
  readonly id: Uuid;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: IsoTimestamp;
}

/** Public view of a member — never exposes the password hash. */
export interface MemberView {
  readonly id: Uuid;
  readonly email: string;
  readonly createdAt: IsoTimestamp;
}

// Pragmatic email shape check (not full RFC 5322); real validation is a
// verification email, out of scope here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Normalize and validate an email address, or throw. */
export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    throw new MemberStateError("A valid email address is required.");
  }
  return normalized;
}

/** Validate a raw password meets the minimum policy, or throw. */
export function assertPasswordPolicy(password: string): void {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new MemberStateError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
}

/** A registered member. Immutable value object. */
export class Member {
  private constructor(private readonly props: MemberProps) {}

  static fromProps(props: MemberProps): Member {
    return new Member(props);
  }

  /** Construct a member from a normalized email and an already-hashed password. */
  static create(input: {
    id: Uuid;
    email: string;
    passwordHash: string;
    createdAt: IsoTimestamp;
  }): Member {
    return new Member({
      id: input.id,
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      createdAt: input.createdAt,
    });
  }

  get id(): Uuid {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }

  /** Public projection with no secret material. */
  toView(): MemberView {
    return { id: this.props.id, email: this.props.email, createdAt: this.props.createdAt };
  }

  toProps(): MemberProps {
    return { ...this.props };
  }
}
