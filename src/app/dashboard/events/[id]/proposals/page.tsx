import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Badge,
  Box,
  Button,
  Container,
  Field,
  Flex,
  Heading,
  Input,
  Link,
  NativeSelect,
  Stack,
  Table,
  Text,
  Textarea,
} from "@chakra-ui/react";

import { createProposal, deleteProposal, setProposalHidden } from "@/app/actions/events";
import { createClient } from "@/lib/supabase/server";
import { type Proposal, type UnconfEvent } from "@/lib/types";

export default async function EventProposalsPage({
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

  const [{ data: proposals }, { data: votes }] = await Promise.all([
    supabase.from("proposals").select("*").eq("event_id", id).order("created_at", { ascending: true }),
    supabase.from("votes").select("proposal_id").eq("event_id", id),
  ]);

  const voteCounts = new Map<string, number>();
  for (const v of votes ?? []) {
    voteCounts.set(v.proposal_id, (voteCounts.get(v.proposal_id) ?? 0) + 1);
  }
  const sortedProposals = [...((proposals ?? []) as Proposal[])].sort(
    (a, b) => (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0),
  );

  return (
    <Container maxW="4xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/dashboard/events/${event.id}`}>← {event.name}</NextLink>
          </Link>
          <Heading size="xl">Proposals ({sortedProposals.length})</Heading>
        </Stack>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <Stack gap={4}>
            {sortedProposals.length === 0 ? (
              <Text color="fg.muted">No proposals yet. Share the event code with your team.</Text>
            ) : (
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Session</Table.ColumnHeader>
                    <Table.ColumnHeader>Proposed by</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center">Would attend</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {sortedProposals.map((p) => (
                    <Table.Row key={p.id} opacity={p.hidden ? 0.5 : 1}>
                      <Table.Cell>
                        <Stack gap={0}>
                          <Text fontWeight="medium">
                            {p.title}
                            {p.hidden && (
                              <Badge ml={2} colorPalette="orange">hidden</Badge>
                            )}
                          </Text>
                          {p.description && (
                            <Text fontSize="sm" color="fg.muted">{p.description}</Text>
                          )}
                          <Text fontSize="xs" color="fg.muted">
                            {[p.format, p.duration_minutes ? `${p.duration_minutes} min` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </Stack>
                      </Table.Cell>
                      <Table.Cell>{p.proposer_name}</Table.Cell>
                      <Table.Cell textAlign="center" fontWeight="bold">
                        {voteCounts.get(p.id) ?? 0}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap={2} justify="flex-end">
                          <form action={setProposalHidden.bind(null, event.id, p.id, !p.hidden)}>
                            <Button type="submit" size="xs" variant="outline">
                              {p.hidden ? "Unhide" : "Hide"}
                            </Button>
                          </form>
                          <form action={deleteProposal.bind(null, event.id, p.id)}>
                            <Button type="submit" size="xs" variant="outline" colorPalette="red">
                              Delete
                            </Button>
                          </form>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}

            <Box borderTopWidth="1px" pt={5}>
              <form action={createProposal.bind(null, event.id)}>
                <Stack gap={4}>
                  <Heading size="sm">Add a session</Heading>
                  <Text color="fg.muted" fontSize="sm">
                    Add a session yourself — useful for ideas that come up in conversation before
                    attendees submit them.
                  </Text>
                  <Flex gap={4} wrap="wrap">
                    <Field.Root required flex="1" minW="240px">
                      <Field.Label>Title</Field.Label>
                      <Input name="title" placeholder="e.g. Field data QA" />
                    </Field.Root>
                    <Field.Root flex="1" minW="160px">
                      <Field.Label>Proposed by</Field.Label>
                      <Input name="proposer_name" placeholder="Organizer" />
                    </Field.Root>
                  </Flex>
                  <Field.Root>
                    <Field.Label>Description</Field.Label>
                    <Textarea name="description" rows={2} placeholder="What will this session cover?" />
                  </Field.Root>
                  <Flex gap={4} wrap="wrap">
                    <Field.Root>
                      <Field.Label>Format</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field name="format">
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
                        <NativeSelect.Field name="duration_minutes">
                          <option value="">Flexible</option>
                          <option value="30">30 min</option>
                          <option value="60">60 min</option>
                          <option value="90">90 min</option>
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Field.Root>
                  </Flex>
                  <Button type="submit" size="sm" colorPalette="teal" alignSelf="flex-start">
                    Add session
                  </Button>
                </Stack>
              </form>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}
