import {
  SA_END_TEMP,
  SA_ITERATIONS,
  SA_START_TEMP,
} from "@/lib/optimizer/constants";
import { buildInterestModel, byInterestDesc } from "@/lib/optimizer/interest";
import {
  candidateStarts,
  freeTrack,
  timesOverlap,
  type GridShape,
  type Placement,
} from "@/lib/optimizer/model";
import {
  collectWarnings,
  scorePlacements,
  type ObjectiveInput,
  type UnavailabilityWindow,
} from "@/lib/optimizer/objective";
import { createRng } from "@/lib/optimizer/random";
import type { AttendeeUnavailability, Proposal, Vote } from "@/lib/types";

export interface OptimizeInput {
  proposals: Pick<Proposal, "id" | "attendee_id" | "duration_minutes" | "created_at">[];
  votes: Pick<Vote, "proposal_id" | "attendee_id" | "tier">[];
  attendeeCount: number;
  unavailability: Pick<AttendeeUnavailability, "attendee_id" | "day" | "start_time" | "end_time">[];
  shape: GridShape;
  currentDraft: Placement[];
  pinnedIds: Set<string>;
  seed: number;
}

export interface OptimizeResult {
  placements: Placement[];
  cutList: { proposalId: string; reason: string }[];
  warnings: string[];
  voteCoverage: { voters: number; attendees: number };
}

const NO_SPACE = "no space in the grid";

