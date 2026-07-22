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

  const { data: existing } = await supabase
    .from("proposal_fields")
    .select("position")
    .eq("event_id", eventId)
    .order("position", { ascending: false })
    .limit(1);
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  await supabase.from("proposal_fields").insert({
    event_id: eventId,
    label,
    field_type: readType(formData),
    options: parseFieldOptions(String(formData.get("options") ?? "")),
    required: formData.get("required") === "on",
    position,
  });
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

  await supabase
    .from("proposal_fields")
    .update({
      label,
      field_type: readType(formData),
      options: parseFieldOptions(String(formData.get("options") ?? "")),
      required: formData.get("required") === "on",
    })
    .eq("id", fieldId);
  revalidatePath(formPath(eventId));
}

export async function deleteProposalField(eventId: string, fieldId: string) {
  const supabase = await requireUser();
  await supabase.from("proposal_fields").delete().eq("id", fieldId);
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
  await supabase.from("proposal_fields").update({ position: b.position }).eq("id", a.id);
  await supabase.from("proposal_fields").update({ position: a.position }).eq("id", b.id);
  revalidatePath(formPath(eventId));
}
