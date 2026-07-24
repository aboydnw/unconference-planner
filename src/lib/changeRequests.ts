import { overlaps, sessionEndMinutes, timeToMinutes } from "@/lib/agenda";
import {
  freeTrack,
  timesOverlap,
  type GridShape,
  type Placement,
} from "@/lib/optimizer/model";
import {
  formatDay,
  formatTime,
  type ChangeRequest,
  type ChangeRequestKind,
} from "@/lib/types";

export interface CrGrid {
  days: string[];
  dayStart: string;
  dayEnd: string;
  trackIds: string[];
  blocks: { day: string; start_time: string; end_time: string }[];
  placements: Placement[];
  durations: Map<string, number | null>;
  proposerOf: Map<string, string>;
}

export interface CrInput {
  kind: ChangeRequestKind;
  proposal_id: string;
  other_proposal_id: string | null;
  target_day: string | null;
  target_start_time: string | null;
  target_track_id: string | null;
}

export type CrOutcome =
  | { ok: true; applicable: true; after: Placement[] }
  | { ok: true; applicable: false; note: string }
  | { ok: false; reason: string };

function shapeOf(grid: CrGrid): GridShape {
  return {
    days: grid.days,
    dayStart: grid.dayStart,
    dayEnd: grid.dayEnd,
    trackIds: grid.trackIds,
    blocks: grid.blocks,
  };
}

function fitsAt(
  grid: CrGrid,
  others: Placement[],
  proposalId: string,
  day: string,
  startTime: string,
  trackId: string | null,
): { ok: true; trackId: string } | { ok: false; reason: string } {
  const duration = grid.durations.get(proposalId) ?? null;
  const start = timeToMinutes(startTime);
  const end = sessionEndMinutes(startTime, duration);
  if (!grid.days.includes(day)) {
    return { ok: false, reason: "the target day is not an event day" };
  }
  if (start < timeToMinutes(grid.dayStart) || end > timeToMinutes(grid.dayEnd)) {
    return { ok: false, reason: "the session would not fit inside the daily hours" };
  }
  const hitsBlock = grid.blocks.some(
    (b) =>
      b.day === day &&
      overlaps(start, end, timeToMinutes(b.start_time), timeToMinutes(b.end_time)),
  );
  if (hitsBlock) {
    return { ok: false, reason: "the target time is reserved by a block" };
  }
  const target: Placement = { proposalId, trackId: trackId ?? "", day, startTime };
  const proposer = grid.proposerOf.get(proposalId);
  if (proposer) {
    const clash = others.some(
      (p) =>
        grid.proposerOf.get(p.proposalId) === proposer &&
        timesOverlap(target, p, grid.durations),
    );
    if (clash) {
      return { ok: false, reason: "the proposer already has a session at that time" };
    }
  }
  if (trackId) {
    const busy = others.some(
      (p) => p.trackId === trackId && timesOverlap(target, p, grid.durations),
    );
    if (busy) {
      return { ok: false, reason: "that room is already occupied at the target time" };
    }
    return { ok: true, trackId };
  }
  const free = freeTrack(shapeOf(grid), others, grid.durations, day, startTime, duration);
  if (!free) {
    return { ok: false, reason: "every room is occupied at the target time" };
  }
  return { ok: true, trackId: free };
}

/**
 * Re-evaluates a change request against the current grid: returns the resulting
 * placements when it can be applied, a note when it is valid but needs the
 * organizer to pick a slot, or the hard-constraint reason that blocks it.
 */
