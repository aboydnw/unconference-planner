import { eventDays } from "@/lib/agenda";
import { crInputOf, sweepDecisions, type CrGrid } from "@/lib/changeRequests";
import { buildInterestModel, type ObjectiveInput } from "@/lib/optimizer";
import { createClient } from "@/lib/supabase/server";
import type {
  AgendaAssignment,
  AgendaBlock,
  AttendeeUnavailability,
  ChangeRequest,
  Proposal,
  Track,
  UnconfEvent,
  Vote,
} from "@/lib/types";

/** The event fields the grid needs — satisfied by both organizer and public event rows. */
export interface CrEventInfo {
  id: string;
  start_date: string | null;
  end_date: string | null;
  agenda_day_start: string;
  agenda_day_end: string;
}

export interface CrContext {
  grid: CrGrid;
  objective: ObjectiveInput;
  proposals: Proposal[];
  tracks: Track[];
  assignments: AgendaAssignment[];
}

/** Loads the live grid and objective inputs used to validate and score change requests. */
export async function loadCrContext(event: CrEventInfo): Promise<CrContext> {
  const supabase = await createClient();
  const [
    { data: tracks },
    { data: proposals },
    { data: votes },
    { data: assignments },
    { data: blocks },
    { data: unavailability },
    { count: attendeeCount },
  ] = await Promise.all([
    supabase.from("tracks").select("*").eq("event_id", event.id).order("position"),
    supabase.from("proposals").select("*").eq("event_id", event.id).eq("hidden", false),
    supabase
      .from("votes")
      .select("proposal_id, attendee_id, tier")
      .eq("event_id", event.id),
    supabase.from("agenda_assignments").select("*").eq("event_id", event.id),
    supabase.from("agenda_blocks").select("*").eq("event_id", event.id),
    supabase.from("attendee_unavailability").select("*").eq("event_id", event.id),
    supabase
      .from("attendees")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id),
  ]);
  const proposalRows = (proposals ?? []) as Proposal[];
  const assignmentRows = (assignments ?? []) as AgendaAssignment[];
  const durations = new Map<string, number | null>(
    proposalRows.map((p) => [p.id, p.duration_minutes]),
  );
  const proposerOf = new Map(
    proposalRows.filter((p) => p.attendee_id).map((p) => [p.id, p.attendee_id!]),
  );
  const grid: CrGrid = {
    days: eventDays(event.start_date, event.end_date),
    dayStart: event.agenda_day_start.slice(0, 5),
    dayEnd: event.agenda_day_end.slice(0, 5),
    trackIds: ((tracks ?? []) as Track[]).map((t) => t.id),
    blocks: ((blocks ?? []) as AgendaBlock[]).map((b) => ({
      day: b.day,
      start_time: b.start_time.slice(0, 5),
      end_time: b.end_time.slice(0, 5),
    })),
    placements: assignmentRows.map((a) => ({
      proposalId: a.proposal_id,
      trackId: a.track_id,
      day: a.day,
      startTime: a.start_time.slice(0, 5),
    })),
    durations,
    proposerOf,
  };
  const objective: ObjectiveInput = {
    interest: buildInterestModel(
      proposalRows,
      (votes ?? []) as Vote[],
      attendeeCount ?? 0,
    ),
    durations,
    proposerOf,
    unavailability: ((unavailability ?? []) as AttendeeUnavailability[]).reduce(
      (acc, u) => {
        const w = {
          day: u.day,
          start_time: u.start_time.slice(0, 5),
          end_time: u.end_time.slice(0, 5),
        };
        acc.set(u.attendee_id, [...(acc.get(u.attendee_id) ?? []), w]);
        return acc;
      },
      new Map<string, { day: string; start_time: string; end_time: string }[]>(),
    ),
    baseline: null,
  };
  return {
    grid,
    objective,
    proposals: proposalRows,
    tracks: (tracks ?? []) as Track[],
    assignments: assignmentRows,
  };
}

/** Marks open change requests the current grid has made impossible. */
export async function sweepOpenChangeRequests(eventId: string): Promise<void> {
  const supabase = await createClient();
  const { data: open } = await supabase
    .from("change_requests")
    .select("*")
    .eq("event_id", eventId)
    .eq("status", "open");
  if (!open || open.length === 0) return;
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single<UnconfEvent>();
  if (!event) return;
  const ctx = await loadCrContext(event);
  const decisions = sweepDecisions((open as ChangeRequest[]).map(crInputOf), ctx.grid);
  for (const d of decisions) {
    await supabase
      .from("change_requests")
      .update({ status: "invalidated", invalid_reason: d.reason })
      .eq("id", d.id)
      .eq("status", "open");
  }
}
