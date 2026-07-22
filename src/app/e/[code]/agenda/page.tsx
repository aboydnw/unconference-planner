import NextLink from "next/link";
import { notFound } from "next/navigation";

import { Box, Container, Flex, Heading, Link, Stack, Text } from "@chakra-ui/react";

import { getEventByCode } from "@/lib/attendee";
import { buildAgendaSchedule, eventDays } from "@/lib/agenda";
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

export default async function AttendeeAgendaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const event = (await getEventByCode(code)) as UnconfEvent | null;
  if (!event || !event.agenda_published) notFound();

  const supabase = await createClient();
  const [{ data: tracks }, { data: assignments }, { data: blocks }, { data: proposals }] =
    await Promise.all([
      supabase.from("tracks").select("*").eq("event_id", event.id).order("position"),
      supabase.from("agenda_assignments").select("*").eq("event_id", event.id),
      supabase.from("agenda_blocks").select("*").eq("event_id", event.id),
      supabase.from("proposals").select("*").eq("event_id", event.id).eq("hidden", false),
    ]);

  const proposalsById = new Map(((proposals ?? []) as Proposal[]).map((p) => [p.id, p]));
  const tracksById = new Map(((tracks ?? []) as Track[]).map((t) => [t.id, t]));
  const days = eventDays(event.start_date, event.end_date);
  const schedule = buildAgendaSchedule(
    days,
    (assignments ?? []) as AgendaAssignment[],
    (blocks ?? []) as AgendaBlock[],
    proposalsById,
    tracksById,
  );
  const hasAnything = schedule.some((d) => d.entries.length > 0);

  return (
    <Container maxW="3xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/e/${encodeURIComponent(code)}`}>← {event.name}</NextLink>
          </Link>
          <Heading size="xl">Agenda</Heading>
        </Stack>

        {!hasAnything && (
          <Text color="fg.muted">The agenda hasn&apos;t been filled in yet.</Text>
        )}

        {schedule
          .filter((d) => d.entries.length > 0)
          .map((d) => (
            <Stack key={d.day} gap={3}>
              <Heading size="md">{formatDay(d.day)}</Heading>
              <Stack gap={2}>
                {d.entries.map((e, i) =>
                  e.kind === "block" ? (
                    <Box key={i} borderWidth="1px" borderRadius="md" bg="gray.50" px={4} py={2}>
                      <Text fontSize="sm" fontWeight="medium" color="fg.muted">
                        {formatTime(e.startTime)}–{formatTime(e.endTime ?? e.startTime)} ·{" "}
                        {e.label || "Reserved"}
                      </Text>
                    </Box>
                  ) : (
                    <Flex key={i} borderWidth="1px" borderRadius="md" px={4} py={2} gap={3} align="baseline">
                      <Text fontSize="sm" fontWeight="medium" minW="60px">
                        {formatTime(e.startTime)}
                      </Text>
                      <Box>
                        <Text fontSize="sm" fontWeight="medium">
                          {e.title}
                          {e.trackName ? ` · ${e.trackName}` : ""}
                        </Text>
                        <Text fontSize="xs" color="fg.muted">
                          {[e.proposerName, e.durationMinutes ? `${e.durationMinutes} min` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </Box>
                    </Flex>
                  ),
                )}
              </Stack>
            </Stack>
          ))}
      </Stack>
    </Container>
  );
}
