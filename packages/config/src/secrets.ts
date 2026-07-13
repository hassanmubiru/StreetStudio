/**
 * Secret storage via the StreetJS secret interface (Requirement 29.2).
 *
 * Every secret the platform persists — signing keys, plugin credentials,
 * provider tokens — is stored in encrypted form and is never written in
 * plaintext (R29.2, Property 86). Encryption is delegated to the StreetJS
 * secret-management interface, which the composition root (`apps/api`) obtains
 * through the `@streetjs/core` public entry point. To keep this package free of
 * a hard dependency on the optional `@streetjs/core` peer, the manager is
 * written against a minimal structural {@link SecretCipher} seam; the
 * composition root adapts the concrete StreetJS secret manager with
 * {@link streetSecretCipher}.
 *
 * The {@link SecretManager} guarantees, defensively, that the value it hands to
 * its {@link SecretStore} is never byte-equal to the plaintext it was given: if
 * a misconfigured cipher returns its input unchanged, the store call is aborted
 * with `CONFIGURATION_INVALID` rather than persisting a plaintext secret.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@streetstudio/shared";

/**
 * The StreetJS secret-management interface, reduced to the two operations this
 * package relies on. The concrete object is obtained by the composition root
 * through the `@streetjs/core` public entry point and adapted with
 * {@link streetSecretCipher}.
 *
 * `encrypt` MUST return a representation from which `decrypt` can recover the
 * original plaintext, and which is never equal to the plaintext itself.
 */
export interface SecretCipher {
  /** Encrypt `plaintext`, returning an opaque, non-plaintext representation. */
  encrypt(plaintext: string): string;
  /** Recover the original plaintext from a value produced by {@link encrypt}. */
  decrypt(ciphertext: string): string;
}

/** The subset of the StreetJS secret interface {@link streetSecretCipher} adapts. */
export interface StreetSecretInterface {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/** Adapt a concrete StreetJS secret manager into a {@link SecretCipher}. */
export function streetSecretCipher(
  secrets: StreetSecretInterface
): SecretCipher {
  return {
    encrypt: (plaintext: string): string => secrets.encrypt(plaintext),
    decrypt: (ciphertext: string): string => secrets.decrypt(ciphertext),
  };
}

/**
 * Persistence port for encrypted secrets. The manager only ever hands this
 * ciphertext, never plaintext, so any backing store (database, file, KMS
 * envelope) holds encrypted values exclusively.
 */
export interface SecretStore {
  /** Persist `ciphertext` under `key`, replacing any prior value. */
  set(key: string, ciphertext: string): Promise<void>;
  /** Return the stored ciphertext for `key`, or null when absent. */
  get(key: string): Promise<string | null>;
  /** True iff a value is stored under `key`. */
  has(key: string): Promise<boolean>;
  /** Remove any value stored under `key`. */
  delete(key: string): Promise<void>;
}

/** Dependencies required to construct a {@link SecretManager}. */
export interface SecretManagerDeps {
  /** The StreetJS-backed encryption seam. */
  readonly cipher: SecretCipher;
  /** Encrypted-secret persistence port; defaults to an in-memory store. */
  readonly store?: SecretStore;
}

/**
 * Stores and retrieves secrets, encrypting through the injected
 * {@link SecretCipher} on the way in and decrypting on the way out. The
 * persisted representation is always ciphertext and never the plaintext
 * (R29.2, Property 86).
 */
export class SecretManager {
  private readonly cipher: SecretCipher;
  private readonly store: SecretStore;

  constructor(deps: SecretManagerDeps) {
    this.cipher = deps.cipher;
    this.store = deps.store ?? inMemorySecretStore();
  }

  /**
   * Encrypt `plaintext` and persist only the ciphertext under `key`. If the
   * cipher returns a value equal to the plaintext (a misconfiguration), the
   * secret is NOT persisted and `CONFIGURATION_INVALID` is thrown, so a
   * plaintext secret can never reach the store (R29.2).
   */
  async set(key: string, plaintext: string): Promise<void> {
    const ciphertext = this.cipher.encrypt(plaintext);
    if (ciphertext === plaintext) {
      // Defensive: never persist a plaintext-equal representation (R29.2).
      throw new AppError("CONFIGURATION_INVALID", {
        details: { reason: "secret cipher produced a plaintext representation" },
      });
    }
    await this.store.set(key, ciphertext);
  }

  /**
   * Retrieve and decrypt the secret stored under `key`, or return null when no
   * secret is stored.
   */
  async reveal(key: string): Promise<string | null> {
    const ciphertext = await this.store.get(key);
    if (ciphertext === null) {
      return null;
    }
    return this.cipher.decrypt(ciphertext);
  }

  /** True iff a secret is stored under `key`. */
  has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /** Remove the secret stored under `key`. */
  delete(key: string): Promise<void> {
    return this.store.delete(key);
  }
}

/** A simple in-memory {@link SecretStore}, holding ciphertext only. */
export function inMemorySecretStore(): SecretStore {
  const values = new Map<string, string>();
  return {
    async set(key: string, ciphertext: string): Promise<void> {
      values.set(key, ciphertext);
    },
    async get(key: string): Promise<string | null> {
      return values.has(key) ? (values.get(key) as string) : null;
    },
    async has(key: string): Promise<boolean> {
      return values.has(key);
    },
    async delete(key: string): Promise<void> {
      values.delete(key);
    },
  };
}

/**
 * A concrete AES-256-GCM {@link SecretCipher} for hosts without a StreetJS
 * secret manager (tests, local/self-hosted deployments). The output is
 * `"<ivHex>:<tagHex>:<cipherHex>"`; a fresh random IV per call means the same
 * plaintext encrypts to different ciphertexts and never equals the plaintext.
 *
 * @param key 32-byte encryption key. Callers supply a key derived from
 *            configuration; it is never persisted alongside the ciphertext.
 */
export function aesGcmSecretCipher(key: Buffer): SecretCipher {
  if (key.length !== 32) {
    throw new AppError("CONFIGURATION_INVALID", {
      details: { reason: "secret encryption key must be 32 bytes" },
    });
  }
  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([
        cipher.update(Buffer.from(plaintext, "utf8")),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [
        iv.toString("hex"),
        tag.toString("hex"),
        enc.toString("hex"),
      ].join(":");
    },
    decrypt(ciphertext: string): string {
      const parts = ciphertext.split(":");
      if (parts.length !== 3) {
        throw new AppError("CONFIGURATION_INVALID", {
          details: { reason: "malformed ciphertext" },
        });
      }
      const [ivHex, tagHex, encHex] = parts as [string, string, string];
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivHex, "hex")
      );
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(encHex, "hex")),
        decipher.final(),
      ]);
      return dec.toString("utf8");
    },
  };
}
