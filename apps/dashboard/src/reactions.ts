/**
 * Dashboard reaction flows: add/remove reactions over the SDK, a convenience
 * `toggleReaction`, and a pure `summarizeReactions` aggregation for rendering
 * reaction chips (counts per type, and whether the current member reacted). No
 * backend logic lives here.
 */
import type { ReactionDto, ReactionTargetType, Uuid } from "@streetstudio/shared";
import type { DashboardSession } from "./session.js";

/** Identifies the thing being reacted to. */
export interface ReactionTarget {
  readonly targetType: ReactionTargetType;
  readonly targetId: Uuid;
}

/** Add a reaction of `type` to a target. */
export function addReaction(
  session: DashboardSession,
  target: ReactionTarget,
  type: string,
): Promise<ReactionDto> {
  return session.api.comments.react({ ...target, type });
}

/** Remove a reaction of `type` from a target. */
export function removeReaction(
  session: DashboardSession,
  target: ReactionTarget,
  type: string,
): Promise<void> {
  return session.api.comments.unreact({ ...target, type });
}

/**
 * Toggle a reaction: when `active` is true the reaction is removed, otherwise it
 * is added. Returns the new active state (`true` if now reacted). Lets a UI bind
 * a single handler to a chip and flip its state.
 */
export async function toggleReaction(
  session: DashboardSession,
  target: ReactionTarget,
  type: string,
  active: boolean,
): Promise<boolean> {
  if (active) {
    await removeReaction(session, target, type);
    return false;
  }
  await addReaction(session, target, type);
  return true;
}

/** Aggregated view of one reaction type on a target. */
export interface ReactionTally {
  readonly type: string;
  readonly count: number;
  /** True when `memberId` was supplied and reacted with this type. */
  readonly reactedByMe: boolean;
}

/**
 * Aggregate a flat reaction list into per-type tallies, ordered by descending
 * count then type name (stable, deterministic). When `memberId` is given, each
 * tally flags whether that member reacted with the type. Pure and
 * transport-agnostic.
 */
export function summarizeReactions(
  reactions: readonly ReactionDto[],
  memberId?: Uuid,
): readonly ReactionTally[] {
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const r of reactions) {
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    if (memberId !== undefined && r.memberId === memberId) {
      mine.add(r.type);
    }
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, reactedByMe: mine.has(type) }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
