/**
 * Identity use cases: register a member (Argon2id-hashed password, real
 * persistence) and log in (verify credentials, issue a JWT via the StreetJS
 * `JwtService`). Non-disclosing on failure (no account enumeration).
 */
import { randomUUID } from "node:crypto";
import { JwtService, ConflictException, UnauthorizedException } from "streetjs";
import type { IsoTimestamp } from "@streetstudio/shared";
import { Member, type MemberView, normalizeEmail, assertPasswordPolicy } from "../domain/member.js";
import { MemberRepository, DuplicateEmailError } from "../persistence/member-repository.js";
import { hashPassword, verifyPassword } from "../password.js";

export interface Clock {
  now(): IsoTimestamp;
}
const systemClock: Clock = { now: () => new Date().toISOString() as IsoTimestamp };

/** Result of a successful login: a signed JWT and the public member view. */
export interface LoginResult {
  readonly token: string;
  readonly member: MemberView;
}

export class IdentityService {
  private readonly jwt: JwtService;

  constructor(
    private readonly repo: MemberRepository,
    jwtSecret: string,
    private readonly clock: Clock = systemClock,
    /** Token lifetime in seconds (default 7 days). */
    private readonly tokenTtlSeconds = 7 * 24 * 60 * 60,
  ) {
    this.jwt = new JwtService(jwtSecret);
  }

  /** Register a new member. Throws 409 when the email is already taken. */
  async register(email: string, password: string): Promise<MemberView> {
    const normalizedEmail = normalizeEmail(email);
    assertPasswordPolicy(password);
    const member = Member.create({
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      createdAt: this.clock.now(),
    });
    try {
      await this.repo.insert(member);
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new ConflictException("Email is already registered.");
      }
      throw error;
    }
    return member.toView();
  }

  /**
   * Verify credentials and issue a JWT. Returns 401 for both unknown email and
   * wrong password (non-disclosing). Performs a dummy verify on unknown email to
   * reduce timing signal.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const member = await this.repo.findByEmail(normalizedEmail);
    const hash =
      member?.passwordHash ??
      // A fixed decoy hash so timing is similar for unknown accounts.
      "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000";
    const ok = await verifyPassword(hash, password);
    if (!member || !ok) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    const token = this.jwt.sign(
      { sub: member.id, email: member.email, roles: [] },
      { expiresInSeconds: this.tokenTtlSeconds },
    );
    return { token, member: member.toView() };
  }
}
