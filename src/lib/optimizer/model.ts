import {
  generateRowTimes,
  overlaps,
  sessionEndMinutes,
  timeToMinutes,
} from "@/lib/agenda";

export interface Placement {
  proposalId: string;
  trackId: string;
  day: string;
  startTime: string;
}

export interface GridShape {
  days: string[];
  dayStart: string;
  dayEnd: string;
  trackIds: string[];
  blocks: { day: string; start_time: string; end_time: string }[];
}

export function candidateStarts(
  shape: GridShape,
  durationMinutes: number | null,
): { day: string; startTime: string }[] {
  const out: { day: string; startTime: string }[] = [];
  const dayEndMin = timeToMinutes(shape.dayEnd);
  for (const day of shape.days) {
    const dayBlocks = shape.blocks.filter((b) => b.day === day);
    for (const startTime of generateRowTimes(shape.dayStart, shape.dayEnd)) {
      const start = timeToMinutes(startTime);
      const end = sessionEndMinutes(startTime, durationMinutes);
      if (end > dayEndMin) continue;
      const hitsBlock = dayBlocks.some((b) =>
        overlaps(start, end, timeToMinutes(b.start_time), timeToMinutes(b.end_time)),
      );
      if (!hitsBlock) out.push({ day, startTime });
    }
  }
  return out;
}

export function timesOverlap(
  a: Placement,
  b: Placement,
  durations: Map<string, number | null>,
): boolean {
  if (a.day !== b.day) return false;
  return overlaps(
    timeToMinutes(a.startTime),
    sessionEndMinutes(a.startTime, durations.get(a.proposalId) ?? null),
    timeToMinutes(b.startTime),
    sessionEndMinutes(b.startTime, durations.get(b.proposalId) ?? null),
  );
}

export function freeTrack(
  shape: GridShape,
  placements: Placement[],
  durations: Map<string, number | null>,
  day: string,
  startTime: string,
  durationMinutes: number | null,
): string | null {
  const start = timeToMinutes(startTime);
  const end = sessionEndMinutes(startTime, durationMinutes);
  for (const trackId of shape.trackIds) {
    const busy = placements.some((p) => {
      if (p.trackId !== trackId || p.day !== day) return false;
      return overlaps(
        start,
        end,
        timeToMinutes(p.startTime),
        sessionEndMinutes(p.startTime, durations.get(p.proposalId) ?? null),
      );
    });
    if (!busy) return trackId;
  }
  return null;
}
