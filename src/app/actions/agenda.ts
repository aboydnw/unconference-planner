"use server";

import { revalidatePath } from "next/cache";

import {
  blockConflictsWithSession,
  canPlaceSession,
} from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import type {
  AgendaAssignment,
  AgendaBlock,
  Proposal,
  UnconfEvent,
} from "@/lib/types";

function agendaPath(eventId: string): string {
  return `/dashboard/events/${eventId}/agenda`;
}

function eventHomePath(eventId: string): string {
  return `/dashboard/events/${eventId}`;
}

export async function setDailyHours(eventId: string, formData: FormData) {
  const supabase = await createClient();
  const start = String(formData.get("agenda_day_start") ?? "");
  const end = String(formData.get("agenda_day_end") ?? "");
  if (!start || !end || end <= start) return;

  await supabase
    .from("events")
    .update({ agenda_day_start: start, agenda_day_end: end })
    .eq("id", eventId);
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
  });
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function unassignProposal(eventId: string, proposalId: string) {
  const supabase = await createClient();
  await supabase
    .from("agenda_assignments")
    .delete()
    .eq("proposal_id", proposalId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function addBlock(eventId: string, formData: FormData) {
  const day = String(formData.get("day") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  if (!day || !start || !end || end <= start) return;

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
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}

export async function deleteBlock(eventId: string, blockId: string) {
  const supabase = await createClient();
  await supabase.from("agenda_blocks").delete().eq("id", blockId);
  revalidatePath(agendaPath(eventId));
  revalidatePath(eventHomePath(eventId));
}
