import type { Proposal, Vote } from "@/lib/types";

export interface VoteSummary {
  must: number;
  would: number;
}

export function summarizeVotes(
  votes: Pick<Vote, "proposal_id" | "tier">[],
): Map<string, VoteSummary> {
  const out = new Map<string, VoteSummary>();
  for (const v of votes) {
    const s = out.get(v.proposal_id) ?? { must: 0, would: 0 };
    s[v.tier] += 1;
    out.set(v.proposal_id, s);
  }
  return out;
}

export function weightedDemand(s: VoteSummary | undefined): number {
  if (!s) return 0;
  return s.must * 2 + s.would;
}

export function formatVoteSplit(s: VoteSummary | undefined): string {
  if (!s || (s.must === 0 && s.would === 0)) return "0 votes";
  const parts: string[] = [];
  if (s.must > 0) parts.push(`${s.must} must`);
  if (s.would > 0) parts.push(`${s.would} would`);
  return parts.join(" · ");
}

export function compareByDemand(
  a: Proposal,
  b: Proposal,
  summaries: Map<string, VoteSummary>,
): number {
  const diff =
    weightedDemand(summaries.get(b.id)) - weightedDemand(summaries.get(a.id));
  if (diff !== 0) return diff;
  return a.created_at.localeCompare(b.created_at);
}
