/**
 * Dashboard sharing flows: create, inspect, resolve, and revoke share links
 * over the SDK. Includes a pure `shareLinkState` derivation so the UI can label
 * a link (active / expired / revoked / locked) without a round-trip. No backend
 * logic lives here — the server remains authoritative on resolution.
 */
import type { ShareLinkDto, VideoDto, Uuid } from "@streetstudio/shared";
import type { CreateShareLinkInput } from "@streetstudio/sdk";
import type { DashboardSession } from "./session.js";

/** Create a share link for a video (optional expiry / passcode). */
export function createShareLink(
  session: DashboardSession,
  videoId: Uuid,
  input: CreateShareLinkInput = {},
): Promise<ShareLinkDto> {
  return session.api.sharing.create(videoId, input);
}

/** Revoke a share link, stopping further resolution. */
export function revokeShareLink(
  session: DashboardSession,
  shareLinkId: Uuid,
): Promise<void> {
  return session.api.sharing.revoke(shareLinkId);
}

/**
 * Resolve a shared video by its public credential (and passcode, if the link is
 * passcode-protected). This is the recipient-side flow and needs no
 * organization scope — the credential authorizes access.
 */
export function resolveSharedVideo(
  session: DashboardSession,
  credential: string,
  passcode?: string,
): Promise<VideoDto> {
  return session.api.sharing.resolve({
    credential,
    ...(passcode !== undefined ? { passcode } : {}),
  });
}

/** The render-ready state of a share link at a point in time. */
export type ShareLinkState = "active" | "revoked" | "expired" | "locked";

/**
 * Derive a share link's current state, pure and deterministic given `now`
 * (defaults to `Date.now()`). Precedence: revoked → expired → locked → active.
 * The server remains authoritative; this only drives labelling/affordances.
 */
export function shareLinkState(
  link: ShareLinkDto,
  now: number = Date.now(),
): ShareLinkState {
  if (link.revokedAt !== undefined) {
    return "revoked";
  }
  if (link.expiresAt !== undefined && Date.parse(link.expiresAt) <= now) {
    return "expired";
  }
  if (link.lockedUntil !== undefined && Date.parse(link.lockedUntil) > now) {
    return "locked";
  }
  return "active";
}

/** Whether a share link can currently be resolved (state is `active`). */
export function isShareLinkActive(link: ShareLinkDto, now: number = Date.now()): boolean {
  return shareLinkState(link, now) === "active";
}