export function optimize(input: OptimizeInput): OptimizeResult {
  const proposals = [...input.proposals].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const votes = [...input.votes].sort(
    (a, b) =>
      a.proposal_id.localeCompare(b.proposal_id) ||
      a.attendee_id.localeCompare(b.attendee_id),
  );

  const durations = new Map(proposals.map((p) => [p.id, p.duration_minutes]));
  const proposerOf = new Map(
    proposals.filter((p) => p.attendee_id).map((p) => [p.id, p.attendee_id!]),
  );
  const interest = buildInterestModel(proposals, votes, input.attendeeCount);

  const unavailability = new Map<string, UnavailabilityWindow[]>();
  for (const u of input.unavailability) {
    const w = {
      day: u.day,
      start_time: u.start_time.slice(0, 5),
      end_time: u.end_time.slice(0, 5),
    };
    unavailability.set(u.attendee_id, [...(unavailability.get(u.attendee_id) ?? []), w]);
  }

  const pinnedPlacements = input.currentDraft.filter((p) =>
    input.pinnedIds.has(p.proposalId),
  );
  const baseline = new Map(
    input.currentDraft
      .filter((p) => !input.pinnedIds.has(p.proposalId))
      .map((p) => [p.proposalId, p]),
  );
  const objective: ObjectiveInput = {
    interest,
    durations,
    proposerOf,
    unavailability,
    baseline: baseline.size > 0 ? baseline : null,
  };

  const unpinned = proposals.filter((p) => !input.pinnedIds.has(p.id));
  const voted = unpinned
    .filter((p) => (interest.totalInterest.get(p.id) ?? 0) > 0)
    .sort((a, b) => byInterestDesc(a, b, interest.totalInterest));
  const zeroVote = unpinned.filter((p) => (interest.totalInterest.get(p.id) ?? 0) === 0);

  const cutList: OptimizeResult["cutList"] = [];
  let grid: Placement[] = [...pinnedPlacements];

  const placeBest = (proposalId: string): boolean => {
    const dur = durations.get(proposalId) ?? null;
    const prev = baseline.get(proposalId);
    if (prev) {
      const stillValid =
        candidateStarts(input.shape, dur).some(
          (c) => c.day === prev.day && c.startTime === prev.startTime,
        ) &&
        !grid.some(
          (g) => g.trackId === prev.trackId && timesOverlap(g, prev, durations),
        ) &&
        input.shape.trackIds.includes(prev.trackId);
      if (stillValid) {
        grid.push({ ...prev });
        return true;
      }
    }
    let best: { placement: Placement; score: number } | null = null;
    for (const cell of candidateStarts(input.shape, dur)) {
      const trackId = freeTrack(input.shape, grid, durations, cell.day, cell.startTime, dur);
      if (!trackId) continue;
      const placement: Placement = { proposalId, trackId, ...cell };
      const score = scorePlacements([...grid, placement], objective);
      if (!best || score > best.score) best = { placement, score };
    }
    if (!best) return false;
    grid.push(best.placement);
    return true;
  };

  for (const p of voted) {
    if (!placeBest(p.id)) cutList.push({ proposalId: p.id, reason: NO_SPACE });
  }

  const rng = createRng(input.seed);
  const movable = () => grid.filter((g) => !input.pinnedIds.has(g.proposalId));
  let currentScore = scorePlacements(grid, objective);
  let bestGrid = [...grid];
  let bestScore = currentScore;

  const coolingRate = Math.pow(SA_END_TEMP / SA_START_TEMP, 1 / SA_ITERATIONS);
  let temp = SA_START_TEMP;
  for (let i = 0; i < SA_ITERATIONS; i++) {
    temp *= coolingRate;
    const pool = movable();
    if (pool.length === 0) break;
    const next = [...grid];

    if (pool.length < 2 || rng.next() < 0.5) {
      const target = pool[rng.int(pool.length)];
      const dur = durations.get(target.proposalId) ?? null;
      const cells = candidateStarts(input.shape, dur);
      if (cells.length === 0) continue;
      const cell = cells[rng.int(cells.length)];
      const without = next.filter((g) => g.proposalId !== target.proposalId);
      const trackId = freeTrack(input.shape, without, durations, cell.day, cell.startTime, dur);
      if (!trackId) continue;
      without.push({ proposalId: target.proposalId, trackId, ...cell });
      next.length = 0;
      next.push(...without);
    } else {
      const a = pool[rng.int(pool.length)];
      const b = pool[rng.int(pool.length)];
      if (a.proposalId === b.proposalId) continue;
      const durA = durations.get(a.proposalId) ?? null;
      const durB = durations.get(b.proposalId) ?? null;
      const without = next.filter(
        (g) => g.proposalId !== a.proposalId && g.proposalId !== b.proposalId,
      );
      const trackForA = freeTrack(input.shape, without, durations, b.day, b.startTime, durA);
      if (!trackForA) continue;
      const withA = [
        ...without,
        { proposalId: a.proposalId, trackId: trackForA, day: b.day, startTime: b.startTime },
      ];
      const trackForB = freeTrack(input.shape, withA, durations, a.day, a.startTime, durB);
      if (!trackForB) continue;
      withA.push({
        proposalId: b.proposalId,
        trackId: trackForB,
        day: a.day,
        startTime: a.startTime,
      });
      next.length = 0;
      next.push(...withA);
    }

    const nextScore = scorePlacements(next, objective);
    const delta = nextScore - currentScore;
    if (delta >= 0 || rng.next() < Math.exp(delta / temp)) {
      grid = next;
      currentScore = nextScore;
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestGrid = [...grid];
      }
    }
  }
  grid = bestGrid;

  for (const z of zeroVote) {
    const dur = durations.get(z.id) ?? null;
    const cells = candidateStarts(input.shape, dur).map((cell) => {
      const zPlacement: Placement = { proposalId: z.id, trackId: "", ...cell };
      const overlapInterest = grid.reduce((max, g) => {
        if (!timesOverlap(g, zPlacement, durations)) return max;
        return Math.max(max, interest.totalInterest.get(g.proposalId) ?? 0);
      }, 0);
      return { cell, overlapInterest };
    });
    cells.sort(
      (x, y) =>
        y.overlapInterest - x.overlapInterest ||
        x.cell.day.localeCompare(y.cell.day) ||
        x.cell.startTime.localeCompare(y.cell.startTime),
    );
    let placed = false;
    for (const { cell } of cells) {
      const trackId = freeTrack(input.shape, grid, durations, cell.day, cell.startTime, dur);
      if (trackId) {
        grid.push({ proposalId: z.id, trackId, ...cell });
        placed = true;
        break;
      }
    }
    if (!placed) cutList.push({ proposalId: z.id, reason: NO_SPACE });
  }

  return {
    placements: grid.filter((g) => !input.pinnedIds.has(g.proposalId)),
    cutList,
    warnings: collectWarnings(grid, objective),
    voteCoverage: interest.voteCoverage,
  };
}
