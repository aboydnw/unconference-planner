import { describe, expect, it } from "vitest";

import {
  compareByDemand,
  formatVoteSplit,
  summarizeVotes,
  weightedDemand,
} from "@/lib/votes";
import type { Proposal } from "@/lib/types";

function proposal(id: string, created_at: string): Proposal {
  return {
    id,
    event_id: "e1",
    attendee_id: null,
    proposer_name: "x",
    title: id,
    description: "",
    format: null,
    duration_minutes: null,
    hidden: false,
    created_at,
    custom_answers: {},
  };
}

describe("summarizeVotes", () => {
  it("returns empty map for no votes", () => {
    expect(summarizeVotes([]).size).toBe(0);
  });
  it("counts tiers per proposal", () => {
    const m = summarizeVotes([
      { proposal_id: "a", tier: "must" },
      { proposal_id: "a", tier: "would" },
      { proposal_id: "a", tier: "would" },
      { proposal_id: "b", tier: "must" },
    ]);
    expect(m.get("a")).toEqual({ must: 1, would: 2 });
    expect(m.get("b")).toEqual({ must: 1, would: 0 });
  });
});

describe("weightedDemand", () => {
  it("weights must=2 would=1", () => {
    expect(weightedDemand({ must: 2, would: 3 })).toBe(7);
  });
  it("returns 0 for undefined", () => {
    expect(weightedDemand(undefined)).toBe(0);
  });
});

describe("formatVoteSplit", () => {
  it("formats both sides", () => {
    expect(formatVoteSplit({ must: 2, would: 5 })).toBe("2 must · 5 would");
  });
  it("omits a zero side", () => {
    expect(formatVoteSplit({ must: 0, would: 5 })).toBe("5 would");
    expect(formatVoteSplit({ must: 3, would: 0 })).toBe("3 must");
  });
  it("handles empty and undefined", () => {
    expect(formatVoteSplit({ must: 0, would: 0 })).toBe("0 votes");
    expect(formatVoteSplit(undefined)).toBe("0 votes");
  });
});

describe("compareByDemand", () => {
  it("sorts by weighted demand descending, ties by created_at ascending", () => {
    const a = proposal("a", "2026-07-01T00:00:00Z");
    const b = proposal("b", "2026-07-02T00:00:00Z");
    const c = proposal("c", "2026-07-03T00:00:00Z");
    const summaries = summarizeVotes([
      { proposal_id: "b", tier: "must" },
      { proposal_id: "c", tier: "would" },
      { proposal_id: "a", tier: "would" },
    ]);
    const sorted = [c, b, a].sort((x, y) => compareByDemand(x, y, summaries));
    expect(sorted.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});
