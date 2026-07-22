"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/types";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createEvent(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard?error=Event+name+is+required");

  let eventId: string | null = null;
  for (let attempt = 0; attempt < 5 && !eventId; attempt++) {
    const { data, error } = await supabase
      .from("events")
      .insert({
        owner_id: user.id,
        name,
        description: String(formData.get("description") ?? "").trim(),
        location: String(formData.get("location") ?? "").trim(),
        start_date: String(formData.get("start_date") ?? "") || null,
        end_date: String(formData.get("end_date") ?? "") || null,
        code: generateCode(),
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue;
      redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
    }
    eventId = data.id;
  }
  if (!eventId) redirect("/dashboard?error=Could+not+create+event");
  redirect(`/dashboard/events/${eventId}`);
}

export async function updateEvent(eventId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await supabase
    .from("events")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim(),
      location: String(formData.get("location") ?? "").trim(),
      start_date: String(formData.get("start_date") ?? "") || null,
      end_date: String(formData.get("end_date") ?? "") || null,
    })
    .eq("id", eventId);

  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function setEventStatus(eventId: string, status: EventStatus) {
  const { supabase } = await requireUser();
  await supabase.from("events").update({ status }).eq("id", eventId);
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function toggleAgendaPublished(
  eventId: string,
  published: boolean,
) {
  const { supabase } = await requireUser();
  await supabase
    .from("events")
    .update({ agenda_published: published })
    .eq("id", eventId);
  revalidatePath(`/dashboard/events/${eventId}/agenda`);
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await requireUser();
  await supabase.from("events").delete().eq("id", eventId);
  redirect("/dashboard");
}

export async function createProposal(eventId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const proposerName =
    String(formData.get("proposer_name") ?? "").trim() || "Organizer";
  const durationRaw = String(formData.get("duration_minutes") ?? "");

  await supabase.from("proposals").insert({
    event_id: eventId,
    attendee_id: null,
    proposer_name: proposerName,
    title,
    description: String(formData.get("description") ?? "").trim(),
    format: String(formData.get("format") ?? "").trim() || null,
    duration_minutes: durationRaw ? parseInt(durationRaw, 10) : null,
  });

  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function setProposalHidden(
  eventId: string,
  proposalId: string,
  hidden: boolean,
) {
  const { supabase } = await requireUser();
  await supabase.from("proposals").update({ hidden }).eq("id", proposalId);
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function deleteProposal(eventId: string, proposalId: string) {
  const { supabase } = await requireUser();
  await supabase.from("proposals").delete().eq("id", proposalId);
  revalidatePath(`/dashboard/events/${eventId}`);
}
