import { describe, expect, it } from "vitest";

import {
  compareChangeRequests,
  describeChangeRequest,
  evaluateChangeRequest,
  sweepDecisions,
  type CrGrid,
  type CrInput,
} from "@/lib/changeRequests";
import type { Placement } from "@/lib/optimizer/model";

const placements: Placement[] = [
  { proposalId: "a", trackId: "t1", day: "2026-08-01", startTime: "09:00" },
  { proposalId: "b", trackId: "t2", day: "2026-08-01", startTime: "09:00" },
  { proposalId: "d", trackId: "t1", day: "2026-08-01", startTime: "10:00" },
];
const grid: CrGrid = {
  days: ["2026-08-01"],
  dayStart: "09:00",
  dayEnd: "12:00",
  trackIds: ["t1", "t2"],
  blocks: [{ day: "2026-08-01", start_time: "10:30", end_time: "11:00" }],
  placements,
  durations: new Map([
    ["a", 60],
    ["b", 30],
    ["c", 30],
    ["d", 30],
    ["e", 30],
  ]),
  proposerOf: new Map([
    ["a", "alice"],
    ["b", "bob"],
    ["d", "dana"],
    ["e", "alice"],
  ]),
};
const cr = (over: Partial<CrInput>): CrInput => ({
  kind: "move",
  proposal_id: "b",
  other_proposal_id: null,
  target_day: "2026-08-01",
  target_start_time: "11:00",
  target_track_id: null,
  ...over,
});

describe("evaluateChangeRequest move", () => {
  it("moves to a free slot and keeps the rest intact", () => {
    const o = evaluateChangeRequest(cr({}), grid);
    if (!o.ok || !o.applicable) throw new Error("expected applicable");
    expect(o.after).toHaveLength(3);
    const moved = o.after.find((p) => p.proposalId === "b")!;
    expect(moved.startTime).toBe("11:00");
  });
  it("blocks when every room is occupied at the target", () => {
    const o = evaluateChangeRequest(
      cr({ proposal_id: "d", target_start_time: "09:00" }),
      grid,
    );
    expect(o.ok).toBe(false);
  });
  it("blocks a specific occupied room", () => {
    const o = evaluateChangeRequest(
      cr({ target_start_time: "10:00", target_track_id: "t1" }),
      grid,
    );
    expect(o.ok).toBe(false);
  });
  it("blocks targets that hit a block or overflow the day", () => {
    expect(evaluateChangeRequest(cr({ target_start_time: "10:30" }), grid).ok).toBe(false);
    expect(evaluateChangeRequest(cr({ target_start_time: "11:45" }), grid).ok).toBe(false);
    expect(evaluateChangeRequest(cr({ target_day: "2026-08-02" }), grid).ok).toBe(false);
  });
  it("blocks a proposer double-book at the target", () => {
    const o = evaluateChangeRequest(
      cr({
        kind: "add",
        proposal_id: "e",
        target_start_time: "09:30",
        target_track_id: "t2",
      }),
      grid,
    );
    expect(o.ok).toBe(false); // alice proposed both "a" (09:00–10:00) and "e"
  });
  it("blocks moving an unscheduled or missing session", () => {
    expect(evaluateChangeRequest(cr({ proposal_id: "c" }), grid).ok).toBe(false);
    expect(evaluateChangeRequest(cr({ proposal_id: "ghost" }), grid).ok).toBe(false);
  });
  it("blocks a start time that is off the 30-minute grid", () => {
    const o = evaluateChangeRequest(cr({ target_start_time: "11:15" }), grid);
    expect(o.ok).toBe(false);
    if (o.ok) throw new Error("expected blocked");
    expect(o.reason).toContain("schedule grid");
  });
  it("measures grid alignment from the daily start time", () => {
    const offHour: CrGrid = { ...grid, dayStart: "09:15", blocks: [] };
    expect(evaluateChangeRequest(cr({ target_start_time: "11:15" }), offHour).ok).toBe(true);
    expect(evaluateChangeRequest(cr({ target_start_time: "11:00" }), offHour).ok).toBe(false);
  });
  it("blocks a room that belongs to another event", () => {
    const o = evaluateChangeRequest(cr({ target_track_id: "other-event-track" }), grid);
    expect(o.ok).toBe(false);
    if (o.ok) throw new Error("expected blocked");
    expect(o.reason).toContain("not part of this event");
  });
  it("reports an already-satisfied move rather than an impossible one", () => {
    const sameSlot = evaluateChangeRequest(
      cr({ target_start_time: "09:00", target_track_id: "t2" }),
      grid,
    );
    if (sameSlot.ok) throw new Error("expected not applicable");
    expect(sameSlot.satisfied).toBe(true);

    const roomAgnostic = evaluateChangeRequest(
      cr({ target_start_time: "09:00", target_track_id: null }),
      grid,
    );
    if (roomAgnostic.ok) throw new Error("expected not applicable");
    expect(roomAgnostic.satisfied).toBe(true);
  });
});

