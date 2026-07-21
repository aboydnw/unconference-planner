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
} from "@chakra-ui/react";

import {
  addTimeSlot,
  addTrack,
  deleteTimeSlot,
  deleteTrack,
} from "@/app/actions/agenda";
import { toggleAgendaPublished } from "@/app/actions/events";
import { createClient } from "@/lib/supabase/server";
import {
  formatDay,
  formatTime,
  type AgendaAssignment,
  type Proposal,
  type TimeSlot,
  type Track,
  type UnconfEvent,
} from "@/lib/types";

import { AgendaGrid } from "./AgendaGrid";

export default async function AgendaBuilderPage({
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

  const [
    { data: slots },
    { data: tracks },
    { data: proposals },
    { data: assignments },
    { data: votes },
  ] = await Promise.all([
    supabase
      .from("time_slots")
      .select("*")
      .eq("event_id", id)
      .order("day")
      .order("start_time"),
    supabase.from("tracks").select("*").eq("event_id", id).order("position"),
    supabase
      .from("proposals")
      .select("*")
      .eq("event_id", id)
      .eq("hidden", false),
    supabase.from("agenda_assignments").select("*").eq("event_id", id),
    supabase.from("votes").select("proposal_id").eq("event_id", id),
  ]);

  const voteCounts: Record<string, number> = {};
  for (const v of votes ?? []) {
    voteCounts[v.proposal_id] = (voteCounts[v.proposal_id] ?? 0) + 1;
  }

  return (
    <Container maxW="6xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/dashboard/events/${event.id}`}>
              ← {event.name}
            </NextLink>
          </Link>
          <Flex justify="space-between" align="center" gap={4} wrap="wrap">
            <Heading size="xl">Agenda builder</Heading>
            <Flex gap={3} align="center">
              <Badge
                colorPalette={event.agenda_published ? "green" : "gray"}
                size="lg"
              >
                {event.agenda_published ? "Visible to attendees" : "Hidden from attendees"}
              </Badge>
              <form
                action={toggleAgendaPublished.bind(
                  null,
                  event.id,
                  !event.agenda_published,
                )}
              >
                <Button
                  type="submit"
                  size="sm"
                  colorPalette={event.agenda_published ? "gray" : "green"}
                >
                  {event.agenda_published ? "Unpublish agenda" : "Publish agenda"}
                </Button>
              </form>
            </Flex>
          </Flex>
        </Stack>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <AgendaGrid
            eventId={event.id}
            slots={(slots ?? []) as TimeSlot[]}
            tracks={(tracks ?? []) as Track[]}
            proposals={(proposals ?? []) as Proposal[]}
            assignments={(assignments ?? []) as AgendaAssignment[]}
            voteCounts={voteCounts}
          />
        </Box>

        <Flex gap={6} direction={{ base: "column", md: "row" }}>
          <Box borderWidth="1px" borderRadius="lg" p={6} flex="1">
            <Stack gap={4}>
              <Heading size="md">Time slots</Heading>
              <Stack gap={2}>
                {((slots ?? []) as TimeSlot[]).map((slot) => (
                  <Flex key={slot.id} justify="space-between" align="center">
                    <Text fontSize="sm">
                      {formatDay(slot.day)} · {formatTime(slot.start_time)}–
                      {formatTime(slot.end_time)}
                      {slot.label ? ` · ${slot.label}` : ""}
                    </Text>
                    <form action={deleteTimeSlot.bind(null, event.id, slot.id)}>
                      <Button type="submit" size="2xs" variant="ghost" colorPalette="red">
                        Remove
                      </Button>
                    </form>
                  </Flex>
                ))}
              </Stack>
              <form action={addTimeSlot.bind(null, event.id)}>
                <Stack gap={3}>
                  <Field.Root required>
                    <Field.Label>Day</Field.Label>
                    <Input
                      name="day"
                      type="date"
                      defaultValue={event.start_date ?? ""}
                    />
                  </Field.Root>
                  <Flex gap={3}>
                    <Field.Root required>
                      <Field.Label>Start</Field.Label>
                      <Input name="start_time" type="time" />
                    </Field.Root>
                    <Field.Root required>
                      <Field.Label>End</Field.Label>
                      <Input name="end_time" type="time" />
                    </Field.Root>
                  </Flex>
                  <Field.Root>
                    <Field.Label>Label (optional)</Field.Label>
                    <Input name="label" placeholder="e.g. Morning block" />
                  </Field.Root>
                  <Button type="submit" size="sm" alignSelf="flex-start">
                    Add slot
                  </Button>
                </Stack>
              </form>
            </Stack>
          </Box>

          <Box borderWidth="1px" borderRadius="lg" p={6} flex="1">
            <Stack gap={4}>
              <Heading size="md">Rooms / tracks</Heading>
              <Stack gap={2}>
                {((tracks ?? []) as Track[]).map((track) => (
                  <Flex key={track.id} justify="space-between" align="center">
                    <Text fontSize="sm">{track.name}</Text>
                    <form action={deleteTrack.bind(null, event.id, track.id)}>
                      <Button type="submit" size="2xs" variant="ghost" colorPalette="red">
                        Remove
                      </Button>
                    </form>
                  </Flex>
                ))}
              </Stack>
              <form action={addTrack.bind(null, event.id)}>
                <Stack gap={3}>
                  <Field.Root required>
                    <Field.Label>Name</Field.Label>
                    <Input name="name" placeholder="e.g. Main room" />
                  </Field.Root>
                  <Button type="submit" size="sm" alignSelf="flex-start">
                    Add room
                  </Button>
                </Stack>
              </form>
            </Stack>
          </Box>
        </Flex>
      </Stack>
    </Container>
  );
}
