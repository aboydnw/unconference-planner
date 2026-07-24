import { describe, expect, it } from "vitest";

import { optimize } from "@/lib/optimizer/optimizer";
import type { OptimizeInput } from "@/lib/optimizer/optimizer";
import { timesOverlap } from "@/lib/optimizer/model";
import type { GridShape, Placement } from "@/lib/optimizer/model";

const shape: GridShape = {
  days: ["2026-08-01"],
  dayStart: "09:00",
  dayEnd: "12:00",
  trackIds: ["t1", "t2"],
  blocks: [],
};

function proposal(id: string, attendee_id: string | null, created_at: string) {
  return { id, attendee_id, duration_minutes: 30, created_at };
}

function durationsOf(input: OptimizeInput): Map<string, number | null> {
  return new Map(input.proposals.map((p) => [p.id, p.duration_minutes]));
}

function expectValidGrid(
  placements: Placement[],
  input: OptimizeInput,
  pinnedContext: Placement[] = [],
) {
  const durations = durationsOf(input);
  const all = [...placements, ...pinnedContext];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].trackId === all[j].trackId) {
        expect(
          timesOverlap(all[i], all[j], durations),
          `${all[i].proposalId} and ${all[j].proposalId} share ${all[i].trackId}`,
        ).toBe(false);
      }
    }
  }
  for (const p of all) {
    expect(input.shape.days).toContain(p.day);
    expect(input.shape.trackIds).toContain(p.trackId);
  }
}

function baseInput(overrides: Partial<OptimizeInput> = {}): OptimizeInput {
  return {
    proposals: [],
    votes: [],
    attendeeCount: 0,
    unavailability: [],
    shape,
    currentDraft: [],
    pinnedIds: new Set(),
    seed: 42,
    ...overrides,
  };
}

