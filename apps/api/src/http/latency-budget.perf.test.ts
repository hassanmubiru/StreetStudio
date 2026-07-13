/**
 * Performance / latency-budget category test (task 41.2, Requirements 32.1, 32.4).
 *
 * This is the CI "performance benchmark" category (`*.perf.test.ts`). Rather
 * than timing a wall clock (which is flaky under CI contention), it asserts a
 * DETERMINISTIC proxy for latency: the amount of downstream work each operation
 * performs. A request's latency budget is only meaningful if the work it does
 * is bounded and does not grow super-linearly with load, so the tests count the
 * collaborator calls a request makes and assert they stay within a fixed budget
 * and scale linearly across a batch.
 *
 * Two budgets are checked:
 *
 *  1. API request pipeline — a single public request performs a bounded, fixed
 *     number of steps: one authentication, at most one authorization check, one
 *     service invocation, and at most one audit write. A batch of N requests
 *     performs exactly N times that work (linear, no blow-up).
 *  2. Media pipeline — processing a video performs a bounded number of
 *     persistence writes: two status transitions plus one thumbnail, one
 *     preview, and one write per rendition — never more.
 *
 * All seams are in-memory and counted, so the "benchmark" is exact and stable.
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type {
  AccessControl,
  Action,
  AuthContext,
  ResourceRef,
  RoleName,
} from "@streetstudio/auth";
import {
  MediaPipeline,
  type ProcessingStatusEvent,
  type ProcessingStore,
  type Transcoder,
  type TranscodeOutput,
} from "@streetstudio/processing";
import { createApiService, type HandlerResolver } from "./composition-root.js";
import type {
  ApiRequest,
  AuditEvent,
  AuditSink,
  Authenticator,
  ServiceInvocation,
} from "./lifecycle.js";
import type { AuthStatus } from "../security/auth-required.js";
import type { PublicOperation } from "./operations.js";
import { RateLimiter } from "../security/rate-limiter.js";

/* -------------------------------------------------------------------------- */
/* Counting collaborators                                                     */
/* -------------------------------------------------------------------------- */

interface Counters {
  authenticate: number;
  can: number;
  audit: number;
  handle: number;
}

function countingAuthenticator(principal: AuthContext, counters: Counters): Authenticator {
  return {
    async authenticate(_req: ApiRequest): Promise<AuthStatus> {
      counters.authenticate += 1;
      return { kind: "authenticated", principal };
    },
  };
}

function countingAccessControl(granted: ReadonlySet<Action>, counters: Counters): AccessControl {
  return {
    async can(_ctx: AuthContext, action: Action, _res: ResourceRef): Promise<boolean> {
      counters.can += 1;
      return granted.has(action);
    },
    async assignRole(_a: AuthContext, _o: Uuid, _m: Uuid, _r: RoleName): Promise<void> {},
  };
}

function countingAuditSink(counters: Counters, log: AuditEvent[]): AuditSink {
  return {
    record(event: AuditEvent): void {
      counters.audit += 1;
      log.push(event);
    },
  };
}

const RBAC_OP: PublicOperation = {
  id: "perf.mutate",
  channel: "rest",
  method: "POST",
  path: "/perf",
  authz: { kind: "rbac", action: "project:create", resourceType: "resource" },
};

function buildService(granted: ReadonlySet<Action>) {
  const counters: Counters = { authenticate: 0, can: 0, audit: 0, handle: 0 };
  const audits: AuditEvent[] = [];
  const principal: AuthContext = { memberId: "00000000-0000-4000-8000-000000000001" as Uuid };

  const handlers: HandlerResolver = {
    resolve(_id: string): ServiceInvocation {
      return async () => {
        counters.handle += 1;
        return { ok: true };
      };
    },
  };

  const service = createApiService({
    container: { resolve: () => undefined, has: () => true },
    handlers,
    rateLimiter: new RateLimiter({ limit: 1_000_000 }),
    authenticator: countingAuthenticator(principal, counters),
    accessControl: countingAccessControl(granted, counters),
    auditSink: countingAuditSink(counters, audits),
    operations: [RBAC_OP],
  });

  return { service, counters, audits };
}

function request(): ApiRequest {
  return {
    method: "POST",
    path: "/perf",
    clientKey: "perf-client",
    credential: "token",
    organizationId: "00000000-0000-4000-8000-0000000000aa" as Uuid,
    params: {},
  };
}

