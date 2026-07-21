"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { attendeeCookieName, getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import { createClient } from "@/lib/supabase/server";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function findEvent(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) redirect("/?error=Enter+an+event+code");
  const event = await getEventByCode(code);
  if (!event) redirect("/?error=No+event+found+with+that+code");
  redirect(`/e/${encodeURIComponent(code.toUpperCase())}`);
}

export async function joinEvent(code: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const path = `/e/${encodeURIComponent(code)}`;
  if (!name) redirect(`${path}?error=Enter+your+name`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_event", {
    p_code: code,
    p_name: name,
  });
  if (error || !data) {
    redirect(`${path}?error=${encodeURIComponent("Could not join this event")}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(attendeeCookieName(data.event_id), data.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  revalidatePath(path);
  redirect(path);
}

async function requireAttendeeToken(code: string): Promise<string> {
  const path = `/e/${encodeURIComponent(code)}`;
  const event = await getEventByCode(code);
  if (!event) redirect("/?error=Event+not+found");
  const current = await getCurrentAttendee(event.id);
  if (!current) redirect(`${path}?error=Join+the+event+first`);
  return current.token;
}

export async function submitProposal(code: string, formData: FormData) {
  const path = `/e/${encodeURIComponent(code)}`;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`${path}?error=Session+title+is+required`);

  const token = await requireAttendeeToken(code);
  const durationRaw = String(formData.get("duration_minutes") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_proposal", {
    p_token: token,
    p_title: title,
    p_description: String(formData.get("description") ?? "").trim(),
    p_format: String(formData.get("format") ?? ""),
    p_duration: durationRaw ? parseInt(durationRaw, 10) : null,
  });
  if (error) {
    redirect(`${path}?error=${encodeURIComponent("Could not submit proposal")}`);
  }
  revalidatePath(path);
  redirect(path);
}

export async function deleteOwnProposal(code: string, proposalId: string) {
  const token = await requireAttendeeToken(code);
  const supabase = await createClient();
  await supabase.rpc("delete_own_proposal", {
    p_token: token,
    p_proposal: proposalId,
  });
  revalidatePath(`/e/${encodeURIComponent(code)}`);
}

export async function toggleVote(code: string, proposalId: string) {
  const token = await requireAttendeeToken(code);
  const supabase = await createClient();
  await supabase.rpc("toggle_vote", {
    p_token: token,
    p_proposal: proposalId,
  });
  revalidatePath(`/e/${encodeURIComponent(code)}`);
}
