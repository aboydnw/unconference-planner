import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Alert,
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

import { addBlock, addTrack, deleteBlock, deleteTrack, generateDraft, setDailyHours } from "@/app/actions/agenda";
import { toggleAgendaPublished } from "@/app/actions/events";
import { eventDays } from "@/lib/agenda";
import {
  compareChangeRequests,
  crInputOf,
  describeChangeRequest,
  evaluateChangeRequest,
} from "@/lib/changeRequests";
import { loadCrContext } from "@/lib/crContext";
import { collectWarnings, scorePlacements } from "@/lib/optimizer";
import { createClient } from "@/lib/supabase/server";
import {
  formatDay,
  formatTime,
  type AgendaBlock,
  type ChangeRequest,
  type ChangeRequestReaction,
  type UnconfEvent,
  type Vote,
} from "@/lib/types";
import { summarizeVotes } from "@/lib/votes";

import { AgendaGrid } from "./AgendaGrid";
import {
  ChangeRequestQueue,
  type QueueRow,
  type QueueState,
  type ResolvedRow,
} from "./ChangeRequestQueue";

export default async function AgendaBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
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
    { data: blocks },
    { data: votes },
    { data: changeRequests },
    { data: reactions },
    ctx,
  ] = await Promise.all([
    supabase.from("agenda_blocks").select("*").eq("event_id", id).order("day").order("start_time"),
    supabase.from("votes").select("proposal_id, attendee_id, tier").eq("event_id", id),
    supabase.from("change_requests").select("*").eq("event_id", id).order("created_at"),
    supabase.from("change_request_reactions").select("*"),
    loadCrContext(event),
  ]);

  const voteSummaries = Object.fromEntries(
    summarizeVotes((votes ?? []) as Pick<Vote, "proposal_id" | "tier">[]),
  );

  const days = eventDays(event.start_date, event.end_date);
  const allBlocks = (blocks ?? []) as AgendaBlock[];
  const proposalRows = ctx.proposals;
  const assignmentRows = ctx.assignments;
  const trackRows = ctx.tracks;

  const interest = ctx.objective.interest;
  const titleById = new Map(proposalRows.map((p) => [p.id, p.title]));
  const withTitles = (message: string) => {
    let out = message;
    for (const [pid, title] of titleById) out = out.replaceAll(pid, `“${title}”`);
    return out;
  };
  const warnings = collectWarnings(ctx.grid.placements, ctx.objective).map(withTitles);

  const trackNameById = new Map(trackRows.map((t) => [t.id, t.name]));
  const crRows = (changeRequests ?? []) as ChangeRequest[];
  const crIds = new Set(crRows.map((cr) => cr.id));
  const reactionCounts = new Map<string, number>();
  for (const r of ((reactions ?? []) as ChangeRequestReaction[]).filter((r) =>
    crIds.has(r.change_request_id),
  )) {
    reactionCounts.set(
      r.change_request_id,
      (reactionCounts.get(r.change_request_id) ?? 0) + 1,
    );
  }
  const baseScore = scorePlacements(ctx.grid.placements, ctx.objective);
  const baseWarnings = collectWarnings(ctx.grid.placements, ctx.objective);
  const openQueue: QueueRow[] = crRows
    .filter((cr) => cr.status === "open")
    .sort((a, b) => compareChangeRequests(a, b, reactionCounts))
    .map((cr) => {
      const outcome = evaluateChangeRequest(crInputOf(cr), ctx.grid);
      const state: QueueState = !outcome.ok
        ? { kind: "blocked", reason: outcome.reason }
        : !outcome.applicable
          ? { kind: "needs-slot", note: outcome.note }
          : {
              kind: "ready",
              delta: scorePlacements(outcome.after, ctx.objective) - baseScore,
              regressions: collectWarnings(outcome.after, ctx.objective)
                .filter((w) => !baseWarnings.includes(w))
                .map(withTitles),
            };
      return {
        cr,
        description: describeChangeRequest(cr, titleById, trackNameById),
        reactions: reactionCounts.get(cr.id) ?? 0,
        state,
      };
    });
  const resolvedQueue: ResolvedRow[] = crRows
    .filter((cr) => cr.status !== "open")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((cr) => ({
      cr,
      description: describeChangeRequest(cr, titleById, trackNameById),
      reactions: reactionCounts.get(cr.id) ?? 0,
    }));

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

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        {notice && (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Title>{notice}</Alert.Title>
          </Alert.Root>
        )}

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <Stack gap={4}>
            <Flex justify="space-between" align="center" gap={4} wrap="wrap">
              <Stack gap={1}>
                <Heading size="md">Draft tools</Heading>
                <Text color="fg.muted" fontSize="sm">
                  {interest.voteCoverage.voters} of {interest.voteCoverage.attendees}{" "}
                  attendees voted. The draft protects must-attends from clashing;
                  your manual placements are pinned and never move.
                </Text>
              </Stack>
              <form action={generateDraft.bind(null, event.id)}>
                <Button type="submit" colorPalette="teal">
                  {assignmentRows.length > 0 ? "Regenerate draft" : "Generate draft"}
                </Button>
              </form>
            </Flex>
            {warnings.length > 0 && (
              <Stack gap={1}>
                {warnings.map((w) => (
                  <Alert.Root key={w} status="warning" size="sm">
                    <Alert.Indicator />
                    <Alert.Title>{w}</Alert.Title>
                  </Alert.Root>
                ))}
              </Stack>
            )}
          </Stack>
        </Box>

        {(event.status === "review" || crRows.length > 0) && (
          <ChangeRequestQueue
            eventId={event.id}
            open={openQueue}
            resolved={resolvedQueue}
          />
        )}

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <AgendaGrid
            event={event}
            tracks={trackRows}
            proposals={proposalRows}
            assignments={assignmentRows}
            blocks={allBlocks}
            voteSummaries={voteSummaries}
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
                {trackRows.map((track) => (
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
