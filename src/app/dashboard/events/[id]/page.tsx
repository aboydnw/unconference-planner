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
  Stack,
  Table,
  Text,
  Textarea,
} from "@chakra-ui/react";

import {
  deleteProposal,
  setEventStatus,
  setProposalHidden,
  updateEvent,
} from "@/app/actions/events";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type EventStatus,
  type Proposal,
  type UnconfEvent,
} from "@/lib/types";

const STATUS_ORDER: EventStatus[] = [
  "draft",
  "proposals",
  "voting",
  "published",
  "archived",
];

export default async function EventAdminPage({
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

  const [{ data: proposals }, { data: votes }, { count: attendeeCount }] =
    await Promise.all([
      supabase
        .from("proposals")
        .select("*")
        .eq("event_id", id)
        .order("created_at", { ascending: true }),
      supabase.from("votes").select("proposal_id").eq("event_id", id),
      supabase
        .from("attendees")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id),
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
      <Stack gap={10}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href="/dashboard">← All events</NextLink>
          </Link>
          <Flex justify="space-between" align="center" gap={4} wrap="wrap">
            <Heading size="xl">{event.name}</Heading>
            <Badge
              colorPalette={event.status === "draft" ? "gray" : "teal"}
              size="lg"
            >
              {STATUS_LABELS[event.status]}
            </Badge>
          </Flex>
          <Text color="fg.muted">
            Event code:{" "}
            <Text as="span" fontFamily="mono" fontWeight="bold" fontSize="lg">
              {event.code}
            </Text>
            {" · "}Share link: <Text as="span" fontFamily="mono">/e/{event.code}</Text>
            {" · "}
            {attendeeCount ?? 0} attendee{(attendeeCount ?? 0) === 1 ? "" : "s"} joined
          </Text>
        </Stack>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <Stack gap={4}>
            <Heading size="md">Phase</Heading>
            <Text color="fg.muted" fontSize="sm">
              {STATUS_DESCRIPTIONS[event.status]}
            </Text>
            <Flex gap={2} wrap="wrap">
              {STATUS_ORDER.map((status) => (
                <form key={status} action={setEventStatus.bind(null, event.id, status)}>
                  <Button
                    type="submit"
                    size="sm"
                    variant={event.status === status ? "solid" : "outline"}
                    colorPalette={event.status === status ? "teal" : "gray"}
                    disabled={event.status === status}
                  >
                    {STATUS_LABELS[status]}
                  </Button>
                </form>
              ))}
            </Flex>
          </Stack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <Stack gap={4}>
            <Flex justify="space-between" align="center">
              <Heading size="md">
                Proposals ({sortedProposals.length})
              </Heading>
              <Link asChild color="teal.600" fontWeight="medium">
                <NextLink href={`/dashboard/events/${event.id}/agenda`}>
                  Build agenda →
                </NextLink>
              </Link>
            </Flex>
            {sortedProposals.length === 0 ? (
              <Text color="fg.muted">
                No proposals yet. Share the event code with your team.
              </Text>
            ) : (
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Session</Table.ColumnHeader>
                    <Table.ColumnHeader>Proposed by</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center">
                      Would attend
                    </Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">
                      Actions
                    </Table.ColumnHeader>
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
                              <Badge ml={2} colorPalette="orange">
                                hidden
                              </Badge>
                            )}
                          </Text>
                          {p.description && (
                            <Text fontSize="sm" color="fg.muted">
                              {p.description}
                            </Text>
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
                          <form
                            action={setProposalHidden.bind(null, event.id, p.id, !p.hidden)}
                          >
                            <Button type="submit" size="xs" variant="outline">
                              {p.hidden ? "Unhide" : "Hide"}
                            </Button>
                          </form>
                          <form action={deleteProposal.bind(null, event.id, p.id)}>
                            <Button
                              type="submit"
                              size="xs"
                              variant="outline"
                              colorPalette="red"
                            >
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
          </Stack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <form action={updateEvent.bind(null, event.id)}>
            <Stack gap={4}>
              <Heading size="md">Event details</Heading>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Input name="name" defaultValue={event.name} />
              </Field.Root>
              <Field.Root>
                <Field.Label>Location</Field.Label>
                <Input name="location" defaultValue={event.location} />
              </Field.Root>
              <Stack direction={{ base: "column", sm: "row" }} gap={4}>
                <Field.Root>
                  <Field.Label>Start date</Field.Label>
                  <Input
                    name="start_date"
                    type="date"
                    defaultValue={event.start_date ?? ""}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>End date</Field.Label>
                  <Input
                    name="end_date"
                    type="date"
                    defaultValue={event.end_date ?? ""}
                  />
                </Field.Root>
              </Stack>
              <Field.Root>
                <Field.Label>Description</Field.Label>
                <Textarea
                  name="description"
                  rows={3}
                  defaultValue={event.description}
                />
              </Field.Root>
              <Button type="submit" colorPalette="teal" alignSelf="flex-start">
                Save details
              </Button>
            </Stack>
          </form>
        </Box>
      </Stack>
    </Container>
  );
}
