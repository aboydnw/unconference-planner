import type { AgendaAssignment, AgendaBlock, Proposal, Track } from "@/lib/types";

export { formatDay as formatDayLabel } from "@/lib/types";

export const SLOT_MINUTES = 30;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function generateRowTimes(dayStart: string, dayEnd: string): string[] {
  const start = timeToMinutes(dayStart);
  const end = timeToMinutes(dayEnd);
  const rows: string[] = [];
  for (let m = start; m < end; m += SLOT_MINUTES) rows.push(minutesToTime(m));
  return rows;
}

export function durationRows(durationMinutes: number | null): number {
  if (!durationMinutes || durationMinutes <= 0) return 1;
  return Math.ceil(durationMinutes / SLOT_MINUTES);
}

export function sessionEndMinutes(
  startTime: string,
  durationMinutes: number | null,
): number {
  return timeToMinutes(startTime) + durationRows(durationMinutes) * SLOT_MINUTES;
}

export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function eventDays(
  startDate: string | null,
  endDate: string | null,
): string[] {
  if (!startDate) return [];
  const end = endDate ?? startDate;
  const days: string[] = [];
  const d = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export interface PlacementCheck {
  day: string;
  trackId: string;
  startTime: string;
  durationMinutes: number | null;
  dayStart: string;
  dayEnd: string;
  assignments: AgendaAssignment[];
  blocks: AgendaBlock[];
  proposalDurations: Map<string, number | null>;
}

export function canPlaceSession(c: PlacementCheck): boolean {
  const start = timeToMinutes(c.startTime);
  const end = sessionEndMinutes(c.startTime, c.durationMinutes);
  if (start < timeToMinutes(c.dayStart)) return false;
  if (end > timeToMinutes(c.dayEnd)) return false;
  for (const a of c.assignments) {
    if (a.day !== c.day || a.track_id !== c.trackId) continue;
    const aStart = timeToMinutes(a.start_time);
    const aEnd = sessionEndMinutes(
      a.start_time,
      c.proposalDurations.get(a.proposal_id) ?? null,
    );
    if (overlaps(start, end, aStart, aEnd)) return false;
  }
  for (const b of c.blocks) {
    if (b.day !== c.day) continue;
    if (overlaps(start, end, timeToMinutes(b.start_time), timeToMinutes(b.end_time)))
      return false;
  }
  return true;
}

export function blockConflictsWithSession(
  block: { day: string; start_time: string; end_time: string },
  assignments: AgendaAssignment[],
  proposalDurations: Map<string, number | null>,
): boolean {
  const bStart = timeToMinutes(block.start_time);
  const bEnd = timeToMinutes(block.end_time);
  for (const a of assignments) {
    if (a.day !== block.day) continue;
    const aStart = timeToMinutes(a.start_time);
    const aEnd = sessionEndMinutes(
      a.start_time,
      proposalDurations.get(a.proposal_id) ?? null,
    );
    if (overlaps(bStart, bEnd, aStart, aEnd)) return true;
  }
  return false;
}

export interface ScheduleEntry {
  kind: "session" | "block";
  startTime: string;
  title?: string;
  proposerName?: string;
  trackName?: string;
  durationMinutes?: number | null;
  label?: string;
  endTime?: string;
}

export interface ScheduleDay {
  day: string;
  entries: ScheduleEntry[];
}

export function buildAgendaSchedule(
  days: string[],
  assignments: AgendaAssignment[],
  blocks: AgendaBlock[],
  proposalsById: Map<string, Proposal>,
  tracksById: Map<string, Track>,
): ScheduleDay[] {
  return days.map((day) => {
    const entries: ScheduleEntry[] = [];
    for (const a of assignments.filter((x) => x.day === day)) {
      const p = proposalsById.get(a.proposal_id);
      if (!p) continue;
      entries.push({
        kind: "session",
        startTime: a.start_time,
        title: p.title,
        proposerName: p.proposer_name,
        trackName: tracksById.get(a.track_id)?.name ?? "",
        durationMinutes: p.duration_minutes,
      });
    }
    for (const b of blocks.filter((x) => x.day === day)) {
      entries.push({
        kind: "block",
        startTime: b.start_time,
        label: b.label,
        endTime: b.end_time,
      });
    }
    entries.sort((x, y) => timeToMinutes(x.startTime) - timeToMinutes(y.startTime));
    return { day, entries };
  });
}
