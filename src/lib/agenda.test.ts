import { describe, expect, it } from "vitest";

import {
  blockConflictsWithSession,
  buildAgendaSchedule,
  canPlaceSession,
  durationRows,
  eventDays,
  generateRowTimes,
  minutesToTime,
  overlaps,
  sessionEndMinutes,
  timeToMinutes,
} from "@/lib/agenda";
import type { AgendaAssignment, AgendaBlock, Proposal, Track } from "@/lib/types";

describe("time helpers", () => {
  it("parses HH:MM and HH:MM:SS to minutes", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("09:30:00")).toBe(570);
  });
  it("formats minutes to HH:MM", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(570)).toBe("09:30");
  });
  it("generates 30-min rows across a window, end-exclusive", () => {
    expect(generateRowTimes("09:00", "10:30")).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("durations and spans", () => {
  it("converts duration to row count, null -> 1", () => {
    expect(durationRows(null)).toBe(1);
    expect(durationRows(30)).toBe(1);
    expect(durationRows(60)).toBe(2);
    expect(durationRows(90)).toBe(3);
  });
  it("computes session end in minutes from start + duration rows", () => {
    expect(sessionEndMinutes("09:00", 90)).toBe(540 + 90);
    expect(sessionEndMinutes("09:00", null)).toBe(540 + 30);
  });
  it("detects half-open interval overlap", () => {
    expect(overlaps(0, 30, 30, 60)).toBe(false);
    expect(overlaps(0, 60, 30, 90)).toBe(true);
  });
});

describe("eventDays", () => {
  it("returns inclusive day range", () => {
    expect(eventDays("2026-10-19", "2026-10-21")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
    ]);
  });
  it("single day when end is null or equal", () => {
    expect(eventDays("2026-10-19", null)).toEqual(["2026-10-19"]);
  });
  it("empty when no start", () => {
    expect(eventDays(null, null)).toEqual([]);
  });
});

const durMap = (entries: [string, number | null][]) => new Map(entries);

describe("canPlaceSession", () => {
  const base = {
    day: "2026-10-19",
    trackId: "t1",
    dayStart: "09:00",
    dayEnd: "17:00",
    assignments: [] as AgendaAssignment[],
    blocks: [] as AgendaBlock[],
    proposalDurations: durMap([]),
  };
  it("allows placement inside the window", () => {
    expect(canPlaceSession({ ...base, startTime: "09:00", durationMinutes: 90 })).toBe(true);
  });
  it("rejects when the span overflows day end", () => {
    expect(canPlaceSession({ ...base, startTime: "16:30", durationMinutes: 90 })).toBe(false);
  });
  it("rejects overlap with another session in the same track", () => {
    const assignments = [
      { id: "a", event_id: "e", proposal_id: "p", track_id: "t1", day: "2026-10-19", start_time: "09:00:00" },
    ] as AgendaAssignment[];
    expect(
      canPlaceSession({
        ...base,
        startTime: "09:30",
        durationMinutes: 60,
        assignments,
        proposalDurations: durMap([["p", 60]]),
      }),
    ).toBe(false);
  });
  it("allows a different track at the same time", () => {
    const assignments = [
      { id: "a", event_id: "e", proposal_id: "p", track_id: "t2", day: "2026-10-19", start_time: "09:00:00" },
    ] as AgendaAssignment[];
    expect(
      canPlaceSession({
        ...base,
        startTime: "09:00",
        durationMinutes: 60,
        assignments,
        proposalDurations: durMap([["p", 60]]),
      }),
    ).toBe(true);
  });
  it("rejects overlap with a full-width block", () => {
    const blocks = [
      { id: "b", event_id: "e", day: "2026-10-19", start_time: "12:00:00", end_time: "13:00:00", label: "Lunch" },
    ] as AgendaBlock[];
    expect(
      canPlaceSession({ ...base, startTime: "11:30", durationMinutes: 60, blocks }),
    ).toBe(false);
  });
});

describe("blockConflictsWithSession", () => {
  it("is true when a session overlaps the block span", () => {
    const assignments = [
      { id: "a", event_id: "e", proposal_id: "p", track_id: "t1", day: "2026-10-19", start_time: "12:30:00" },
    ] as AgendaAssignment[];
    expect(
      blockConflictsWithSession(
        { day: "2026-10-19", start_time: "12:00", end_time: "13:00" },
        assignments,
        durMap([["p", 30]]),
      ),
    ).toBe(true);
  });
  it("is false when no session overlaps", () => {
    expect(
      blockConflictsWithSession(
        { day: "2026-10-19", start_time: "12:00", end_time: "13:00" },
        [],
        durMap([]),
      ),
    ).toBe(false);
  });
});

describe("buildAgendaSchedule", () => {
  it("groups sessions and blocks per day, sorted by start", () => {
    const proposals = new Map<string, Proposal>([
      ["p", { id: "p", event_id: "e", attendee_id: null, proposer_name: "Ana", title: "STAC", description: "", format: null, duration_minutes: 60, hidden: false, created_at: "" }],
    ]);
    const tracks = new Map<string, Track>([["t1", { id: "t1", event_id: "e", name: "Main", position: 0 }]]);
    const assignments = [
      { id: "a", event_id: "e", proposal_id: "p", track_id: "t1", day: "2026-10-19", start_time: "13:00:00" },
    ] as AgendaAssignment[];
    const blocks = [
      { id: "b", event_id: "e", day: "2026-10-19", start_time: "12:00:00", end_time: "13:00:00", label: "Lunch" },
    ] as AgendaBlock[];
    const result = buildAgendaSchedule(["2026-10-19"], assignments, blocks, proposals, tracks);
    expect(result[0].entries.map((e) => e.kind)).toEqual(["block", "session"]);
    expect(result[0].entries[1].title).toBe("STAC");
    expect(result[0].entries[1].trackName).toBe("Main");
  });
});
