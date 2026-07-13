import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { AccessControl, Action, AuthContext } from "@streetstudio/auth";
import {
  ContentPermissionGuard,
  type ContentResourceRef,
  type ContentResourceType,
} from "./share.js";

/**
 * Property 48: Content permission is required for resource access.
 *
 * Feature: streetstudio, Property 48: Content permission is required for resource access
 *
 * Validates: Requirements 15.4
 *
 * For any request that reads or modifies a Video, Asset, Comment, or Folder from
 * a requester lacking the required content permission, the request is rejected
 * with an access-denied error and the resource is left unchanged (R15.4).
 *
 * The enforcement point is {@link ContentPermissionGuard.enforce}, which
 * consults the injected {@link AccessControl} evaluator in the resource's owning
 * Organization scope and throws `AUTHORIZATION_DENIED` when the requester is not
 * permitted. This test wires the guard ahead of an in-memory resource store the
 * way a real read/modify handler would: the store operation runs ONLY after the
 * guard resolves. Consequently, when the guard denies, the operation never runs
 * and the resource is byte-for-byte unchanged.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A content resource whose read/modify is gated by content permission (R15.4). */
interface ResourceState {
  readonly type: ContentResourceType;
  readonly id: Uuid;
  readonly organizationId: Uuid;
  /** Mutable payload used to detect whether a modify actually took effect. */
  value: number;
}

/**
 * A minimal, in-memory content store. Its read and modify operations are gated
 * by a {@link ContentPermissionGuard}: the underlying access happens strictly
 * after `enforce` resolves, mirroring a real handler.
 */
class GuardedContentStore {
  private readonly resources = new Map<Uuid, ResourceState>();

  constructor(private readonly guard: ContentPermissionGuard) {}

  seed(resource: ResourceState): void {
    this.resources.set(resource.id, { ...resource });
  }

  /** Snapshot the stored resource for before/after comparison. */
  snapshot(id: Uuid): string {
    return JSON.stringify(this.resources.get(id) ?? null);
  }

  /** Guarded read: returns the resource only if content permission is granted. */
  async read(
    actor: AuthContext,
    action: Action,
    ref: ContentResourceRef,
  ): Promise<ResourceState> {
    await this.guard.enforce(actor, action, ref);
    const found = this.resources.get(ref.id as Uuid);
    if (!found) throw new AppError("NOT_FOUND");
    return { ...found };
  }

  /** Guarded modify: mutates the resource only if content permission is granted. */
  async modify(
    actor: AuthContext,
    action: Action,
    ref: ContentResourceRef,
    nextValue: number,
  ): Promise<ResourceState> {
    await this.guard.enforce(actor, action, ref);
    const found = this.resources.get(ref.id as Uuid);
    if (!found) throw new AppError("NOT_FOUND");
    found.value = nextValue;
    return { ...found };
  }
}

/**
 * An {@link AccessControl} that grants a fixed allowlist of actions and records
 * each (action, organizationId) pair it was consulted with, so the test can
 * confirm the gate is driven by the requested content permission in the
 * resource's owning Organization scope.
 */
function decisionAccess(granted: ReadonlySet<string>): {
  access: AccessControl;
  calls: Array<{ action: string; organizationId: Uuid | undefined }>;
} {
  const calls: Array<{ action: string; organizationId: Uuid | undefined }> = [];
  const access: AccessControl = {
    async can(_ctx, action, resource) {
      calls.push({ action, organizationId: resource?.organizationId });
      return granted.has(action);
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
  return { access, calls };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;
const resourceType: fc.Arbitrary<ContentResourceType> = fc.constantFrom(
  "video",
  "asset",
  "comment",
  "folder",
);
/** A free-form content action (read or modify), e.g. "content:read". */
const action = fc.constantFrom(
  "content:read",
  "content:update",
  "content:delete",
  "content:comment",
);
const value = fc.integer();

/* -------------------------------------------------------------------------
 * Property 48
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 48: Content permission is required for resource access", () => {
  it("denies reads without content permission with AUTHORIZATION_DENIED and no change to the resource; permits otherwise", async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceType,
        uuid,
        uuid,
        uuid,
        action,
        value,
        fc.boolean(),
        async (type, orgId, resourceId, memberId, act, initial, allowed) => {
          const grant = allowed ? new Set([act]) : new Set<string>();
          const { access, calls } = decisionAccess(grant);
          const store = new GuardedContentStore(
            new ContentPermissionGuard(access),
          );
          store.seed({ type, id: resourceId, organizationId: orgId, value: initial });
          const actor: AuthContext = { memberId };
          const ref: ContentResourceRef = { type, id: resourceId, organizationId: orgId };

          const before = store.snapshot(resourceId);
          if (allowed) {
            const read = await store.read(actor, act, ref);
            expect(read.id).toBe(resourceId);
            expect(read.value).toBe(initial);
          } else {
            await expect(store.read(actor, act, ref)).rejects.toMatchObject({
              code: "AUTHORIZATION_DENIED",
            });
          }
          // A read never mutates, and a denied read certainly must not (R15.4).
          expect(store.snapshot(resourceId)).toBe(before);

          // The gate was consulted for the requested action in the resource's
          // owning Organization scope.
          expect(calls).toContainEqual({ action: act, organizationId: orgId });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("denies modifies without content permission with AUTHORIZATION_DENIED and no change to the resource; applies the change otherwise", async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceType,
        uuid,
        uuid,
        uuid,
        action,
        value,
        value,
        fc.boolean(),
        async (type, orgId, resourceId, memberId, act, initial, next, allowed) => {
          const grant = allowed ? new Set([act]) : new Set<string>();
          const { access, calls } = decisionAccess(grant);
          const store = new GuardedContentStore(
            new ContentPermissionGuard(access),
          );
          store.seed({ type, id: resourceId, organizationId: orgId, value: initial });
          const actor: AuthContext = { memberId };
          const ref: ContentResourceRef = { type, id: resourceId, organizationId: orgId };

          const before = store.snapshot(resourceId);
          if (allowed) {
            const updated = await store.modify(actor, act, ref, next);
            expect(updated.value).toBe(next);
            // The modify took effect exactly.
            expect(store.snapshot(resourceId)).toBe(
              JSON.stringify({ type, id: resourceId, organizationId: orgId, value: next }),
            );
          } else {
            await expect(
              store.modify(actor, act, ref, next),
            ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
            // Denial makes no change to the resource (R15.4).
            expect(store.snapshot(resourceId)).toBe(before);
          }

          expect(calls).toContainEqual({ action: act, organizationId: orgId });
        },
      ),
      { numRuns: 100 },
    );
  });
});
