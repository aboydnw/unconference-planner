import { MUST_WEIGHT, WOULD_WEIGHT } from "@/lib/optimizer/constants";
import type { Proposal, Vote } from "@/lib/types";

export interface InterestModel {
  wants: Map<string, Map<string, number>>;
  totalInterest: Map<string, number>;
  voteCoverage: { voters: number; attendees: number };
}

export function buildInterestModel(
  proposals: Pick<Proposal, "id" | "attendee_id">[],
  votes: Pick<Vote, "proposal_id" | "attendee_id" | "tier">[],
  attendeeCount: number,
): InterestModel {
  const wants = new Map<string, Map<string, number>>();
  const setWant = (attendeeId: string, proposalId: string, weight: number) => {
    const m = wants.get(attendeeId) ?? new Map<string, number>();
    m.set(proposalId, Math.max(m.get(proposalId) ?? 0, weight));
    wants.set(attendeeId, m);
  };
  for (const v of votes) {
    setWant(v.attendee_id, v.proposal_id, v.tier === "must" ? MUST_WEIGHT : WOULD_WEIGHT);
  }
  for (const p of proposals) {
    if (p.attendee_id) setWant(p.attendee_id, p.id, MUST_WEIGHT);
  }
  const totalInterest = new Map<string, number>();
  for (const p of proposals) totalInterest.set(p.id, 0);
  for (const m of wants.values()) {
    for (const [proposalId, w] of m) {
      totalInterest.set(proposalId, (totalInterest.get(proposalId) ?? 0) + w);
    }
  }
  const voters = new Set(votes.map((v) => v.attendee_id)).size;
  return { wants, totalInterest, voteCoverage: { voters, attendees: attendeeCount } };
}

export function byInterestDesc(
  a: Pick<Proposal, "id" | "created_at">,
  b: Pick<Proposal, "id" | "created_at">,
  totals: Map<string, number>,
): number {
  const diff = (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0);
  if (diff !== 0) return diff;
  const t = a.created_at.localeCompare(b.created_at);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}