export function evaluateChangeRequest(cr: CrInput, grid: CrGrid): CrOutcome {
  if (!grid.durations.has(cr.proposal_id)) {
    return { ok: false, reason: "the session no longer exists" };
  }
  const placed = grid.placements.find((p) => p.proposalId === cr.proposal_id);

  if (cr.kind === "move") {
    if (!placed) return { ok: false, reason: "the session is no longer on the agenda" };
    if (!cr.target_day || !cr.target_start_time) {
      return { ok: false, reason: "the request has no target slot" };
    }
    const others = grid.placements.filter((p) => p.proposalId !== cr.proposal_id);
    const fit = fitsAt(
      grid,
      others,
      cr.proposal_id,
      cr.target_day,
      cr.target_start_time,
      cr.target_track_id,
    );
    if (!fit.ok) return fit;
    if (
      placed.day === cr.target_day &&
      placed.startTime === cr.target_start_time &&
      placed.trackId === fit.trackId
    ) {
      return { ok: false, reason: "the session is already in that slot" };
    }
    return {
      ok: true,
      applicable: true,
      after: [
        ...others,
        {
          proposalId: cr.proposal_id,
          trackId: fit.trackId,
          day: cr.target_day,
          startTime: cr.target_start_time,
        },
      ],
    };
  }

  if (cr.kind === "swap") {
    if (!cr.other_proposal_id || !grid.durations.has(cr.other_proposal_id)) {
      return { ok: false, reason: "the other session no longer exists" };
    }
    const otherPlaced = grid.placements.find(
      (p) => p.proposalId === cr.other_proposal_id,
    );
    if (!placed || !otherPlaced) {
      return { ok: false, reason: "both sessions must be on the agenda to swap" };
    }
    const rest = grid.placements.filter(
      (p) => p.proposalId !== cr.proposal_id && p.proposalId !== cr.other_proposal_id,
    );
    const fitA = fitsAt(
      grid,
      rest,
      cr.proposal_id,
      otherPlaced.day,
      otherPlaced.startTime,
      otherPlaced.trackId,
    );
    if (!fitA.ok) return fitA;
    const movedA: Placement = {
      proposalId: cr.proposal_id,
      trackId: otherPlaced.trackId,
      day: otherPlaced.day,
      startTime: otherPlaced.startTime,
    };
    const fitB = fitsAt(
      grid,
      [...rest, movedA],
      cr.other_proposal_id,
      placed.day,
      placed.startTime,
      placed.trackId,
    );
    if (!fitB.ok) return fitB;
    return {
      ok: true,
      applicable: true,
      after: [
        ...rest,
        movedA,
        {
          proposalId: cr.other_proposal_id,
          trackId: placed.trackId,
          day: placed.day,
          startTime: placed.startTime,
        },
      ],
    };
  }

  if (placed) return { ok: false, reason: "the session is already on the agenda" };
  if (!cr.target_day || !cr.target_start_time) {
    return {
      ok: true,
      applicable: false,
      note: "No suggested slot — place the session on the grid to schedule it",
    };
  }
  const fit = fitsAt(
    grid,
    grid.placements,
    cr.proposal_id,
    cr.target_day,
    cr.target_start_time,
    cr.target_track_id,
  );
  if (!fit.ok) return fit;
  return {
    ok: true,
    applicable: true,
    after: [
      ...grid.placements,
      {
        proposalId: cr.proposal_id,
        trackId: fit.trackId,
        day: cr.target_day,
        startTime: cr.target_start_time,
      },
    ],
  };
}

/** Open change requests the given grid makes impossible, with their reasons. */
export function sweepDecisions(
  open: (CrInput & { id: string })[],
  grid: CrGrid,
): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const cr of open) {
    const outcome = evaluateChangeRequest(cr, grid);
    if (!outcome.ok) out.push({ id: cr.id, reason: outcome.reason });
  }
  return out;
}

/** Normalizes a stored row into the shape the pure evaluator expects. */
export function crInputOf(row: ChangeRequest): CrInput & { id: string } {
  return {
    id: row.id,
    kind: row.kind,
    proposal_id: row.proposal_id,
    other_proposal_id: row.other_proposal_id,
    target_day: row.target_day,
    target_start_time: row.target_start_time
      ? row.target_start_time.slice(0, 5)
      : null,
    target_track_id: row.target_track_id,
  };
}

/** Queue order: 👍 descending, then oldest first. */
export function compareChangeRequests(
  a: Pick<ChangeRequest, "id" | "created_at">,
  b: Pick<ChangeRequest, "id" | "created_at">,
  reactionCounts: Map<string, number>,
): number {
  const diff = (reactionCounts.get(b.id) ?? 0) - (reactionCounts.get(a.id) ?? 0);
  if (diff !== 0) return diff;
  const t = a.created_at.localeCompare(b.created_at);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

/** One-line human summary of what a change request asks for. */
export function describeChangeRequest(
  cr: Pick<
    ChangeRequest,
    | "kind"
    | "proposal_id"
    | "other_proposal_id"
    | "target_day"
    | "target_start_time"
    | "target_track_id"
  >,
  titleById: Map<string, string>,
  trackNameById: Map<string, string>,
): string {
  const title = (id: string | null) => (id && titleById.get(id)) || "a removed session";
  const slot =
    cr.target_day && cr.target_start_time
      ? ` to ${formatDay(cr.target_day)} ${formatTime(cr.target_start_time)}${
          cr.target_track_id
            ? ` · ${trackNameById.get(cr.target_track_id) ?? "a removed room"}`
            : ""
        }`
      : "";
  if (cr.kind === "move") return `Move “${title(cr.proposal_id)}”${slot}`;
  if (cr.kind === "swap") {
    return `Swap “${title(cr.proposal_id)}” with “${title(cr.other_proposal_id)}”`;
  }
  return `Add “${title(cr.proposal_id)}”${slot || " (no suggested slot)"}`;
}
