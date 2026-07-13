/**
 * Webhook payload signing (Requirement 19.4).
 *
 * Every webhook delivery carries a cryptographic signature so the receiver can
 * verify both the authenticity (it came from a holder of the subscription's
 * signing secret) and the integrity (the bytes were not altered in transit) of
 * the payload. The scheme is HMAC-SHA256 over the exact delivered payload bytes,
 * keyed by the subscription's `signingSecret`; the hex digest is transmitted in
 * the delivery's signature header.
 *
 * Verification is the inverse and runs in constant time with respect to the
 * digest, so a mismatched signature reveals nothing through timing. A tampered
 * payload or an incorrect secret produces a different digest and fails
 * verification (Property 61).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The HMAC hash algorithm used for webhook signatures. */
const HMAC_ALGORITHM = "sha256";

/** The delivery header carrying the hex-encoded signature. */
export const SIGNATURE_HEADER = "X-StreetStudio-Signature";

/**
 * Produce the hex-encoded HMAC-SHA256 signature of `payload` under `secret`.
 * `payload` is signed as UTF-8 bytes, matching how it is transmitted.
 */
export function signPayload(secret: string, payload: string): string {
  return createHmac(HMAC_ALGORITHM, secret)
    .update(Buffer.from(payload, "utf8"))
    .digest("hex");
}

/**
 * True iff `signature` is the valid HMAC-SHA256 signature of `payload` under
 * `secret`. Any tampering with the payload, a wrong secret, or a malformed
 * signature yields false. The digest comparison is constant-time.
 */
export function verifySignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = signPayload(secret, payload);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  const expectedBuf = Buffer.from(expected, "hex");
  if (provided.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(provided, expectedBuf);
}
