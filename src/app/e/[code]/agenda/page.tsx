import NextLink from "next/link";
import { notFound } from "next/navigation";

import { Container, Heading, Link, Stack } from "@chakra-ui/react";

import { AgendaSummary } from "@/app/dashboard/events/[id]/AgendaSummary";
import { getEventByCode } from "@/lib/attendee";
import { buildAgendaSchedule, eventDays } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";
import {
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

  return (
    <Container maxW="3xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/e/${encodeURIComponent(code)}`}>← {event.name}</NextLink>
          </Link>
          <Heading size="xl">Agenda</Heading>
        </Stack>
        <AgendaSummary schedule={schedule} />
      </Stack>
    </Container>
  );
}