describe("optimize", () => {
  it("is deterministic for identical input and seed", () => {
    const input = baseInput({
      proposals: [
        proposal("p1", "a1", "2026-07-01"),
        proposal("p2", "a2", "2026-07-02"),
        proposal("p3", "a3", "2026-07-03"),
        proposal("p4", null, "2026-07-04"),
      ],
      votes: [
        { proposal_id: "p1", attendee_id: "v1", tier: "must" },
        { proposal_id: "p2", attendee_id: "v1", tier: "would" },
        { proposal_id: "p3", attendee_id: "v2", tier: "must" },
      ],
      attendeeCount: 5,
    });
    const a = optimize(input);
    const b = optimize(input);
    expect(a.placements).toEqual(b.placements);
    expect(a.cutList).toEqual(b.cutList);
  });

  it("produces a valid grid across seeds", () => {
    const input = baseInput({
      proposals: [
        proposal("p1", "a1", "2026-07-01"),
        proposal("p2", "a2", "2026-07-02"),
        proposal("p3", "a3", "2026-07-03"),
      ],
      votes: [{ proposal_id: "p1", attendee_id: "v1", tier: "must" }],
      attendeeCount: 4,
    });
    for (const seed of [1, 2, 99]) {
      const r = optimize({ ...input, seed });
      expect(r.placements.length).toBe(3);
      expectValidGrid(r.placements, input);
    }
  });

  it("separates one attendee's two must-attend sessions in time", () => {
    const input = baseInput({
      proposals: [proposal("p1", null, "2026-07-01"), proposal("p2", null, "2026-07-02")],
      votes: [
        { proposal_id: "p1", attendee_id: "carol", tier: "must" },
        { proposal_id: "p2", attendee_id: "carol", tier: "must" },
      ],
      attendeeCount: 2,
    });
    const r = optimize(input);
    expect(r.placements.length).toBe(2);
    const [a, b] = r.placements;
    expect(timesOverlap(a, b, durationsOf(input))).toBe(false);
  });

  it("never moves pinned placements and schedules around them", () => {
    const pinned: Placement = {
      proposalId: "pin",
      trackId: "t1",
      day: "2026-08-01",
      startTime: "09:00",
    };
    const input = baseInput({
      proposals: [proposal("pin", null, "2026-07-01"), proposal("p2", null, "2026-07-02")],
      votes: [
        { proposal_id: "pin", attendee_id: "v1", tier: "must" },
        { proposal_id: "p2", attendee_id: "v1", tier: "must" },
      ],
      attendeeCount: 2,
      currentDraft: [pinned],
      pinnedIds: new Set(["pin"]),
    });
    const r = optimize(input);
    expect(r.placements.map((p) => p.proposalId)).toEqual(["p2"]);
    expectValidGrid(r.placements, input, [pinned]);
    expect(timesOverlap(r.placements[0], pinned, durationsOf(input))).toBe(false);
  });

  it("respects the full duration of a pinned session when scheduling around it", () => {
    const oneTrack: GridShape = { ...shape, dayEnd: "11:00", trackIds: ["t1"] };
    const pinned: Placement = {
      proposalId: "long",
      trackId: "t1",
      day: "2026-08-01",
      startTime: "09:00",
    };
    const input = baseInput({
      shape: oneTrack,
      proposals: [
        { id: "long", attendee_id: null, duration_minutes: 90, created_at: "2026-07-01" },
        proposal("p2", null, "2026-07-02"),
      ],
      votes: [{ proposal_id: "p2", attendee_id: "v1", tier: "must" }],
      attendeeCount: 2,
      currentDraft: [pinned],
      pinnedIds: new Set(["long"]),
    });
    const r = optimize(input);
    expect(r.placements.map((p) => p.proposalId)).toEqual(["p2"]);
    expect(r.placements[0].startTime).toBe("10:30");
  });

  it("stays close to the baseline when one vote is added (warm start)", () => {
    const input = baseInput({
      proposals: [
        proposal("p1", "a1", "2026-07-01"),
        proposal("p2", "a2", "2026-07-02"),
        proposal("p3", "a3", "2026-07-03"),
        proposal("p4", "a4", "2026-07-04"),
      ],
      votes: [
        { proposal_id: "p1", attendee_id: "v1", tier: "must" },
        { proposal_id: "p2", attendee_id: "v2", tier: "would" },
      ],
      attendeeCount: 6,
    });
    const first = optimize(input);
    const second = optimize({
      ...input,
      votes: [...input.votes, { proposal_id: "p1", attendee_id: "dave", tier: "would" }],
      currentDraft: first.placements,
      seed: 7,
    });
    const before = new Map(first.placements.map((p) => [p.proposalId, p]));
    const moved = second.placements.filter((p) => {
      const prev = before.get(p.proposalId);
      return (
        !prev ||
        prev.day !== p.day ||
        prev.startTime !== p.startTime ||
        prev.trackId !== p.trackId
      );
    });
    expect(moved.length).toBeLessThanOrEqual(2);
  });

  it("cuts lowest-interest overflow but keeps zero-vote sessions while space remains", () => {
    const tinyShape: GridShape = { ...shape, dayEnd: "10:00", trackIds: ["t1"] };
    const overflowing = baseInput({
      shape: tinyShape,
      proposals: [
        proposal("hot", null, "2026-07-01"),
        proposal("warm", null, "2026-07-02"),
        proposal("zero", null, "2026-07-03"),
      ],
      votes: [
        { proposal_id: "hot", attendee_id: "v1", tier: "must" },
        { proposal_id: "warm", attendee_id: "v2", tier: "would" },
      ],
      attendeeCount: 3,
    });
    const r = optimize(overflowing);
    expect(r.placements.map((p) => p.proposalId).sort()).toEqual(["hot", "warm"]);
    expect(r.cutList).toEqual([{ proposalId: "zero", reason: "no space in the grid" }]);

    const roomy = { ...overflowing, votes: overflowing.votes.slice(0, 1) };
    roomy.proposals = overflowing.proposals.slice(0, 1).concat(overflowing.proposals.slice(2));
    const r2 = optimize(roomy);
    expect(r2.placements.map((p) => p.proposalId).sort()).toEqual(["hot", "zero"]);
    expect(r2.cutList).toEqual([]);
  });
});
