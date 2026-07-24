import NextLink from "next/link";
import { notFound } from "next/navigation";

import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";

import { toggleCrReaction, withdrawChangeRequest } from "@/app/actions/changeRequests";
import { AgendaSummary } from "@/app/dashboard/events/[id]/AgendaSummary";
import { getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import { buildAgendaSchedule, eventDays, generateRowTimes } from "@/lib/agenda";
import { compareChangeRequests, describeChangeRequest } from "@/lib/changeRequests";
import { createClient } from "@/lib/supabase/server";
import {
  type AgendaAssignment,
  type AgendaBlock,
  type ChangeRequest,
  type ChangeRequestReaction,
  type ChangeRequestStatus,
  type Proposal,
  type ProposalField,
  type Track,
  type UnconfEvent,
} from "@/lib/types";

import { PitchSessionForm } from "./PitchSessionForm";
import { ProposeChangeForm } from "./ProposeChangeForm";

const STATUS_BADGE: Record<ChangeRequestStatus, { label: string; palette: string }> = {
  open: { label: "Open", palette: "blue" },
  applied: { label: "Applied", palette: "green" },
  declined: { label: "Declined", palette: "gray" },
  invalidated: { label: "No longer possible", palette: "orange" },
  expired: { label: "Closed at publish", palette: "gray" },
};

export default async function AttendeeAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const event = (await getEventByCode(code)) as UnconfEvent | null;
  const isReviewDraft = event?.status === "review" && !event.agenda_published;
  if (!event || (!event.agenda_published && !isReviewDraft)) notFound();

  const inReview = event.status === "review";
  const current = inReview ? await getCurrentAttendee(event.id) : null;

  const supabase = await createClient();
  const [
    { data: tracks },
    { data: assignments },
    { data: blocks },
    { data: proposals },
    { data: changeRequests },
    { data: fieldRows },
  ] = await Promise.all([
    supabase.from("tracks").select("*").eq("event_id", event.id).order("position"),
    supabase.from("agenda_assignments").select("*").eq("event_id", event.id),
    supabase.from("agenda_blocks").select("*").eq("event_id", event.id),
    supabase.from("proposals").select("*").eq("event_id", event.id).eq("hidden", false),
    inReview
      ? supabase
          .from("change_requests")
          .select("*")
          .eq("event_id", event.id)
          .order("created_at")
      : Promise.resolve({ data: null }),
    inReview
      ? supabase
          .from("proposal_fields")
          .select("*")
          .eq("event_id", event.id)
          .order("position")
      : Promise.resolve({ data: null }),
  ]);

  // Scoped to this event's requests: the table carries no event_id, and an
  // unfiltered read would hit PostgREST's row cap once other events fill it.
  const crRowIds = ((changeRequests ?? []) as ChangeRequest[]).map((cr) => cr.id);
  const { data: reactions } = crRowIds.length
    ? await supabase
        .from("change_request_reactions")
        .select("*")
        .in("change_request_id", crRowIds)
    : { data: [] };

  const proposalRows = (proposals ?? []) as Proposal[];
  const assignmentRows = (assignments ?? []) as AgendaAssignment[];
  const trackRows = (tracks ?? []) as Track[];
  const proposalsById = new Map(proposalRows.map((p) => [p.id, p]));
  const tracksById = new Map(trackRows.map((t) => [t.id, t]));
  const days = eventDays(event.start_date, event.end_date);
  const schedule = buildAgendaSchedule(
    days,
    assignmentRows,
    (blocks ?? []) as AgendaBlock[],
    proposalsById,
    tracksById,
  );

  const crRows = (changeRequests ?? []) as ChangeRequest[];
  const crIds = new Set(crRows.map((cr) => cr.id));
  const reactionRows = ((reactions ?? []) as ChangeRequestReaction[]).filter((r) =>
    crIds.has(r.change_request_id),
  );
  const reactionCounts = new Map<string, number>();
  for (const r of reactionRows) {
    reactionCounts.set(
      r.change_request_id,
      (reactionCounts.get(r.change_request_id) ?? 0) + 1,
    );
  }
  const myReactions = new Set(
    current
      ? reactionRows
          .filter((r) => r.attendee_id === current.attendee.id)
          .map((r) => r.change_request_id)
      : [],
  );
  const titleById = new Map(proposalRows.map((p) => [p.id, p.title]));
  const trackNameById = new Map(trackRows.map((t) => [t.id, t.name]));
  const scheduledIds = new Set(assignmentRows.map((a) => a.proposal_id));
  const scheduled = proposalRows
    .filter((p) => scheduledIds.has(p.id))
    .map((p) => ({ id: p.id, title: p.title }));
  const unscheduled = proposalRows
    .filter((p) => !scheduledIds.has(p.id))
    .map((p) => ({ id: p.id, title: p.title }));
  const trackOptions = trackRows.map((t) => ({ id: t.id, name: t.name }));
  const times = generateRowTimes(
    event.agenda_day_start.slice(0, 5),
    event.agenda_day_end.slice(0, 5),
  );

  const openCrs = crRows
    .filter((cr) => cr.status === "open")
    .sort((a, b) => compareChangeRequests(a, b, reactionCounts));
  const resolvedCrs = crRows
    .filter((cr) => cr.status !== "open")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Container maxW="3xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link asChild color="teal.600" fontSize="sm">
            <NextLink href={`/e/${encodeURIComponent(code)}`}>← {event.name}</NextLink>
          </Link>
          <Flex align="center" gap={3} wrap="wrap">
            <Heading size="xl">Agenda</Heading>
            {isReviewDraft && (
              <Badge colorPalette="orange" size="lg">
                Draft — subject to change
              </Badge>
            )}
          </Flex>
        </Stack>

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        <AgendaSummary schedule={schedule} />

        {inReview && !current && (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Title>
              <Link asChild color="teal.600">
                <NextLink href={`/e/${encodeURIComponent(code)}`}>
                  Join the event
                </NextLink>
              </Link>{" "}
              to propose changes to this draft.
            </Alert.Title>
          </Alert.Root>
        )}

        {inReview && current && (
          <>
            <Box borderWidth="1px" borderRadius="lg" p={6}>
              <Stack gap={4}>
                <Stack gap={1}>
                  <Heading size="md">Propose a change</Heading>
                  <Text color="fg.muted" fontSize="sm">
                    Suggest a move, a swap, or bring an unscheduled session onto
                    the grid. The organizer decides what lands.
                  </Text>
                </Stack>
                <ProposeChangeForm
                  code={code}
                  scheduled={scheduled}
                  unscheduled={unscheduled}
                  days={days}
                  times={times}
                  tracks={trackOptions}
                />
              </Stack>
            </Box>

            <Box borderWidth="1px" borderRadius="lg" p={6}>
              <Stack gap={4}>
                <Heading size="md">Pitch a new session</Heading>
                <PitchSessionForm
                  code={code}
                  fields={(fieldRows ?? []) as ProposalField[]}
                  days={days}
                  times={times}
                  tracks={trackOptions}
                />
              </Stack>
            </Box>
          </>
        )}

        {inReview && crRows.length > 0 && (
          <Stack gap={4}>
            <Heading size="md">Change requests</Heading>
            {openCrs.map((cr) => {
              const count = reactionCounts.get(cr.id) ?? 0;
              const mine = myReactions.has(cr.id);
              const pitched = proposalsById.get(cr.proposal_id)?.pitched_in_review;
              return (
                <Box key={cr.id} borderWidth="1px" borderRadius="lg" p={4}>
                  <Stack gap={2}>
                    <Flex justify="space-between" align="flex-start" gap={4} wrap="wrap">
                      <Stack gap={1} flex="1" minW="16rem">
                        <Flex align="center" gap={2} wrap="wrap">
                          <Text fontWeight="medium">
                            {describeChangeRequest(cr, titleById, trackNameById)}
                          </Text>
                          {cr.kind === "add" && pitched && (
                            <Badge colorPalette="purple">Pitched during review</Badge>
                          )}
                        </Flex>
                        <Text color="fg.muted" fontSize="sm">
                          {cr.author_name}
                          {cr.rationale ? ` · ${cr.rationale}` : ""}
                        </Text>
                      </Stack>
                      <Flex gap={2} align="center">
                        <form action={toggleCrReaction.bind(null, code, cr.id)}>
                          <Button
                            type="submit"
                            size="xs"
                            variant={mine ? "solid" : "outline"}
                            colorPalette="teal"
                            disabled={!current}
                          >
                            👍 {count}
                          </Button>
                        </form>
                        {current && cr.attendee_id === current.attendee.id && (
                          <form action={withdrawChangeRequest.bind(null, code, cr.id)}>
                            <Button
                              type="submit"
                              size="xs"
                              variant="ghost"
                              colorPalette="red"
                            >
                              Withdraw
                            </Button>
                          </form>
                        )}
                      </Flex>
                    </Flex>
                  </Stack>
                </Box>
              );
            })}

            {resolvedCrs.length > 0 && (
              <Stack gap={2}>
                <Heading size="sm" color="fg.muted">
                  Resolved
                </Heading>
                {resolvedCrs.map((cr) => (
                  <Flex key={cr.id} gap={3} align="center" wrap="wrap">
                    <Text fontSize="sm" color="fg.muted">
                      {describeChangeRequest(cr, titleById, trackNameById)}
                    </Text>
                    <Badge colorPalette={STATUS_BADGE[cr.status].palette}>
                      {STATUS_BADGE[cr.status].label}
                    </Badge>
                    {cr.invalid_reason && (
                      <Text fontSize="xs" color="fg.muted">
                        {cr.invalid_reason}
                      </Text>
                    )}
                  </Flex>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
