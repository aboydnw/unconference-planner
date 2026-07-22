"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseFieldOptions } from "@/lib/proposalFields";
import { createClient } from "@/lib/supabase/server";
import type { ProposalField, ProposalFieldType } from "@/lib/types";

const FIELD_TYPES: ProposalFieldType[] = ["text", "longtext", "select"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function formPath(eventId: string): string {
  return `/dashboard/events/${eventId}/proposals/form`;
}

function readType(formData: FormData): ProposalFieldType {
  const t = String(formData.get("field_type") ?? "text") as ProposalFieldType;
  return FIELD_TYPES.includes(t) ? t : "text";
}

export async function addProposalField(eventId: string, formData: FormData) {
  const supabase = await requireUser();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;

  const fieldType = readType(formData);
  const options = parseFieldOptions(String(formData.get("options") ?? ""));
  if (fieldType === "select" && options.length === 0) return;

  const { data: existing } = await supabase
    .from("proposal_fields")
    .select("position")
    .eq("event_id", eventId)
    .order("position", { ascending: false })
    .limit(1);
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { error } = await supabase.from("proposal_fields").insert({
    event_id: eventId,
    label,
    field_type: fieldType,
    options,
    required: formData.get("required") === "on",
    position,
  });
  if (error) return;
  revalidatePath(formPath(eventId));
}

export async function updateProposalField(
  eventId: string,
  fieldId: string,
  formData: FormData,
) {
  const supabase = await requireUser();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;

  const fieldType = readType(formData);
  const options = parseFieldOptions(String(formData.get("options") ?? ""));
  if (fieldType === "select" && options.length === 0) return;

  const { error } = await supabase
    .from("proposal_fields")
    .update({
      label,
      field_type: fieldType,
      options,
      required: formData.get("required") === "on",
    })
    .eq("id", fieldId);
  if (error) return;
  revalidatePath(formPath(eventId));
}

export async function deleteProposalField(eventId: string, fieldId: string) {
  const supabase = await requireUser();
  const { error } = await supabase
    .from("proposal_fields")
    .delete()
    .eq("id", fieldId);
  if (error) return;
  revalidatePath(formPath(eventId));
}

export async function moveProposalField(
  eventId: string,
  fieldId: string,
  direction: "up" | "down",
) {
  const supabase = await requireUser();
  const { data: rows } = await supabase
    .from("proposal_fields")
    .select("*")
    .eq("event_id", eventId)
    .order("position");
  const fields = (rows ?? []) as ProposalField[];
  const idx = fields.findIndex((f) => f.id === fieldId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= fields.length) return;

  const a = fields[idx];
  const b = fields[swapIdx];
  const { error: errA } = await supabase
    .from("proposal_fields")
    .update({ position: b.position })
    .eq("id", a.id);
  if (errA) return;
  const { error: errB } = await supabase
    .from("proposal_fields")
    .update({ position: a.position })
    .eq("id", b.id);
  if (errB) return;
  revalidatePath(formPath(eventId));
}
