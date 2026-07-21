/**
 * Password hashing — Argon2id (Requirement: Argon2id password hashing). The
 * StreetJS public surface exposes JWT/session/vault but not password hashing, so
 * we use the standard `argon2` library directly as a crypto primitive (not a
 * reimplementation of framework infrastructure).
 */
import argon2 from "argon2";

/** Hash a plaintext password with Argon2id. Returns the encoded hash string. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** Verify a plaintext password against an Argon2id hash. Never throws. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
