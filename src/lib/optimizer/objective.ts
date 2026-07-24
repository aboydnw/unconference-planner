import { overlaps, sessionEndMinutes, timeToMinutes } from "@/lib/agenda";
import {
  MOVE_PENALTY,
  PROPOSER_CONFLICT_PENALTY,
  UNAVAILABLE_PENALTY,
} from "@/lib/optimizer/constants";
import type { InterestModel } from "@/lib/optimizer/interest";
import { timesOverlap, type Placement } from "@/lib/optimizer/model";

export interface UnavailabilityWindow {
  day: string;
  start_time: string;
  end_time: string;
}

export interface ObjectiveInput {
  interest: InterestModel;
  durations: Map<string, number | null>;
  proposerOf: Map<string, string>;
  unavailability: Map<string, UnavailabilityWindow[]>;
  baseline: Map<string, Placement> | null;
}

function overlapsWindow(
  p: Placement,
  w: UnavailabilityWindow,
  durations: Map<string, number | null>,
): boolean {
  if (p.day !== w.day) return false;
  return overlaps(
    timeToMinutes(p.startTime),
    sessionEndMinutes(p.startTime, durations.get(p.proposalId) ?? null),
    timeToMinutes(w.start_time),
    timeToMinutes(w.end_time),
  );
}

function attendeeSatisfaction(placements: Placement[], input: ObjectiveInput): number {
  const byId = new Map(placements.map((p) => [p.proposalId, p]));
  let total = 0;
  for (const wanted of input.interest.wants.values()) {
    const placed = [...wanted.entries()]
      .filter(([proposalId]) => byId.has(proposalId))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const totalWeight = [...wanted.values()].reduce((s, w) => s + w, 0);
    if (totalWeight === 0) continue;
    const kept: Placement[] = [];
    let keptWeight = 0;
    for (const [proposalId, weight] of placed) {
      const placement = byId.get(proposalId)!;
      const clashes = kept.some((k) => timesOverlap(k, placement, input.durations));
      if (!clashes) {
        kept.push(placement);
        keptWeight += weight;
      }
    }
    total += keptWeight / totalWeight;
  }
  return total;
}

function proposerConflicts(
  placements: Placement[],
  input: ObjectiveInput,
): { doubleBooked: [Placement, Placement][]; unavailable: Placement[] } {
  const byProposer = new Map<string, Placement[]>();
  for (const p of placements) {
    const proposer = input.proposerOf.get(p.proposalId);
    if (!proposer) continue;
    byProposer.set(proposer, [...(byProposer.get(proposer) ?? []), p]);
  }
  const doubleBooked: [Placement, Placement][] = [];
  const unavailable: Placement[] = [];
  for (const [proposer, own] of byProposer) {
    for (let i = 0; i < own.length; i++) {
      for (let j = i + 1; j < own.length; j++) {
        if (timesOverlap(own[i], own[j], input.durations)) {
          doubleBooked.push([own[i], own[j]]);
        }
      }
      const windows = input.unavailability.get(proposer) ?? [];
      if (windows.some((w) => overlapsWindow(own[i], w, input.durations))) {
        unavailable.push(own[i]);
      }
    }
  }
  return { doubleBooked, unavailable };
}

export function scorePlacements(placements: Placement[], input: ObjectiveInput): number {
  let score = attendeeSatisfaction(placements, input);
  const { doubleBooked, unavailable } = proposerConflicts(placements, input);
  score -= doubleBooked.length * PROPOSER_CONFLICT_PENALTY;
  score -= unavailable.length * UNAVAILABLE_PENALTY;
  if (input.baseline) {
    for (const p of placements) {
      const prev = input.baseline.get(p.proposalId);
      if (!prev) continue;
      if (prev.day !== p.day || prev.startTime !== p.startTime || prev.trackId !== p.trackId) {
        score -= MOVE_PENALTY;
      }
    }
  }
  return score;
}

export function collectWarnings(placements: Placement[], input: ObjectiveInput): string[] {
  const { doubleBooked, unavailable } = proposerConflicts(placements, input);
  const warnings: string[] = [];
  for (const [a, b] of doubleBooked) {
    warnings.push(
      `${a.proposalId} overlaps ${b.proposalId} — both are by the same proposer`,
    );
  }
  for (const p of unavailable) {
    warnings.push(`${p.proposalId} falls inside its proposer's unavailable time`);
  }
  return warnings;
}
