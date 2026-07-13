import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { randomBytes } from "node:crypto";
import {
  SecretManager,
  aesGcmSecretCipher,
  inMemorySecretStore,
} from "./secrets.js";

/**
 * Property 86: Secrets are never persisted in plaintext.
 *
 * Feature: streetstudio, Property 86: Secrets are never persisted in plaintext
 *
 * *For any* secret stored by the platform, the persisted representation is
 * encrypted and never equal to the secret's plaintext value. Concretely, after
 * {@link SecretManager.set}, the value held in the backing {@link SecretStore}
 * is never byte-equal to — and never textually contains — the plaintext (it is
 * ciphertext), while {@link SecretManager.reveal} round-trips back to the
 * original plaintext. Encryption uses an AES-256-GCM cipher with a 32-byte key
 * over an in-memory store.
 *
 * **Validates: Requirements 29.2**
 */
describe("Property 86: Secrets are never persisted in plaintext", () => {
  it("persists only ciphertext (never the plaintext) and round-trips on reveal", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary secret key and plaintext value. Non-empty plaintext so the
        // "never contains the plaintext" check is meaningful; empty strings are
        // covered separately by unit tests.
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 256 }),
        async (key, plaintext) => {
          // Fresh 32-byte key and store per case, isolating each trial.
          const cipher = aesGcmSecretCipher(randomBytes(32));
          const store = inMemorySecretStore();
          const manager = new SecretManager({ cipher, store });

          await manager.set(key, plaintext);

          // The store holds an encrypted representation, never plaintext.
          const persisted = await store.get(key);
          expect(persisted).not.toBeNull();
          const ciphertext = persisted as string;

          // Never byte-equal to the plaintext (holds for every input).
          expect(ciphertext).not.toBe(plaintext);

          // ...and never textually contains the plaintext. The AES-GCM cipher
          // emits `"<ivHex>:<tagHex>:<cipherHex>"`, whose alphabet is lowercase
          // hex plus ":". A plaintext composed solely of those characters can be
          // a coincidental substring without any leak, so the containment check
          // is applied only when the plaintext has a character outside that
          // alphabet — where a substring match would be genuine leakage. This
          // still flags an identity/broken cipher, whose output would equal (and
          // thus contain) the plaintext.
          if (/[^0-9a-f:]/.test(plaintext)) {
            expect(ciphertext.includes(plaintext)).toBe(false);
          }

          // reveal() round-trips back to the original plaintext.
          const revealed = await manager.reveal(key);
          expect(revealed).toBe(plaintext);
        }
      ),
      { numRuns: 100 }
    );
  });
});
