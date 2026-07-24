import { describe, expect, it } from "vitest";

import { candidateStarts, freeTrack, timesOverlap } from "@/lib/optimizer/model";
import type { GridShape, Placement } from "@/lib/optimizer/model";

const shape: GridShape = {
  days: ["2026-08-01"],
  dayStart: "09:00",
  dayEnd: "11:00",
  trackIds: ["t1", "t2"],
  blocks: [{ day: "2026-08-01", start_time: "10:00", end_time: "10:30" }],
};
const durations = new Map<string, number | null>([
  ["p30", 30],
  ["p60", 60],
  ["q30", null],
]);

describe("candidateStarts", () => {
  it("skips block rows and keeps sessions inside the day", () => {
    expect(candidateStarts(shape, 30).map((c) => c.startTime)).toEqual([
      "09:00",
      "09:30",
      "10:30",
    ]);
  });
  it("excludes starts whose duration crosses a block or the day end", () => {
    expect(candidateStarts(shape, 60).map((c) => c.startTime)).toEqual(["09:00"]);
  });
});

describe("freeTrack", () => {
  const placed: Placement[] = [
    { proposalId: "p60", trackId: "t1", day: "2026-08-01", startTime: "09:00" },
  ];
  it("returns lowest-index free track", () => {
    expect(freeTrack(shape, placed, durations, "2026-08-01", "09:30", 30)).toBe("t2");
  });
  it("returns t1 when it is free", () => {
    expect(freeTrack(shape, placed, durations, "2026-08-01", "10:30", 30)).toBe("t1");
  });
  it("returns null when all tracks are busy", () => {
    const both = [
      ...placed,
      { proposalId: "q30", trackId: "t2", day: "2026-08-01", startTime: "09:30" },
    ];
    expect(freeTrack(shape, both, durations, "2026-08-01", "09:30", 30)).toBeNull();
  });
});

describe("timesOverlap", () => {
  it("detects overlap on the same day and not across days", () => {
    const a: Placement = { proposalId: "p60", trackId: "t1", day: "2026-08-01", startTime: "09:00" };
    const b: Placement = { proposalId: "p30", trackId: "t2", day: "2026-08-01", startTime: "09:30" };
    const c: Placement = { proposalId: "q30", trackId: "t1", day: "2026-08-02", startTime: "09:00" };
    expect(timesOverlap(a, b, durations)).toBe(true);
    expect(timesOverlap(a, c, durations)).toBe(false);
  });
});
