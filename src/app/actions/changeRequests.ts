"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import { evaluateChangeRequest, type CrInput } from "@/lib/changeRequests";
import { loadCrContext } from "@/lib/crContext";
import { buildCustomAnswers, missingRequired } from "@/lib/proposalFields";
import { createClient } from "@/lib/supabase/server";
import type { ChangeRequestKind, ProposalField } from "@/lib/types";

function agendaPath(code: string): string {
  return `/e/${encodeURIComponent(code)}/agenda`;
}

function fail(code: string, message: string): never {
  redirect(`${agendaPath(code)}?error=${encodeURIComponent(message)}`);
}

async function requireReviewEvent(code: string) {
  const event = await getEventByCode(code);
  if (!event) redirect("/?error=Event+not+found");
  if (event.status !== "review") {
    fail(code, "Change requests are only open while the agenda is in review");
  }
  const current = await getCurrentAttendee(event.id);
  if (!current) fail(code, "Join the event first");
  return { event, token: current.token };
}

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function submitChangeRequest(code: string, formData: FormData) {
  const { event, token } = await requireReviewEvent(code);
  const kind = str(formData, "kind") as ChangeRequestKind;
  if (!["move", "swap", "add"].includes(kind)) fail(code, "Pick a change type");

  const cr: CrInput = {
    kind,
    proposal_id: str(formData, "proposal_id"),
    other_proposal_id: str(formData, "other_proposal_id") || null,
    target_day: str(formData, "target_day") || null,
    target_start_time: str(formData, "target_start_time") || null,
    target_track_id: str(formData, "target_track_id") || null,
  };
  if (!cr.proposal_id) fail(code, "Pick a session");
  if (kind === "move" && (!cr.target_day || !cr.target_start_time)) {
    fail(code, "Pick a target day and time for the move");
  }
  if (kind === "swap" && !cr.other_proposal_id) fail(code, "Pick the session to swap with");

  const ctx = await loadCrContext(event);
  const outcome = evaluateChangeRequest(cr, ctx.grid);
  if (!outcome.ok) fail(code, `That change would not work right now: ${outcome.reason}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_change_request", {
    p_token: token,
    p_kind: kind,
    p_proposal: cr.proposal_id,
    p_other: cr.other_proposal_id,
    p_day: cr.target_day,
    p_start: cr.target_start_time,
    p_track: cr.target_track_id,
    p_rationale: str(formData, "rationale"),
  });
  if (error) fail(code, "Could not submit the change request");
  revalidatePath(agendaPath(code));
  redirect(agendaPath(code));
}

export async function submitReviewSession(code: string, formData: FormData) {
  const { event, token } = await requireReviewEvent(code);
  const title = str(formData, "title");
  if (!title) fail(code, "Session title is required");

  const supabase = await createClient();
  const { data: fieldRows } = await supabase
    .from("proposal_fields")
    .select("*")
    .eq("event_id", event.id)
    .order("position");
  const fields = (fieldRows ?? []) as ProposalField[];
  const answers = buildCustomAnswers(fields, (fieldId) =>
    String(formData.get(`custom_${fieldId}`) ?? ""),
  );
  const missing = missingRequired(fields, answers);
  if (missing.length) fail(code, `Please fill in: ${missing.join(", ")}`);

  const targetDay = str(formData, "target_day") || null;
  const targetStart = str(formData, "target_start_time") || null;
  const targetTrack = str(formData, "target_track_id") || null;
  const durationRaw = str(formData, "duration_minutes");
  const duration = durationRaw ? parseInt(durationRaw, 10) : null;

  if (targetDay && targetStart) {
    const ctx = await loadCrContext(event);
    const pseudoId = "__new__";
    ctx.grid.durations.set(pseudoId, duration);
    const outcome = evaluateChangeRequest(
      {
        kind: "add",
        proposal_id: pseudoId,
        other_proposal_id: null,
        target_day: targetDay,
        target_start_time: targetStart,
        target_track_id: targetTrack,
      },
      ctx.grid,
    );
    if (!outcome.ok) fail(code, `That slot would not work: ${outcome.reason}`);
  }

  const { error } = await supabase.rpc("submit_review_session", {
    p_token: token,
    p_title: title,
    p_description: str(formData, "description"),
    p_format: str(formData, "format"),
    p_duration: duration,
    p_custom: answers,
    p_day: targetDay,
    p_start: targetStart,
    p_track: targetTrack,
    p_rationale: str(formData, "rationale"),
  });
  if (error) fail(code, "Could not submit the session pitch");
  revalidatePath(agendaPath(code));
  redirect(agendaPath(code));
}

export async function toggleCrReaction(code: string, crId: string) {
  const { token } = await requireReviewEvent(code);
  const supabase = await createClient();
  const { error } = await supabase.rpc("toggle_cr_reaction", {
    p_token: token,
    p_cr: crId,
  });
  if (error) fail(code, "Could not save your reaction");
  revalidatePath(agendaPath(code));
}

export async function withdrawChangeRequest(code: string, crId: string) {
  const { token } = await requireReviewEvent(code);
  const supabase = await createClient();
  await supabase.rpc("delete_own_change_request", { p_token: token, p_cr: crId });
  revalidatePath(agendaPath(code));
}
