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
  Text,
  Textarea,
} from "@chakra-ui/react";

import { setEventStatus, updateEvent } from "@/app/actions/events";
import { buildAgendaSchedule, eventDays } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type AgendaAssignment,
  type AgendaBlock,
  type EventStatus,
  type Proposal,
  type Track,
  type UnconfEvent,
} from "@/lib/types";

import { AgendaSummary } from "./AgendaSummary";
import { CollapsibleBox } from "./CollapsibleBox";
import { CopyLinkButton } from "./CopyLinkButton";

const STATUS_ORDER: EventStatus[] = ["draft", "proposals", "voting", "published", "archived"];

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

  const [{ data: proposals }, { count: attendeeCount }, { data: tracks }, { data: assignments }, { data: blocks }] =
    await Promise.all([
      supabase.from("proposals").select("*").eq("event_id", id),
      supabase.from("attendees").select("id", { count: "exact", head: true }).eq("event_id", id),
      supabase.from("tracks").select("*").eq("event_id", id).order("position"),
      supabase.from("agenda_assignments").select("*").eq("event_id", id),
      supabase.from("agenda_blocks").select("*").eq("event_id", id),
    ]);

  const allProposals = (proposals ?? []) as Proposal[];
  const proposalsById = new Map(allProposals.map((p) => [p.id, p]));
  const tracksById = new Map(((tracks ?? []) as Track[]).map((t) => [t.id, t]));
  const days = eventDays(event.start_date, event.end_date);
  const schedule = buildAgendaSchedule(
    days,
    (assignments ?? []) as AgendaAssignment[],
    (blocks ?? []) as AgendaBlock[],
    proposalsById,
    tracksById,
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
            <Badge colorPalette={event.status === "draft" ? "gray" : "teal"} size="lg">
              {STATUS_LABELS[event.status]}
            </Badge>
          </Flex>
          <Flex align="center" gap={3} wrap="wrap">
            <Text color="fg.muted">
              Event code:{" "}
              <Text as="span" fontFamily="mono" fontWeight="bold" fontSize="lg">
                {event.code}
              </Text>
              {" · "}
              {attendeeCount ?? 0} attendee{(attendeeCount ?? 0) === 1 ? "" : "s"} joined
            </Text>
            <CopyLinkButton path={`/e/${event.code}`} />
          </Flex>
        </Stack>

        <CollapsibleBox title="Event details & phase">
          <Stack gap={4}>
            <Heading size="sm">Phase</Heading>
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

          <form action={updateEvent.bind(null, event.id)}>
            <Stack gap={4}>
              <Heading size="sm">Details</Heading>
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
                  <Input name="start_date" type="date" defaultValue={event.start_date ?? ""} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>End date</Field.Label>
                  <Input name="end_date" type="date" defaultValue={event.end_date ?? ""} />
                </Field.Root>
              </Stack>
              <Field.Root>
                <Field.Label>Description</Field.Label>
                <Textarea name="description" rows={3} defaultValue={event.description} />
              </Field.Root>
              <Button type="submit" colorPalette="teal" alignSelf="flex-start">
                Save details
              </Button>
            </Stack>
          </form>
        </CollapsibleBox>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <Stack gap={4}>
            <Flex justify="space-between" align="center" gap={4} wrap="wrap">
              <Heading size="md">Agenda</Heading>
              <Flex gap={2}>
                <Link asChild color="teal.600" fontWeight="medium">
                  <NextLink href={`/dashboard/events/${event.id}/agenda`}>Edit agenda →</NextLink>
                </Link>
                <Link asChild color="teal.600" fontWeight="medium">
                  <NextLink href={`/dashboard/events/${event.id}/proposals`}>
                    View all proposals ({allProposals.length}) →
                  </NextLink>
                </Link>
              </Flex>
            </Flex>
            <AgendaSummary schedule={schedule} />
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}
