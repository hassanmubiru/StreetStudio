import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import {
  AuthRequiredGuard,
  PublicEndpointRegistry,
  type AuthStatus,
  type EndpointId,
} from "./auth-required.js";

/**
 * Property 87: Non-public endpoints deny unauthenticated access.
 *
 * Feature: streetstudio, Property 87: Non-public endpoints deny unauthenticated access
 *
 * Validates: Requirements 29.4, 29.5
 *
 * For any request that is unauthenticated or presents invalid authentication
 * against a non-public endpoint, the request is denied with an authentication
 * error and performs no state change (R29.4). A non-public endpoint is allowed
 * only when authentication succeeded. A request to a registered public endpoint
 * is always allowed regardless of auth status (R29.5). The guard is
 * default-closed: an endpoint that is not registered as public is treated as
 * non-public.
 */

/** Arbitrary HTTP-ish method token (mixed case to exercise normalization). */
const methodArb: fc.Arbitrary<string> = fc.constantFrom(
  "GET",
  "get",
  "POST",
  "post",
  "PUT",
  "DELETE",
  "delete",
  "PATCH"
);

/** Arbitrary route path/template. */
const pathArb: fc.Arbitrary<string> = fc.constantFrom(
  "/health",
  "/videos",
  "/videos/:id",
  "/share/:token",
  "/orgs",
  "/orgs/:id/members",
  "/",
  "/metrics",
  "/webhooks/:id"
);

const endpointArb: fc.Arbitrary<EndpointId> = fc.record({
  method: methodArb,
  path: pathArb,
});

/** Arbitrary authentication outcome. */
const authArb: fc.Arbitrary<AuthStatus> = fc.oneof(
  fc.record({
    kind: fc.constant("authenticated" as const),
    principal: fc.record({ id: fc.string() }),
  }),
  fc.constant<AuthStatus>({ kind: "unauthenticated" }),
  fc.constant<AuthStatus>({ kind: "invalid" })
);

describe("Feature: streetstudio, Property 87: Non-public endpoints deny unauthenticated access", () => {
  it("allows non-public endpoints only when authenticated, and denies unauthenticated/invalid auth with an authentication error", () => {
    fc.assert(
      fc.property(
        // The set of endpoints registered as public.
        fc.array(endpointArb, { minLength: 0, maxLength: 6 }),
        // The endpoint being requested.
        endpointArb,
        // The authentication outcome for this request.
        authArb,
        (publicList, request, auth) => {
          const registry = new PublicEndpointRegistry(publicList);
          const guard = new AuthRequiredGuard(registry);

          const isPublic = registry.isPublic(request.method, request.path);
          const decision = guard.evaluate({ ...request, auth });

          // The guard's `public` flag reflects the registry (default-closed).
          expect(decision.public).toBe(isPublic);

          if (isPublic) {
            // R29.5: a registered public endpoint is always allowed regardless
            // of auth status, and carries no authentication error.
            expect(decision.allowed).toBe(true);
            expect(decision.errorCode).toBeUndefined();
            // enforce must not throw for an allowed request.
            expect(() => guard.enforce({ ...request, auth })).not.toThrow();
            return;
          }

          // Non-public endpoint (R29.4): allowed iff authenticated.
          if (auth.kind === "authenticated") {
            expect(decision.allowed).toBe(true);
            expect(decision.errorCode).toBeUndefined();
            expect(() => guard.enforce({ ...request, auth })).not.toThrow();
          } else {
            // Unauthenticated or invalid auth: denied with an authentication
            // error, and enforce throws before any state change runs.
            expect(decision.allowed).toBe(false);
            const expectedCode =
              auth.kind === "unauthenticated"
                ? "AUTHENTICATION_REQUIRED"
                : "AUTHENTICATION_FAILED";
            expect(decision.errorCode).toBe(expectedCode);

            let thrown: unknown;
            try {
              guard.enforce({ ...request, auth });
              expect.unreachable("expected enforce to throw an authentication error");
            } catch (err) {
              thrown = err;
            }
            expect(thrown).toBeInstanceOf(AppError);
            expect((thrown as AppError).code).toBe(expectedCode);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("is default-closed: an unregistered endpoint is treated as non-public and denies unauthenticated access", () => {
    fc.assert(
      fc.property(endpointArb, (request) => {
        // A guard with no registered public endpoints.
        const guard = new AuthRequiredGuard();
        const decision = guard.evaluate({ ...request, auth: { kind: "unauthenticated" } });
        expect(decision.public).toBe(false);
        expect(decision.allowed).toBe(false);
        expect(decision.errorCode).toBe("AUTHENTICATION_REQUIRED");
      }),
      { numRuns: 200 }
    );
  });
});
