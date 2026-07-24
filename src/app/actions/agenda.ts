"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  SLOT_MINUTES,
  blockConflictsWithSession,
  canPlaceSession,
  eventDays,
  minutesToTime,
  sessionEndMinutes,
  timeToMinutes,
} from "@/lib/agenda";
import { sweepOpenChangeRequests } from "@/lib/crContext";
import { optimize } from "@/lib/optimizer";
import { createClient } from "@/lib/supabase/server";
import type {
  AgendaAssignment,
  AgendaBlock,
  AttendeeUnavailability,
  Proposal,
  Track,
  UnconfEvent,
  Vote,
} from "@/lib/types";

function agendaPath(eventId: string): string {
  return `/dashboard/events/${eventId}/agenda`;
}

function eventHomePath(eventId: string): string {
  return `/dashboard/events/${eventId}`;
}

function snapDown(t: string): string {
  const m = timeToMinutes(t);
  return minutesToTime(m - (m % SLOT_MINUTES));
}

function snapUp(t: string): string {
  const m = timeToMinutes(t);
  const remainder = m % SLOT_MINUTES;
  return minutesToTime(remainder ? m + (SLOT_MINUTES - remainder) : m);
}

export async function setDailyHours(eventId: string, formData: FormData) {
  const start = String(formData.get("agenda_day_start") ?? "");
  const end = String(formData.get("agenda_day_end") ?? "");
  if (!start || !end || end <= start) return;

  const ctx = await loadPlacementContext(eventId);
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const sessionOutside = ctx.assignments.some((a) => {
    const s = timeToMinutes(a.start_time);
    const e = sessionEndMinutes(
      a.start_time,
      ctx.proposalDurations.get(a.proposal_id) ?? null,
    );
    return s < startMin || e > endMin;
  });
  const blockOutside = ctx.blocks.some(
    (b) => timeToMinutes(b.start_time) < startMin || timeToMinutes(b.end_time) > endMin,
  );
  if (sessionOutside || blockOutside) return;

  await ctx.supabase
    .from("events")
    .update({ agenda_day_start: start, agenda_day_end: end })
    .eq("id", eventId);
  await sweepOpenChangeRequests(eventId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function addTrack(eventId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const { data: existing } = await supabase
    .from("tracks")
    .select("position")
    .eq("event_id", eventId)
    .order("position", { ascending: false })
    .limit(1);
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  await supabase.from("tracks").insert({ event_id: eventId, name, position });
  revalidatePath(agendaPath(eventId));
}

export async function deleteTrack(eventId: string, trackId: string) {
  const supabase = await createClient();
  await supabase.from("tracks").delete().eq("id", trackId);
  await sweepOpenChangeRequests(eventId);
  revalidatePath(agendaPath(eventId));
}

async function loadPlacementContext(eventId: string) {
  const supabase = await createClient();
  const [{ data: event }, { data: assignments }, { data: blocks }, { data: proposals }] =
    await Promise.all([
      supabase.from("events").select("*").eq("id", eventId).single<UnconfEvent>(),
      supabase.from("agenda_assignments").select("*").eq("event_id", eventId),
      supabase.from("agenda_blocks").select("*").eq("event_id", eventId),
      supabase.from("proposals").select("*").eq("event_id", eventId),
    ]);
  const proposalDurations = new Map<string, number | null>(
    ((proposals ?? []) as Proposal[]).map((p) => [p.id, p.duration_minutes]),
  );
  return {
    supabase,
    event: event as UnconfEvent | null,
    assignments: (assignments ?? []) as AgendaAssignment[],
    blocks: (blocks ?? []) as AgendaBlock[],
    proposalDurations,
  };
}

export async function assignProposal(
  eventId: string,
  proposalId: string,
  trackId: string,
  day: string,
  startTime: string,
) {
  const ctx = await loadPlacementContext(eventId);
  if (!ctx.event) return;

  const { data: track } = await ctx.supabase
    .from("tracks")
    .select("id")
    .eq("id", trackId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!track) return;

  const otherAssignments = ctx.assignments.filter(
    (a) => a.proposal_id !== proposalId,
  );
  const allowed = canPlaceSession({
    day,
    trackId,
    startTime,
    durationMinutes: ctx.proposalDurations.get(proposalId) ?? null,
    dayStart: ctx.event.agenda_day_start,
    dayEnd: ctx.event.agenda_day_end,
    assignments: otherAssignments,
    blocks: ctx.blocks,
    proposalDurations: ctx.proposalDurations,
  });
  if (!allowed) return;

  await ctx.supabase
    .from("agenda_assignments")
    .delete()
    .eq("proposal_id", proposalId);
  await ctx.supabase.from("agenda_assignments").insert({
    event_id: eventId,
    proposal_id: proposalId,
    track_id: trackId,
    day,
    start_time: startTime,
    pinned: true,
  });
  await sweepOpenChangeRequests(eventId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function setAssignmentPinned(
  eventId: string,
  proposalId: string,
  pinned: boolean,
) {
  const supabase = await createClient();
  await supabase
    .from("agenda_assignments")
    .update({ pinned })
    .eq("event_id", eventId)
    .eq("proposal_id", proposalId);
  revalidatePath(agendaPath(eventId));
}

export async function generateDraft(eventId: string) {
  const supabase = await createClient();
  const [
    { data: event },
    { data: tracks },
    { data: proposals },
    { data: votes },
    { data: assignments },
    { data: blocks },
    { data: unavailability },
    { count: attendeeCount },
  ] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single<UnconfEvent>(),
    supabase.from("tracks").select("*").eq("event_id", eventId).order("position"),
    supabase.from("proposals").select("*").eq("event_id", eventId),
    supabase.from("votes").select("proposal_id, attendee_id, tier").eq("event_id", eventId),
    supabase.from("agenda_assignments").select("*").eq("event_id", eventId),
    supabase.from("agenda_blocks").select("*").eq("event_id", eventId),
    supabase.from("attendee_unavailability").select("*").eq("event_id", eventId),
    supabase
      .from("attendees")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
  ]);
  if (!event) return;

  const days = eventDays(event.start_date, event.end_date);
  const trackRows = (tracks ?? []) as Track[];
  if (days.length === 0 || trackRows.length === 0) {
    redirect(
      `${agendaPath(eventId)}?error=${encodeURIComponent(
        "Set event dates and add at least one room before generating a draft",
      )}`,
    );
  }

  const assignmentRows = (assignments ?? []) as AgendaAssignment[];
  const pinnedIds = new Set(
    assignmentRows.filter((a) => a.pinned).map((a) => a.proposal_id),
  );
  // Hidden sessions aren't candidates, but a pinned one still occupies its cell —
  // the optimizer needs its duration to schedule around it.
  const schedulable = ((proposals ?? []) as Proposal[]).filter(
    (p) => !p.hidden || pinnedIds.has(p.id),
  );
  const seed = Date.now() % 2147483647;
  const result = optimize({
    proposals: schedulable,
    votes: (votes ?? []) as Vote[],
    attendeeCount: attendeeCount ?? 0,
    unavailability: (unavailability ?? []) as AttendeeUnavailability[],
    shape: {
      days,
      dayStart: event.agenda_day_start,
      dayEnd: event.agenda_day_end,
      trackIds: trackRows.map((t) => t.id),
      blocks: (blocks ?? []) as AgendaBlock[],
    },
    currentDraft: assignmentRows.map((a) => ({
      proposalId: a.proposal_id,
      trackId: a.track_id,
      day: a.day,
      startTime: a.start_time.slice(0, 5),
    })),
    pinnedIds,
    seed,
  });

  const { error } = await supabase.rpc("replace_draft_assignments", {
    p_event: eventId,
    p_seed: seed,
    p_placements: result.placements.map((p) => ({
      proposal_id: p.proposalId,
      track_id: p.trackId,
      day: p.day,
      start_time: p.startTime,
    })),
  });
  if (error) {
    redirect(
      `${agendaPath(eventId)}?error=${encodeURIComponent("Could not generate the draft")}`,
    );
  }
  await sweepOpenChangeRequests(eventId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function unassignProposal(eventId: string, proposalId: string) {
  const supabase = await createClient();
  await supabase
    .from("agenda_assignments")
    .delete()
    .eq("proposal_id", proposalId);
  await sweepOpenChangeRequests(eventId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function addBlock(eventId: string, formData: FormData) {
  const day = String(formData.get("day") ?? "");
  const rawStart = String(formData.get("start_time") ?? "");
  const rawEnd = String(formData.get("end_time") ?? "");
  if (!day || !rawStart || !rawEnd || rawEnd <= rawStart) return;

  const start = snapDown(rawStart);
  const end = snapUp(rawEnd);
  if (end <= start) return;

  const ctx = await loadPlacementContext(eventId);
  const conflicts = blockConflictsWithSession(
    { day, start_time: start, end_time: end },
    ctx.assignments,
    ctx.proposalDurations,
  );
  if (conflicts) return;

  await ctx.supabase.from("agenda_blocks").insert({
    event_id: eventId,
    day,
    start_time: start,
    end_time: end,
    label: String(formData.get("label") ?? "").trim(),
  });
  await sweepOpenChangeRequests(eventId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function deleteBlock(eventId: string, blockId: string) {
  const supabase = await createClient();
  await supabase.from("agenda_blocks").delete().eq("id", blockId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}
