/**
 * Sanity unit tests for {@link AnalyticsService}. These cover representative
 * happy-path and rejection cases; the exhaustive correctness properties live in
 * the dedicated property tests (tasks 34.2–34.4).
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { ViewEventRecord } from "@streetstudio/database";
import {
  AnalyticsService,
  type AnalyticsAuthorizer,
  type ViewEventStore,
  type VideoOrganizationResolver,
} from "./service.js";

const ORG_A = "11111111-1111-4111-8111-111111111111" as Uuid;
const ORG_B = "22222222-2222-4222-8222-222222222222" as Uuid;
const VIDEO = "33333333-3333-4333-8333-333333333333" as Uuid;
const MEMBER_1 = "44444444-4444-4444-8444-444444444444" as Uuid;
const MEMBER_2 = "55555555-5555-4555-8555-555555555555" as Uuid;

function inMemoryStore(seed: ViewEventRecord[] = []): ViewEventStore & {
  events: ViewEventRecord[];
} {
  const events = [...seed];
  return {
    events,
    async record(event) {
      events.push(event);
    },
    async listByOrganization(organizationId) {
      return events.filter((e) => e.organizationId === organizationId);
    },
  };
}

const resolverFor = (orgByVideo: Record<Uuid, Uuid>): VideoOrganizationResolver => ({
  async organizationOf(videoId) {
    return orgByVideo[videoId] ?? null;
  },
});

const authorizer = (allow: boolean): AnalyticsAuthorizer => ({
  async isAdministrator() {
    return allow;
  },
});

describe("AnalyticsService.recordView", () => {
  it("records a view scoped to the video's owning organization", async () => {
    const store = inMemoryStore();
    const service = new AnalyticsService({
      store,
      videos: resolverFor({ [VIDEO]: ORG_A }),
      authorizer: authorizer(true),
    });

    await service.recordView(MEMBER_1, VIDEO, new Date("2024-01-01T00:00:00.000Z"));

    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      organizationId: ORG_A,
      videoId: VIDEO,
      memberId: MEMBER_1,
      at: "2024-01-01T00:00:00.000Z",
    });
  });

  it("rejects a view of an unknown video without recording", async () => {
    const store = inMemoryStore();
    const service = new AnalyticsService({
      store,
      videos: resolverFor({}),
      authorizer: authorizer(true),
    });

    await expect(
      service.recordView(MEMBER_1, VIDEO, new Date("2024-01-01T00:00:00.000Z")),
    ).rejects.toThrow(AppError);
    expect(store.events).toHaveLength(0);
  });
});

describe("AnalyticsService.aggregate", () => {
  const range = {
    start: new Date("2024-01-01T00:00:00.000Z"),
    end: new Date("2024-01-31T23:59:59.999Z"),
  };

  function seededService(allowAdmin: boolean) {
    const store = inMemoryStore([
      event(ORG_A, MEMBER_1, "2024-01-05T00:00:00.000Z"),
      event(ORG_A, MEMBER_1, "2024-01-06T00:00:00.000Z"),
      event(ORG_A, MEMBER_2, "2024-01-07T00:00:00.000Z"),
      event(ORG_A, MEMBER_1, "2024-02-01T00:00:00.000Z"), // out of range
      event(ORG_B, MEMBER_1, "2024-01-05T00:00:00.000Z"), // other org
    ]);
    return new AnalyticsService({
      store,
      videos: resolverFor({}),
      authorizer: authorizer(allowAdmin),
    });
  }

  it("computes metrics scoped to the org and range, excluding other orgs", async () => {
    const service = seededService(true);

    const metrics = await service.aggregate({ memberId: MEMBER_1 }, ORG_A, range);

    expect(metrics.totalViews).toBe(3);
    expect(metrics.distinctViewers).toBe(2);
    expect(metrics.totalWatchDuration).toBe(0);
  });

  it("denies a non-administrator with no data returned", async () => {
    const service = seededService(false);
    await expect(
      service.aggregate({ memberId: MEMBER_1 }, ORG_A, range),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rejects an invalid range (end precedes start)", async () => {
    const service = seededService(true);
    await expect(
      service.aggregate({ memberId: MEMBER_1 }, ORG_A, {
        start: new Date("2024-02-01T00:00:00.000Z"),
        end: new Date("2024-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

function event(
  organizationId: Uuid,
  memberId: Uuid,
  at: string,
): ViewEventRecord {
  return {
    id: `${organizationId}-${memberId}-${at}` as Uuid,
    organizationId,
    videoId: VIDEO,
    memberId,
    at: at as ViewEventRecord["at"],
  };
}