describe("evaluateChangeRequest swap", () => {
  it("swaps two sessions' slots", () => {
    const o = evaluateChangeRequest(
      cr({ kind: "swap", proposal_id: "b", other_proposal_id: "d" }),
      grid,
    );
    if (!o.ok || !o.applicable) throw new Error("expected applicable");
    expect(o.after.find((p) => p.proposalId === "b")!.startTime).toBe("10:00");
    expect(o.after.find((p) => p.proposalId === "d")!.startTime).toBe("09:00");
  });
  it("blocks a swap where the longer session cannot fit the other slot", () => {
    // a (60 min) into d's 10:00 slot would cross the 10:30 block
    const o = evaluateChangeRequest(
      cr({ kind: "swap", proposal_id: "a", other_proposal_id: "d" }),
      grid,
    );
    expect(o.ok).toBe(false);
  });
  it("blocks when either session is off the agenda", () => {
    const o = evaluateChangeRequest(
      cr({ kind: "swap", proposal_id: "b", other_proposal_id: "c" }),
      grid,
    );
    expect(o.ok).toBe(false);
  });
});

describe("evaluateChangeRequest add", () => {
  it("adds an unscheduled session at a valid target", () => {
    const o = evaluateChangeRequest(
      cr({ kind: "add", proposal_id: "c", target_start_time: "11:00" }),
      grid,
    );
    if (!o.ok || !o.applicable) throw new Error("expected applicable");
    expect(o.after).toHaveLength(4);
  });
  it("stays valid without a target but is not applicable", () => {
    const o = evaluateChangeRequest(
      cr({ kind: "add", proposal_id: "c", target_day: null, target_start_time: null }),
      grid,
    );
    expect(o.ok).toBe(true);
    if (o.ok) expect(o.applicable).toBe(false);
  });
  it("blocks adding a session already on the agenda", () => {
    const o = evaluateChangeRequest(cr({ kind: "add", proposal_id: "b" }), grid);
    expect(o.ok).toBe(false);
  });
});

describe("sweepDecisions", () => {
  it("invalidates CRs the new grid makes impossible, keeps the rest", () => {
    const after: CrGrid = {
      ...grid,
      placements: [
        ...placements,
        { proposalId: "c", trackId: "t1", day: "2026-08-01", startTime: "11:00" },
        { proposalId: "e", trackId: "t2", day: "2026-08-01", startTime: "11:00" },
      ],
      durations: new Map<string, number | null>([...grid.durations, ["e", 30], ["f", 30]]),
    };
    const open = [
      { id: "cr1", ...cr({ target_start_time: "11:00" }) },
      { id: "cr2", ...cr({ kind: "add" as const, proposal_id: "f", target_day: null, target_start_time: null }) },
      { id: "cr3", ...cr({ target_start_time: "11:30" }) },
    ];
    const decisions = sweepDecisions(open, after);
    expect(decisions.map((d) => d.id)).toEqual(["cr1"]);
    expect(decisions[0].reason).toBeTruthy();
  });
  it("leaves a request the organizer already fulfilled by hand alone", () => {
    const open = [{ id: "cr1", ...cr({ target_start_time: "09:00" }) }];
    expect(sweepDecisions(open, grid)).toEqual([]);
  });
});

describe("compareChangeRequests", () => {
  it("ranks by reactions desc, then created_at asc, then id", () => {
    const counts = new Map([
      ["x", 2],
      ["y", 2],
      ["z", 5],
    ]);
    const rows = [
      { id: "x", created_at: "2026-08-01T10:00:00Z" },
      { id: "y", created_at: "2026-08-01T09:00:00Z" },
      { id: "z", created_at: "2026-08-01T11:00:00Z" },
    ].sort((a, b) => compareChangeRequests(a, b, counts));
    expect(rows.map((r) => r.id)).toEqual(["z", "y", "x"]);
  });
});

describe("describeChangeRequest", () => {
  const titles = new Map([
    ["a", "Intro to maps"],
    ["b", "Rust for PMs"],
  ]);
  const tracks = new Map([["t1", "Main room"]]);
  it("describes a move with its target", () => {
    const text = describeChangeRequest(
      { kind: "move", proposal_id: "a", other_proposal_id: null, target_day: "2026-08-01", target_start_time: "11:00", target_track_id: "t1" },
      titles,
      tracks,
    );
    expect(text).toContain("Intro to maps");
    expect(text).toContain("11:00");
    expect(text).toContain("Main room");
  });
  it("describes a swap and survives deleted proposals", () => {
    const text = describeChangeRequest(
      { kind: "swap", proposal_id: "a", other_proposal_id: "ghost", target_day: null, target_start_time: null, target_track_id: null },
      titles,
      tracks,
    );
    expect(text).toContain("Intro to maps");
    expect(text).toContain("removed session");
  });
});
