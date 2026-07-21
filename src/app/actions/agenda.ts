"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function agendaPath(eventId: string): string {
  return `/dashboard/events/${eventId}/agenda`;
}

export async function addTimeSlot(eventId: string, formData: FormData) {
  const supabase = await createClient();
  const day = String(formData.get("day") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  if (!day || !start || !end) return;

  await supabase.from("time_slots").insert({
    event_id: eventId,
    day,
    start_time: start,
    end_time: end,
    label: String(formData.get("label") ?? "").trim(),
  });
  revalidatePath(agendaPath(eventId));
}

export async function deleteTimeSlot(eventId: string, slotId: string) {
  const supabase = await createClient();
  await supabase.from("time_slots").delete().eq("id", slotId);
  revalidatePath(agendaPath(eventId));
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

export async function assignProposal(
  eventId: string,
  proposalId: string,
  slotId: string,
  trackId: string,
) {
  const supabase = await createClient();
  await supabase
    .from("agenda_assignments")
    .delete()
    .eq("slot_id", slotId)
    .eq("track_id", trackId);
  await supabase
    .from("agenda_assignments")
    .delete()
    .eq("proposal_id", proposalId);
  await supabase.from("agenda_assignments").insert({
    event_id: eventId,
    proposal_id: proposalId,
    slot_id: slotId,
    track_id: trackId,
  });
  revalidatePath(agendaPath(eventId));
}

export async function unassignProposal(eventId: string, proposalId: string) {
  const supabase = await createClient();
  await supabase
    .from("agenda_assignments")
    .delete()
    .eq("proposal_id", proposalId);
  revalidatePath(agendaPath(eventId));
}
