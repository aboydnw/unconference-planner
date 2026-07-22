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

import { addBlock, addTrack, deleteBlock, deleteTrack, setDailyHours } from "@/app/actions/agenda";
import { toggleAgendaPublished } from "@/app/actions/events";
import { eventDays } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import {
  formatDay,
  formatTime,
  type AgendaAssignment,
  type AgendaBlock,
  type Proposal,
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

  const [{ data: tracks }, { data: proposals }, { data: assignments }, { data: blocks }, { data: votes }] =
    await Promise.all([
      supabase.from("tracks").select("*").eq("event_id", id).order("position"),
      supabase.from("proposals").select("*").eq("event_id", id).eq("hidden", false),
      supabase.from("agenda_assignments").select("*").eq("event_id", id),
      supabase.from("agenda_blocks").select("*").eq("event_id", id).order("day").order("start_time"),
      supabase.from("votes").select("proposal_id").eq("event_id", id),
    ]);

  const voteCounts: Record<string, number> = {};
  for (const v of votes ?? []) {
    voteCounts[v.proposal_id] = (voteCounts[v.proposal_id] ?? 0) + 1;
  }

  const days = eventDays(event.start_date, event.end_date);
  const allBlocks = (blocks ?? []) as AgendaBlock[];

  return (
    <Container maxW="6xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/dashboard/events/${event.id}`}>← {event.name}</NextLink>
          </Link>
          <Flex justify="space-between" align="center" gap={4} wrap="wrap">
            <Heading size="xl">Agenda builder</Heading>
            <Flex gap={3} align="center">
              <Badge colorPalette={event.agenda_published ? "green" : "gray"} size="lg">
                {event.agenda_published ? "Visible to attendees" : "Hidden from attendees"}
              </Badge>
              <form action={toggleAgendaPublished.bind(null, event.id, !event.agenda_published)}>
                <Button type="submit" size="sm" colorPalette={event.agenda_published ? "gray" : "green"}>
                  {event.agenda_published ? "Unpublish agenda" : "Publish agenda"}
                </Button>
              </form>
            </Flex>
          </Flex>
        </Stack>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <AgendaGrid
            event={event}
            tracks={(tracks ?? []) as Track[]}
            proposals={(proposals ?? []) as Proposal[]}
            assignments={(assignments ?? []) as AgendaAssignment[]}
            blocks={allBlocks}
            voteCounts={voteCounts}
          />
        </Box>

        <Flex gap={6} direction={{ base: "column", md: "row" }}>
          <Box borderWidth="1px" borderRadius="lg" p={6} flex="1">
            <Stack gap={4}>
              <Heading size="md">Daily hours</Heading>
              <Text color="fg.muted" fontSize="sm">
                The grid runs these hours in 30-minute rows on every event day.
              </Text>
              <form action={setDailyHours.bind(null, event.id)}>
                <Flex gap={3} align="flex-end" wrap="wrap">
                  <Field.Root required>
                    <Field.Label>Start</Field.Label>
                    <Input name="agenda_day_start" type="time" step={1800} defaultValue={event.agenda_day_start.slice(0, 5)} />
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label>End</Field.Label>
                    <Input name="agenda_day_end" type="time" step={1800} defaultValue={event.agenda_day_end.slice(0, 5)} />
                  </Field.Root>
                  <Button type="submit" size="sm">Save hours</Button>
                </Flex>
              </form>

              <Heading size="md" pt={2}>Blocks</Heading>
              <Text color="fg.muted" fontSize="sm">
                Reserve a span across all rooms — e.g. lunch or an all-hands session.
              </Text>
              <Stack gap={2}>
                {allBlocks.map((b) => (
                  <Flex key={b.id} justify="space-between" align="center">
                    <Text fontSize="sm">
                      {formatDay(b.day)} · {formatTime(b.start_time)}–{formatTime(b.end_time)}
                      {b.label ? ` · ${b.label}` : ""}
                    </Text>
                    <form action={deleteBlock.bind(null, event.id, b.id)}>
                      <Button type="submit" size="2xs" variant="ghost" colorPalette="red">Remove</Button>
                    </form>
                  </Flex>
                ))}
              </Stack>
              <form action={addBlock.bind(null, event.id)}>
                <Stack gap={3}>
                  <Field.Root required>
                    <Field.Label>Day</Field.Label>
                    <Input name="day" type="date" defaultValue={days[0] ?? event.start_date ?? ""} />
                  </Field.Root>
                  <Flex gap={3}>
                    <Field.Root required>
                      <Field.Label>Start</Field.Label>
                      <Input name="start_time" type="time" step={1800} />
                    </Field.Root>
                    <Field.Root required>
                      <Field.Label>End</Field.Label>
                      <Input name="end_time" type="time" step={1800} />
                    </Field.Root>
                  </Flex>
                  <Field.Root>
                    <Field.Label>Label</Field.Label>
                    <Input name="label" placeholder="e.g. Lunch, All-hands" />
                  </Field.Root>
                  <Button type="submit" size="sm" alignSelf="flex-start">Add block</Button>
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
                      <Button type="submit" size="2xs" variant="ghost" colorPalette="red">Remove</Button>
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
                  <Button type="submit" size="sm" alignSelf="flex-start">Add room</Button>
                </Stack>
              </form>
            </Stack>
          </Box>
        </Flex>
      </Stack>
    </Container>
  );
}
