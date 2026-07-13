import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { signPayload, verifySignature, SIGNATURE_HEADER } from "./signature.js";

/**
 * Property 61: Webhook deliveries are signed and verifiable.
 *
 * Feature: streetstudio, Property 61: Webhook deliveries are signed and verifiable
 *
 * Validates: Requirements 19.4
 *
 * For any webhook delivery payload, the signature produced by signPayload
 * verifies against the subscription's signing secret for the unmodified payload
 * (round-trip), and fails verification for any tampered payload, incorrect
 * secret, or malformed/altered signature.
 */

/** Non-empty secrets: an HMAC key of any string content. */
const secretArb = fc.string({ minLength: 1 });

/** Arbitrary payloads, including empty and unicode content. */
const payloadArb = fc.string();

describe("Feature: streetstudio, Property 61: Webhook deliveries are signed and verifiable", () => {
  // Sub-property A: round-trip — a signature produced under a secret always
  // verifies against that same secret and unmodified payload.
  it("verifies a signature produced by the same secret and unmodified payload", () => {
    fc.assert(
      fc.property(secretArb, payloadArb, (secret, payload) => {
        const signature = signPayload(secret, payload);
        expect(verifySignature(secret, payload, signature)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  // Sub-property B: a wrong (different) secret never verifies a valid signature.
  it("rejects a signature when the secret differs", () => {
    fc.assert(
      fc.property(
        secretArb,
        secretArb,
        payloadArb,
        (secret, otherSecret, payload) => {
          // Only meaningful when the secrets actually differ.
          fc.pre(secret !== otherSecret);
          const signature = signPayload(secret, payload);
          expect(verifySignature(otherSecret, payload, signature)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Sub-property C: an altered payload never verifies against the original
  // signature (integrity).
  it("rejects a signature when the payload is altered", () => {
    fc.assert(
      fc.property(
        secretArb,
        payloadArb,
        payloadArb,
        (secret, payload, otherPayload) => {
          // Only meaningful when the payloads actually differ.
          fc.pre(payload !== otherPayload);
          const signature = signPayload(secret, payload);
          expect(verifySignature(secret, otherPayload, signature)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Sub-property D: a malformed or altered signature never verifies.
  it("rejects malformed or altered signatures", () => {
    fc.assert(
      fc.property(
        secretArb,
        payloadArb,
        // A tampering transform applied to the valid signature.
        fc.constantFrom<"flipHexChar" | "truncate" | "append" | "nonHex" | "empty">(
          "flipHexChar",
          "truncate",
          "append",
          "nonHex",
          "empty"
        ),
        (secret, payload, mode) => {
          const valid = signPayload(secret, payload);
          let tampered: string;
          switch (mode) {
            case "flipHexChar": {
              // Change the first hex nibble to a different hex digit.
              const first = valid[0];
              const replacement = first === "a" ? "b" : "a";
              tampered = replacement + valid.slice(1);
              break;
            }
            case "truncate":
              // Drop the last two hex chars (one byte) — length mismatch.
              tampered = valid.slice(0, -2);
              break;
            case "append":
              // Add an extra byte — length mismatch.
              tampered = valid + "ab";
              break;
            case "nonHex":
              // Replace with clearly non-hex characters of the same length.
              tampered = "z".repeat(valid.length);
              break;
            case "empty":
              tampered = "";
              break;
          }
          // A tampered signature that happens to equal the valid one (only
          // possible for the flip case if valid was empty, which it never is)
          // would be a false negative; guard against it.
          fc.pre(tampered !== valid);
          expect(verifySignature(secret, payload, tampered)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  // The signature header constant is exported for delivery to attach the digest.
  it("exposes a stable signature header name", () => {
    expect(typeof SIGNATURE_HEADER).toBe("string");
    expect(SIGNATURE_HEADER.length).toBeGreaterThan(0);
  });
});
