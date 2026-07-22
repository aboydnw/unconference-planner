import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Box,
  Button,
  Checkbox,
  Container,
  Field,
  Flex,
  Heading,
  Input,
  Link,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import {
  addProposalField,
  deleteProposalField,
  moveProposalField,
  updateProposalField,
} from "@/app/actions/proposalFields";
import { createClient } from "@/lib/supabase/server";
import { type ProposalField, type UnconfEvent } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  text: "Short text",
  longtext: "Long text",
  select: "Dropdown",
};

export default async function ProposalFormSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single<UnconfEvent>();
  if (!event) notFound();

  const { data: rows } = await supabase
    .from("proposal_fields")
    .select("*")
    .eq("event_id", id)
    .order("position");
  const fields = (rows ?? []) as ProposalField[];

  return (
    <Container maxW="3xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/dashboard/events/${id}/proposals`}>← Proposals</NextLink>
          </Link>
          <Heading size="xl">Proposal form fields</Heading>
          <Text color="fg.muted">
            Add custom questions to the proposal form. Title, description, format,
            and duration are always shown.
          </Text>
        </Stack>

        <Stack gap={4}>
          {fields.length === 0 && (
            <Text color="fg.muted">No custom fields yet.</Text>
          )}
          {fields.map((f, i) => (
            <Box key={f.id} borderWidth="1px" borderRadius="lg" p={5}>
              <Stack gap={3}>
                <Flex justify="space-between" align="center" gap={2}>
                  <Text fontWeight="medium">{TYPE_LABELS[f.field_type]}</Text>
                  <Flex gap={1}>
                    <form action={moveProposalField.bind(null, id, f.id, "up")}>
                      <Button type="submit" size="2xs" variant="ghost" disabled={i === 0}>
                        ↑
                      </Button>
                    </form>
                    <form action={moveProposalField.bind(null, id, f.id, "down")}>
                      <Button
                        type="submit"
                        size="2xs"
                        variant="ghost"
                        disabled={i === fields.length - 1}
                      >
                        ↓
                      </Button>
                    </form>
                    <form action={deleteProposalField.bind(null, id, f.id)}>
                      <Button type="submit" size="2xs" variant="ghost" colorPalette="red">
                        Delete
                      </Button>
                    </form>
                  </Flex>
                </Flex>
                <form action={updateProposalField.bind(null, id, f.id)}>
                  <Stack gap={3}>
                    <Field.Root required>
                      <Field.Label>Label</Field.Label>
                      <Input name="label" defaultValue={f.label} />
                    </Field.Root>
                    <Flex gap={3} wrap="wrap" align="flex-end">
                      <Field.Root>
                        <Field.Label>Type</Field.Label>
                        <NativeSelect.Root>
                          <NativeSelect.Field name="field_type" defaultValue={f.field_type}>
                            <option value="text">Short text</option>
                            <option value="longtext">Long text</option>
                            <option value="select">Dropdown</option>
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Field.Root>
                      <Checkbox.Root name="required" defaultChecked={f.required}>
                        <Checkbox.HiddenInput />
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Label>Required</Checkbox.Label>
                      </Checkbox.Root>
                    </Flex>
                    <Field.Root>
                      <Field.Label>Dropdown options (one per line)</Field.Label>
                      <Textarea name="options" rows={2} defaultValue={f.options.join("\n")} />
                    </Field.Root>
                    <Button type="submit" size="sm" alignSelf="flex-start">
                      Save field
                    </Button>
                  </Stack>
                </form>
              </Stack>
            </Box>
          ))}
        </Stack>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <form action={addProposalField.bind(null, id)}>
            <Stack gap={4}>
              <Heading size="md">Add a field</Heading>
              <Field.Root required>
                <Field.Label>Label</Field.Label>
                <Input name="label" placeholder="e.g. Experience level" />
              </Field.Root>
              <Flex gap={3} wrap="wrap" align="flex-end">
                <Field.Root>
                  <Field.Label>Type</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field name="field_type" defaultValue="text">
                      <option value="text">Short text</option>
                      <option value="longtext">Long text</option>
                      <option value="select">Dropdown</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                </Field.Root>
                <Checkbox.Root name="required">
                  <Checkbox.HiddenInput />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Required</Checkbox.Label>
                </Checkbox.Root>
              </Flex>
              <Field.Root>
                <Field.Label>Dropdown options (one per line)</Field.Label>
                <Textarea name="options" rows={2} placeholder={"Beginner\nIntermediate\nAdvanced"} />
              </Field.Root>
              <Button type="submit" colorPalette="teal" alignSelf="flex-start">
                Add field
              </Button>
            </Stack>
          </form>
        </Box>
      </Stack>
    </Container>
  );
}
