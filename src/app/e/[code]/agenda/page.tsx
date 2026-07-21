import NextLink from "next/link";
import { notFound } from "next/navigation";

import {
  Box,
  Container,
  Heading,
  Link,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";

import { getEventByCode } from "@/lib/attendee";
import { createClient } from "@/lib/supabase/server";
import {
  formatDay,
  formatTime,
  type AgendaAssignment,
  type Proposal,
  type TimeSlot,
  type Track,
} from "@/lib/types";

export default async function AttendeeAgendaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const event = await getEventByCode(code);
  if (!event || !event.agenda_published) notFound();

  const supabase = await createClient();
  const [
    { data: slots },
    { data: tracks },
    { data: assignments },
    { data: proposals },
  ] = await Promise.all([
    supabase
      .from("time_slots")
      .select("*")
      .eq("event_id", event.id)
      .order("day")
      .order("start_time"),
    supabase
      .from("tracks")
      .select("*")
      .eq("event_id", event.id)
      .order("position"),
    supabase.from("agenda_assignments").select("*").eq("event_id", event.id),
    supabase
      .from("proposals")
      .select("*")
      .eq("event_id", event.id)
      .eq("hidden", false),
  ]);

  const proposalById = new Map(
    ((proposals ?? []) as Proposal[]).map((p) => [p.id, p]),
  );
  const cellAssignment = new Map(
    ((assignments ?? []) as AgendaAssignment[]).map((a) => [
      `${a.slot_id}:${a.track_id}`,
      a,
    ]),
  );
  const allSlots = (slots ?? []) as TimeSlot[];
  const allTracks = (tracks ?? []) as Track[];
  const days = [...new Set(allSlots.map((s) => s.day))].sort();

  return (
    <Container maxW="5xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/e/${encodeURIComponent(code)}`}>
              ← {event.name}
            </NextLink>
          </Link>
          <Heading size="xl">Agenda</Heading>
        </Stack>

        {days.length === 0 && (
          <Text color="fg.muted">The agenda hasn&apos;t been filled in yet.</Text>
        )}

        {days.map((day) => (
          <Stack key={day} gap={2}>
            <Heading size="md">{formatDay(day)}</Heading>
            <Box overflowX="auto">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader w="140px">Time</Table.ColumnHeader>
                    {allTracks.map((t) => (
                      <Table.ColumnHeader key={t.id}>
                        {t.name}
                      </Table.ColumnHeader>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {allSlots
                    .filter((s) => s.day === day)
                    .map((slot) => (
                      <Table.Row key={slot.id}>
                        <Table.Cell verticalAlign="top">
                          <Text fontWeight="medium" fontSize="sm">
                            {formatTime(slot.start_time)}–
                            {formatTime(slot.end_time)}
                          </Text>
                          {slot.label && (
                            <Text fontSize="xs" color="fg.muted">
                              {slot.label}
                            </Text>
                          )}
                        </Table.Cell>
                        {allTracks.map((track) => {
                          const assignment = cellAssignment.get(
                            `${slot.id}:${track.id}`,
                          );
                          const proposal = assignment
                            ? proposalById.get(assignment.proposal_id)
                            : undefined;
                          return (
                            <Table.Cell key={track.id} verticalAlign="top">
                              {proposal ? (
                                <Stack gap={0}>
                                  <Text fontSize="sm" fontWeight="medium">
                                    {proposal.title}
                                  </Text>
                                  <Text fontSize="xs" color="fg.muted">
                                    {proposal.proposer_name}
                                  </Text>
                                </Stack>
                              ) : (
                                <Text fontSize="sm" color="fg.muted">
                                  —
                                </Text>
                              )}
                            </Table.Cell>
                          );
                        })}
                      </Table.Row>
                    ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Container>
  );
}
