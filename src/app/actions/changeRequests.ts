"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import {
  crInputOf,
  evaluateChangeRequest,
  sweepDecisions,
  type CrInput,
} from "@/lib/changeRequests";
import { loadCrContext, sweepOpenChangeRequests } from "@/lib/crContext";
import { collectWarnings } from "@/lib/optimizer";
import { buildCustomAnswers, missingRequired } from "@/lib/proposalFields";
import { createClient } from "@/lib/supabase/server";
import type {
  ChangeRequest,
  ChangeRequestKind,
  ProposalField,
  UnconfEvent,
} from "@/lib/types";

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
  return { event, token: current.token, attendeeId: current.attendee.id };
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
  const { event, token, attendeeId } = await requireReviewEvent(code);
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
    // Without this the pitcher's own double-booking goes unchecked here and the
    // request is accepted only to evaluate as blocked the moment it is stored.
    ctx.grid.proposerOf.set(pseudoId, attendeeId);
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

function organizerAgendaPath(eventId: string): string {
  return `/dashboard/events/${eventId}/agenda`;
}

/**
 * Revalidates a change request against the live grid and applies it, sweeping
 * the requests it invalidates in the same transaction. Retries when a
 * concurrent apply bumped the grid version first.
 */
export async function applyChangeRequest(eventId: string, crId: string) {
  const supabase = await createClient();
  let failure = "Could not apply the change";

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ data: event }, { data: crRow }] = await Promise.all([
      supabase.from("events").select("*").eq("id", eventId).single<UnconfEvent>(),
      supabase.from("change_requests").select("*").eq("id", crId).single<ChangeRequest>(),
    ]);
    if (!event || !crRow) break;
    if (crRow.status !== "open") {
      failure = "This request has already been resolved";
      break;
    }

    const ctx = await loadCrContext(event);
    const outcome = evaluateChangeRequest(crInputOf(crRow), ctx.grid);
    if (!outcome.ok) {
      failure = `Blocked: ${outcome.reason}`;
      break;
    }
    if (!outcome.applicable) {
      failure = outcome.note;
      break;
    }

    const beforeById = new Map(ctx.grid.placements.map((p) => [p.proposalId, p]));
    const changed = outcome.after.filter((p) => {
      const b = beforeById.get(p.proposalId);
      return !b || b.day !== p.day || b.startTime !== p.startTime || b.trackId !== p.trackId;
    });

    const { data: openRows } = await supabase
      .from("change_requests")
      .select("*")
      .eq("event_id", eventId)
      .eq("status", "open")
      .neq("id", crId);
    const afterGrid = { ...ctx.grid, placements: outcome.after };
    const invalidations = sweepDecisions(
      ((openRows ?? []) as ChangeRequest[]).map(crInputOf),
      afterGrid,
    );

    const { error } = await supabase.rpc("apply_change_request_tx", {
      p_event: eventId,
      p_cr: crId,
      p_expected_version: event.grid_version,
      p_placements: changed.map((p) => ({
        proposal_id: p.proposalId,
        track_id: p.trackId,
        day: p.day,
        start_time: p.startTime,
      })),
      p_invalidations: invalidations,
    });

    if (!error) {
      // The invalidation list was computed before the apply; a request submitted
      // in that window would otherwise stay open against a grid that broke it.
      await sweepOpenChangeRequests(eventId);
      const titleById = new Map(ctx.proposals.map((p) => [p.id, p.title]));
      const before = collectWarnings(ctx.grid.placements, ctx.objective);
      const regressions = collectWarnings(outcome.after, ctx.objective)
        .filter((w) => !before.includes(w))
        .map((w) => {
          let out = w;
          for (const [pid, title] of titleById) out = out.replaceAll(pid, `“${title}”`);
          return out;
        });
      revalidatePath(organizerAgendaPath(eventId));
      if (regressions.length > 0) {
        redirect(
          `${organizerAgendaPath(eventId)}?notice=${encodeURIComponent(
            `Applied with trade-offs: ${regressions.join("; ")}`,
          )}`,
        );
      }
      redirect(organizerAgendaPath(eventId));
    }
    if (!String(error.message).includes("STALE_GRID")) break;
  }

  redirect(`${organizerAgendaPath(eventId)}?error=${encodeURIComponent(failure)}`);
}

export async function declineChangeRequest(eventId: string, crId: string) {
  const supabase = await createClient();
  await supabase
    .from("change_requests")
    .update({ status: "declined" })
    .eq("id", crId)
    .eq("event_id", eventId)
    .eq("status", "open");
  revalidatePath(organizerAgendaPath(eventId));
}
