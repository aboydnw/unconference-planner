import { Field, Flex, Input, NativeSelect, Textarea } from "@chakra-ui/react";

import type { ProposalField } from "@/lib/types";

export interface ProposalFormValues {
  title?: string;
  description?: string;
  format?: string | null;
  duration_minutes?: number | null;
  custom_answers?: Record<string, string>;
}

export function ProposalFields({
  fields,
  values,
}: {
  fields: ProposalField[];
  values?: ProposalFormValues;
}) {
  return (
    <>
      <Field.Root required>
        <Field.Label>Title</Field.Label>
        <Input
          name="title"
          required
          defaultValue={values?.title ?? ""}
          placeholder="e.g. Mapping pipeline show &amp; tell"
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>Description</Field.Label>
        <Textarea
          name="description"
          rows={3}
          defaultValue={values?.description ?? ""}
          placeholder="What will you cover? What do you want from the group?"
        />
      </Field.Root>
      <Flex gap={4}>
        <Field.Root>
          <Field.Label>Format</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field name="format" defaultValue={values?.format ?? ""}>
              <option value="">Any</option>
              <option value="talk">Talk</option>
              <option value="discussion">Discussion</option>
              <option value="workshop">Workshop</option>
              <option value="hands-on">Hands-on</option>
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root>
          <Field.Label>Duration</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              name="duration_minutes"
              defaultValue={values?.duration_minutes ? String(values.duration_minutes) : ""}
            >
              <option value="">Flexible</option>
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Field.Root>
      </Flex>
      {fields.map((f) => {
        const val = values?.custom_answers?.[f.id] ?? "";
        const name = `custom_${f.id}`;
        return (
          <Field.Root key={f.id} required={f.required}>
            <Field.Label>{f.label}</Field.Label>
            {f.field_type === "longtext" ? (
              <Textarea name={name} rows={2} required={f.required} defaultValue={val} />
            ) : f.field_type === "select" ? (
              <NativeSelect.Root>
                <NativeSelect.Field name={name} defaultValue={val}>
                  <option value="">Select…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
            ) : (
              <Input name={name} required={f.required} defaultValue={val} />
            )}
          </Field.Root>
        );
      })}
    </>
  );
}
