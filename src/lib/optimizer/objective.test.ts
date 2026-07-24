import { describe, expect, it } from "vitest";

import { buildInterestModel } from "@/lib/optimizer/interest";
import { collectWarnings, scorePlacements } from "@/lib/optimizer/objective";
import type { Placement } from "@/lib/optimizer/model";

const proposals = [
  { id: "p1", attendee_id: "alice" },
  { id: "p2", attendee_id: "bob" },
  { id: "p3", attendee_id: null },
];
const votes = [
  { proposal_id: "p1", attendee_id: "carol", tier: "must" as const },
  { proposal_id: "p2", attendee_id: "carol", tier: "must" as const },
];
const interest = buildInterestModel(proposals, votes, 3);
const durations = new Map<string, number | null>([
  ["p1", 30],
  ["p2", 30],
  ["p3", 30],
]);
const proposerOf = new Map([
  ["p1", "alice"],
  ["p2", "bob"],
]);
const base = {
  interest,
  durations,
  proposerOf,
  unavailability: new Map<string, { day: string; start_time: string; end_time: string }[]>(),
  baseline: null,
};
const at = (id: string, track: string, start: string): Placement => ({
  proposalId: id,
  trackId: track,
  day: "2026-08-01",
  startTime: start,
});

describe("scorePlacements", () => {
  it("prefers spreading carol's two musts over clashing them", () => {
    const spread = scorePlacements([at("p1", "t1", "09:00"), at("p2", "t1", "09:30")], base);
    const clash = scorePlacements([at("p1", "t1", "09:00"), at("p2", "t2", "09:00")], base);
    expect(spread).toBeGreaterThan(clash);
  });
  it("penalizes a proposer double-booked against their own session", () => {
    const withP3ByAlice = {
      ...base,
      proposerOf: new Map([...proposerOf, ["p3", "alice"]]),
    };
    const apart = scorePlacements([at("p1", "t1", "09:00"), at("p3", "t1", "09:30")], withP3ByAlice);
    const together = scorePlacements([at("p1", "t1", "09:00"), at("p3", "t2", "09:00")], withP3ByAlice);
    expect(apart - together).toBeGreaterThan(10);
  });
  it("penalizes scheduling into the proposer's unavailability", () => {
    const busyAlice = {
      ...base,
      unavailability: new Map([
        ["alice", [{ day: "2026-08-01", start_time: "09:00", end_time: "10:00" }]],
      ]),
    };
    const inside = scorePlacements([at("p1", "t1", "09:00")], busyAlice);
    const outside = scorePlacements([at("p1", "t1", "10:00")], busyAlice);
    expect(outside).toBeGreaterThan(inside);
  });
  it("charges the move penalty only for moved placements", () => {
    const baseline = new Map([["p1", at("p1", "t1", "09:00")]]);
    const same = scorePlacements([at("p1", "t1", "09:00")], { ...base, baseline });
    const moved = scorePlacements([at("p1", "t1", "09:30")], { ...base, baseline });
    expect(same).toBeGreaterThan(moved);
  });
});

describe("collectWarnings", () => {
  it("reports proposer conflicts in words", () => {
    const withP3ByAlice = {
      ...base,
      proposerOf: new Map([...proposerOf, ["p3", "alice"]]),
    };
    const warnings = collectWarnings(
      [at("p1", "t1", "09:00"), at("p3", "t2", "09:00")],
      withP3ByAlice,
    );
    expect(warnings.length).toBe(1);
  });
});
