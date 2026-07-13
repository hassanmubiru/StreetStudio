import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { PullRequestLinkDto, Uuid } from "@streetstudio/shared";
import type {
  PullRequestLinkRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  ReviewService,
  LINK_PULL_REQUEST_PERMISSION,
  type CommentPoster,
  type PrRef,
  type ResolvedPullRequest,
  type ReviewStore,
  type SourceControlAccess,
} from "./review.js";

/**
 * Property 70: Pull-request links require an enabled plugin and permission.
 *
 * Feature: streetstudio, Property 70: Pull-request links require an enabled plugin and permission
 *
 * Validates: Requirements 24.1, 24.4, 24.6
 *
 * For any attempt to link a Video to a pull request,
 * {@link ReviewService.linkPullRequest} stores the association (and returns the
 * resulting link DTO) IF AND ONLY IF all three hold:
 *
 *   - the source-control Plugin is enabled AND
 *   - the referenced pull request / repository is accessible through it AND
 *   - the Member holds link permission in the Video's owning Organization.
 *
 * The plugin-enabled + accessible conditions are collapsed into the single
 * {@link SourceControlAccess.resolvePullRequest} seam, which returns a
 * {@link ResolvedPullRequest} exactly when the plugin is enabled AND the PR is
 * accessible, and `null` otherwise (R24.4). Link permission is evaluated through
 * the {@link AccessControl} seam (R24.6). When the Member links through an
 * enabled, accessible plugin with permission, the association is stored and
 * returned (R24.1). In every other combination the request is rejected and no
 * association is created (R24.4, R24.6): a permission failure yields
 * `AUTHORIZATION_DENIED` and an inaccessible / disabled-plugin reference yields
 * `NOT_FOUND`.
 */

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const LINK: Uuid = "44444444-4444-4444-4444-444444444444";
const PLUGIN: Uuid = "55555555-5555-5555-5555-555555555555";

const actor: AuthContext = { memberId: MEMBER };

function video(): VideoRecord {
  return {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

interface Fakes {
  review: ReviewService;
  /** PR-link records actually persisted through the store. */
  links: PullRequestLinkRecord[];
  /** Number of times the source-control seam was consulted. */
  probes: () => number;
}

/**
 * Wire a {@link ReviewService} whose behaviour is fully determined by three
 * booleans:
 *   - `hasPermission`   → {@link AccessControl.can} result (R24.6)
 *   - `pluginEnabled`   → whether any source-control plugin vouches for the PR
 *   - `prAccessible`    → whether the PR/repository resolves through the plugin
 *
 * `resolvePullRequest` returns a resolved reference only when BOTH the plugin is
 * enabled AND the PR is accessible, and `null` otherwise — the exact contract
 * the service maps to a rejection with no association (R24.4).
 */
function makeFakes(opts: {
  hasPermission: boolean;
  pluginEnabled: boolean;
  prAccessible: boolean;
}): Fakes {
  const links: PullRequestLinkRecord[] = [];
  const vid = video();

  const store: ReviewStore = {
    async findVideo(videoId) {
      return videoId === vid.id ? vid : null;
    },
    async insertPullRequestLink(record) {
      links.push(record);
      return record;
    },
  };

  const access: AccessControl = {
    async can(_actor, permission, _resource) {
      // Only the link permission is exercised here (R24.6).
      expect(permission).toBe(LINK_PULL_REQUEST_PERMISSION);
      return opts.hasPermission;
    },
    async assignRole() {
      throw new Error("not used");
    },
  };

  let probes = 0;
  const sourceControl: SourceControlAccess = {
    async resolvePullRequest(ref: PrRef): Promise<ResolvedPullRequest | null> {
      probes += 1;
      if (opts.pluginEnabled && opts.prAccessible) {
        return { pluginId: PLUGIN, prRef: `${ref.repositoryId}#${ref.number}` };
      }
      return null;
    },
  };

  // The comment seam is unused by linkPullRequest.
  const comments: CommentPoster = {
    async post() {
      throw new Error("not used");
    },
  };

  const review = new ReviewService({
    store,
    access,
    sourceControl,
    comments,
    clock: { now: () => new Date("2024-01-01T00:00:00.000Z") },
    newId: () => LINK,
  });

  return { review, links, probes: () => probes };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

const prArb: fc.Arbitrary<PrRef> = fc.record({
  repositoryId: fc.string({ minLength: 1, maxLength: 40 }),
  number: fc.integer({ min: 1, max: 1_000_000 }),
});

const scenarioArb = fc.record({
  hasPermission: fc.boolean(),
  pluginEnabled: fc.boolean(),
  prAccessible: fc.boolean(),
  pr: prArb,
});

/* -------------------------------------------------------------------------
 * Property 70
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 70: Pull-request links require an enabled plugin and permission", () => {
  it("linkPullRequest stores an association iff the plugin is enabled, the PR is accessible, and the member holds link permission; otherwise it is rejected with no association (R24.1, R24.4, R24.6)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ hasPermission, pluginEnabled, prAccessible, pr }) => {
        const { review, links, probes } = makeFakes({
          hasPermission,
          pluginEnabled,
          prAccessible,
        });

        const resolvable = pluginEnabled && prAccessible;
        const shouldSucceed = hasPermission && resolvable;

        if (shouldSucceed) {
          const dto: PullRequestLinkDto = await review.linkPullRequest(
            actor,
            VIDEO,
            pr,
          );
          // Exactly one association stored, carrying the resolving plugin's
          // identity and its canonical reference (R24.1).
          expect(links).toHaveLength(1);
          expect(dto).toMatchObject({
            id: LINK,
            videoId: VIDEO,
            pluginId: PLUGIN,
            prRef: `${pr.repositoryId}#${pr.number}`,
          });
          expect(links[0]).toMatchObject({
            videoId: VIDEO,
            pluginId: PLUGIN,
            prRef: `${pr.repositoryId}#${pr.number}`,
          });
        } else {
          // Every other combination is rejected and stores nothing
          // (R24.4, R24.6).
          const error = await review
            .linkPullRequest(actor, VIDEO, pr)
            .then(
              () => {
                throw new Error("expected linkPullRequest to reject");
              },
              (e: unknown) => e,
            );
          expect(error).toBeInstanceOf(AppError);

          if (!hasPermission) {
            // Permission is enforced before accessibility is probed, so an
            // unauthorized caller cannot probe the PR (R24.6).
            expect((error as AppError).code).toBe("AUTHORIZATION_DENIED");
            expect(probes()).toBe(0);
          } else {
            // Permitted but the plugin is disabled or the PR is inaccessible
            // (R24.4).
            expect((error as AppError).code).toBe("NOT_FOUND");
          }
          expect(links).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
