import { describe, expect, it } from "vitest";

import { buildInterestModel, byInterestDesc } from "@/lib/optimizer/interest";

describe("buildInterestModel", () => {
  const proposals = [
    { id: "p1", attendee_id: "alice" },
    { id: "p2", attendee_id: null },
  ];
  const votes = [
    { proposal_id: "p1", attendee_id: "bob", tier: "must" as const },
    { proposal_id: "p2", attendee_id: "bob", tier: "would" as const },
  ];

  it("adds an implicit must-vote from the proposer", () => {
    const m = buildInterestModel(proposals, votes, 3);
    expect(m.wants.get("alice")?.get("p1")).toBe(2);
  });
  it("does not double-count a proposer who voted for their own session", () => {
    const m = buildInterestModel(
      proposals,
      [...votes, { proposal_id: "p1", attendee_id: "alice", tier: "would" as const }],
      3,
    );
    expect(m.wants.get("alice")?.get("p1")).toBe(2);
    expect(m.totalInterest.get("p1")).toBe(4);
  });
  it("computes totals and coverage (explicit voters only)", () => {
    const m = buildInterestModel(proposals, votes, 3);
    expect(m.totalInterest.get("p1")).toBe(4);
    expect(m.totalInterest.get("p2")).toBe(1);
    expect(m.voteCoverage).toEqual({ voters: 1, attendees: 3 });
  });
});

describe("byInterestDesc", () => {
  it("orders by interest desc then created_at asc then id", () => {
    const totals = new Map([
      ["a", 3],
      ["b", 3],
      ["c", 5],
    ]);
    const list = [
      { id: "a", created_at: "2026-07-02" },
      { id: "b", created_at: "2026-07-01" },
      { id: "c", created_at: "2026-07-03" },
    ].sort((x, y) => byInterestDesc(x, y, totals));
    expect(list.map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
});