/* -------------------------------------------------------------------------- */
/* 1. API request pipeline budget                                             */
/* -------------------------------------------------------------------------- */

describe("Perf — a single API request performs a bounded, fixed amount of work", () => {
  it("an authorized mutating request does 1 auth + 1 authz + 1 service + 1 audit", async () => {
    const { service, counters } = buildService(new Set<Action>(["project:create"]));
    await service.router.dispatch(request());

    expect(counters.authenticate).toBe(1);
    expect(counters.can).toBe(1);
    expect(counters.handle).toBe(1);
    expect(counters.audit).toBe(1); // one success audit for the mutating op
  });

  it("a denied request short-circuits: 1 auth + 1 authz, NO service work, 1 denial audit", async () => {
    const { service, counters } = buildService(new Set<Action>()); // grant nothing
    await expect(service.router.dispatch(request())).rejects.toBeInstanceOf(AppError);

    expect(counters.authenticate).toBe(1);
    expect(counters.can).toBe(1);
    expect(counters.handle).toBe(0); // service never ran — latency saved
    expect(counters.audit).toBe(1); // one denial audit
  });

  it("work scales linearly with request count (no super-linear blow-up)", async () => {
    const N = 200;
    const { service, counters } = buildService(new Set<Action>(["project:create"]));
    for (let i = 0; i < N; i++) {
      await service.router.dispatch(request());
    }
    // Exactly one of each step per request — total is a linear function of N.
    expect(counters.authenticate).toBe(N);
    expect(counters.can).toBe(N);
    expect(counters.handle).toBe(N);
    expect(counters.audit).toBe(N);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Media pipeline write budget                                             */
/* -------------------------------------------------------------------------- */

interface StoredVideo {
  id: string;
  organizationId: string;
  folderId: string | null;
  title: string;
  durationSeconds: number;
  status: string;
  sourceObjectKey: string | null;
  developerMode: boolean;
  createdAt: string;
}

function pipelineCountStore(): {
  store: ProcessingStore;
  writes: { status: number; asset: number; rendition: number };
} {
  const writes = { status: 0, asset: 0, rendition: 0 };
  let video: StoredVideo = {
    id: "v1",
    organizationId: "o1",
    folderId: null,
    title: "t",
    durationSeconds: 100,
    status: "uploading",
    sourceObjectKey: "src.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  const store: ProcessingStore = {
    findVideo: async (o, id) =>
      video.organizationId === o && video.id === id ? (video as never) : null,
    findVideoById: async (id) => (video.id === id ? (video as never) : null),
    setVideoStatus: async (v, status) => {
      writes.status += 1;
      video = { ...(v as StoredVideo), status };
      return video as never;
    },
    insertAsset: async (record) => {
      writes.asset += 1;
      return record;
    },
    insertRendition: async (record) => {
      writes.rendition += 1;
      return record;
    },
  };
  return { store, writes };
}

const perfTranscoder = (renditions: number): Transcoder => ({
  async transcode(source): Promise<TranscodeOutput> {
    return {
      thumbnail: { objectKey: `${source.videoId}/t.jpg` },
      preview: { objectKey: `${source.videoId}/p.mp4`, durationSeconds: 5 },
      renditions: Array.from({ length: renditions }, (_, i) => ({
        quality: `q${i}`,
        objectKey: `${source.videoId}/r${i}`,
        bitrate: 1_000_000 * (i + 1),
      })),
    };
  },
});

describe("Perf — media pipeline performs a bounded number of persistence writes", () => {
  it("a successful run writes exactly 2 status transitions, 2 assets, and one row per rendition", async () => {
    const { store, writes } = pipelineCountStore();
    const events: ProcessingStatusEvent[] = [];
    const RENDITIONS = 3;
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: perfTranscoder(RENDITIONS),
      emitter: { emit: (e) => void events.push(e) },
      options: {
        clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
        newId: (() => {
          let n = 0;
          return () => `id-${++n}`;
        })(),
      },
    });

    await pipeline.process({ videoId: "v1", organizationId: "o1" });

    // processing → ready = 2 transitions; 1 thumbnail + 1 preview = 2 assets;
    // exactly one write per rendition. Nothing more.
    expect(writes.status).toBe(2);
    expect(writes.asset).toBe(2);
    expect(writes.rendition).toBe(RENDITIONS);
    // Total persistence writes are bounded by a small linear function.
    const total = writes.status + writes.asset + writes.rendition;
    expect(total).toBe(2 + 2 + RENDITIONS);
  });
});
