/**
 * Password hashing for StreetStudio authentication.
 *
 * Passwords are hashed with a memory-hard algorithm (Argon2id) and the
 * plaintext is never persisted (Requirement 3.1). The concrete algorithm is
 * hidden behind {@link PasswordHasher} so the {@link AuthService} core does not
 * depend on a specific hashing library and so tests can substitute a fast,
 * deterministic hasher.
 */
import argon2 from "argon2";

/** Hashes and verifies member passwords. */
export interface PasswordHasher {
  /**
   * Produce an opaque, non-reversible hash of `password`. The result MUST NOT
   * contain the plaintext and MUST be verifiable with {@link verify}.
   */
  hash(password: string): Promise<string>;
  /**
   * Return true iff `password` matches the previously produced `hash`. MUST NOT
   * throw for a malformed or non-matching `hash`; it returns false instead so
   * callers can treat every failure uniformly.
   */
  verify(hash: string, password: string): Promise<boolean>;
}

/**
 * Argon2id-based {@link PasswordHasher}. Uses the library defaults for the
 * memory-hard parameters, explicitly selecting the Argon2id variant, which is
 * resistant to both GPU and side-channel attacks.
 */
export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed hash (e.g. a placeholder used to equalize timing for
      // unknown accounts) verifies as a non-match rather than an error.
      return false;
    }
  }
}
