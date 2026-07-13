import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  SecretManager,
  aesGcmSecretCipher,
  inMemorySecretStore,
  streetSecretCipher,
  type SecretCipher,
} from "./secrets.js";

/** A trivially reversible cipher whose output is never the plaintext. */
const reversibleCipher: SecretCipher = {
  encrypt: (p) => `enc(${p})`,
  decrypt: (c) => c.slice(4, -1),
};

describe("SecretManager", () => {
  it("persists only ciphertext and reveals the original plaintext", async () => {
    const store = inMemorySecretStore();
    const manager = new SecretManager({ cipher: reversibleCipher, store });

    await manager.set("jwt", "super-secret-value");

    // The persisted representation is ciphertext, never the plaintext (R29.2).
    const persisted = await store.get("jwt");
    expect(persisted).not.toBe("super-secret-value");
    expect(persisted).toBe("enc(super-secret-value)");
    // The manager still recovers the original value on the way out.
    await expect(manager.reveal("jwt")).resolves.toBe("super-secret-value");
  });

  it("returns null when revealing an unknown key", async () => {
    const manager = new SecretManager({ cipher: reversibleCipher });
    await expect(manager.reveal("missing")).resolves.toBeNull();
  });

  it("refuses to persist when the cipher returns plaintext", async () => {
    const identity: SecretCipher = { encrypt: (p) => p, decrypt: (c) => c };
    const store = inMemorySecretStore();
    const manager = new SecretManager({ cipher: identity, store });

    await expect(manager.set("k", "leak-me")).rejects.toBeInstanceOf(AppError);
    await expect(store.has("k")).resolves.toBe(false);
  });
});

describe("aesGcmSecretCipher", () => {
  it("round-trips and never equals the plaintext", () => {
    const cipher = aesGcmSecretCipher(randomBytes(32));
    const plaintext = "another-secret";
    const ciphertext = cipher.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => aesGcmSecretCipher(randomBytes(16))).toThrow(AppError);
  });
});

describe("streetSecretCipher", () => {
  it("delegates encrypt/decrypt to the StreetJS secret interface", () => {
    const calls: string[] = [];
    const cipher = streetSecretCipher({
      encrypt: (p) => {
        calls.push(`e:${p}`);
        return `E(${p})`;
      },
      decrypt: (c) => {
        calls.push(`d:${c}`);
        return c;
      },
    });
    expect(cipher.encrypt("x")).toBe("E(x)");
    cipher.decrypt("E(x)");
    expect(calls).toEqual(["e:x", "d:E(x)"]);
  });
});
