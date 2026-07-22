export type EventStatus =
  | "draft"
  | "proposals"
  | "voting"
  | "published"
  | "archived";

export interface UnconfEvent {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  code: string;
  status: EventStatus;
  agenda_published: boolean;
  agenda_day_start: string;
  agenda_day_end: string;
  created_at: string;
}

export interface PublicEvent {
  id: string;
  name: string;
  description: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  status: EventStatus;
  agenda_published: boolean;
}

export interface Attendee {
  id: string;
  event_id: string;
  name: string;
}

export interface Proposal {
  id: string;
  event_id: string;
  attendee_id: string | null;
  proposer_name: string;
  title: string;
  description: string;
  format: string | null;
  duration_minutes: number | null;
  hidden: boolean;
  created_at: string;
}

export interface Vote {
  proposal_id: string;
  attendee_id: string;
}

export interface Track {
  id: string;
  event_id: string;
  name: string;
  position: number;
}

export interface AgendaAssignment {
  id: string;
  event_id: string;
  proposal_id: string;
  track_id: string;
  day: string;
  start_time: string;
}

export interface AgendaBlock {
  id: string;
  event_id: string;
  day: string;
  start_time: string;
  end_time: string;
  label: string;
}

export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  proposals: "Collecting proposals",
  voting: "Voting open",
  published: "Agenda published",
  archived: "Archived",
};

export const STATUS_DESCRIPTIONS: Record<EventStatus, string> = {
  draft: "Only you can see this event. Open proposals when you're ready.",
  proposals: "Attendees can join, submit session proposals, and vote.",
  voting: "Proposal submissions are closed. Attendees can still vote.",
  published: "Proposals and voting are closed. Attendees see the final agenda.",
  archived: "The event is over. Attendees can no longer access it.",
};

export function formatTime(t: string): string {
  return t.slice(0, 5);
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "Dates TBD";
  const s = formatDay(start);
  if (!end || end === start) return s;
  return `${s} – ${formatDay(end)}`;
}
