"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { attendeeCookieName, getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import { buildCustomAnswers, missingRequired } from "@/lib/proposalFields";
import { createClient } from "@/lib/supabase/server";
import type { ProposalField } from "@/lib/types";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

async function collectAnswers(
  eventId: string,
  formData: FormData,
): Promise<{ answers: Record<string, string>; missing: string[] }> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("proposal_fields")
    .select("*")
    .eq("event_id", eventId)
    .order("position");
  const fields = (rows ?? []) as ProposalField[];
  const answers = buildCustomAnswers(fields, (fieldId) =>
    String(formData.get(`custom_${fieldId}`) ?? ""),
  );
  return { answers, missing: missingRequired(fields, answers) };
}

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

  const event = await getEventByCode(code);
  if (!event) redirect("/?error=Event+not+found");
  const token = await requireAttendeeToken(code);
  const { answers, missing } = await collectAnswers(event.id, formData);
  if (missing.length) {
    redirect(`${path}?error=${encodeURIComponent(`Please fill in: ${missing.join(", ")}`)}`);
  }

  const durationRaw = String(formData.get("duration_minutes") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_proposal", {
    p_token: token,
    p_title: title,
    p_description: String(formData.get("description") ?? "").trim(),
    p_format: String(formData.get("format") ?? ""),
    p_duration: durationRaw ? parseInt(durationRaw, 10) : null,
    p_custom: answers,
  });
  if (error) {
    redirect(`${path}?error=${encodeURIComponent("Could not submit proposal")}`);
  }
  revalidatePath(path);
  redirect(path);
}

export async function updateOwnProposal(
  code: string,
  proposalId: string,
  formData: FormData,
) {
  const path = `/e/${encodeURIComponent(code)}`;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`${path}?error=Session+title+is+required`);

  const event = await getEventByCode(code);
  if (!event) redirect("/?error=Event+not+found");
  const token = await requireAttendeeToken(code);
  const { answers, missing } = await collectAnswers(event.id, formData);
  if (missing.length) {
    redirect(`${path}?error=${encodeURIComponent(`Please fill in: ${missing.join(", ")}`)}`);
  }

  const durationRaw = String(formData.get("duration_minutes") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_proposal", {
    p_token: token,
    p_proposal: proposalId,
    p_title: title,
    p_description: String(formData.get("description") ?? "").trim(),
    p_format: String(formData.get("format") ?? ""),
    p_duration: durationRaw ? parseInt(durationRaw, 10) : null,
    p_custom: answers,
  });
  if (error) {
    redirect(`${path}?error=${encodeURIComponent("Could not update proposal")}`);
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
