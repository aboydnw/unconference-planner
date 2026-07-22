import type { ProposalField } from "@/lib/types";

export function parseFieldOptions(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function buildCustomAnswers(
  fields: ProposalField[],
  read: (fieldId: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = read(f.id).trim();
    if (v) out[f.id] = v;
  }
  return out;
}

export function missingRequired(
  fields: ProposalField[],
  answers: Record<string, string>,
): string[] {
  return fields.filter((f) => f.required && !answers[f.id]).map((f) => f.label);
}
