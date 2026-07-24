import NextLink from "next/link";
import { notFound } from "next/navigation";

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

import {
  deleteOwnProposal,
  joinEvent,
  setVote,
  submitProposal,
} from "@/app/actions/attendee";
import { getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_LABELS,
  formatDateRange,
  type AttendeeUnavailability,
  type Proposal,
  type ProposalField,
  type Vote,
  type VoteTier,
} from "@/lib/types";
import { compareByDemand, formatVoteSplit, summarizeVotes } from "@/lib/votes";

import { eventDays } from "@/lib/agenda";

import { EditableProposal } from "./EditableProposal";
import { ProposalFields } from "./ProposalFields";
import { UnavailabilityPicker } from "./UnavailabilityPicker";

export default async function AttendeeEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;

  const event = await getEventByCode(code);
  if (!event) notFound();

  const current = await getCurrentAttendee(event.id);

  const supabase = await createClient();
  const [{ data: proposals }, { data: votes }, { data: fieldRows }, { data: myWindows }] =
    await Promise.all([
      supabase
        .from("proposals")
        .select("*")
        .eq("event_id", event.id)
        .eq("hidden", false),
      supabase
        .from("votes")
        .select("proposal_id, attendee_id, tier")
        .eq("event_id", event.id),
      supabase
        .from("proposal_fields")
        .select("*")
        .eq("event_id", event.id)
        .order("position"),
      current
        ? supabase.rpc("get_my_unavailability", { p_token: current.token })
        : Promise.resolve({ data: null }),
    ]);
  const fields = (fieldRows ?? []) as ProposalField[];

  const voteSummaries = summarizeVotes((votes ?? []) as Vote[]);
  const myVotes = new Map<string, VoteTier>();
  for (const v of (votes ?? []) as Vote[]) {
    if (current && v.attendee_id === current.attendee.id) {
      myVotes.set(v.proposal_id, v.tier);
    }
  }
  const sortedProposals = [...((proposals ?? []) as Proposal[])].sort((a, b) =>
    compareByDemand(a, b, voteSummaries),
  );

  const canPropose = event.status === "proposals";
  const canVote = event.status === "proposals" || event.status === "voting";
  const inReview = event.status === "review";
  const days = eventDays(event.start_date, event.end_date);
  const unavailabilityWindows = (
    (myWindows ?? []) as Pick<
      AttendeeUnavailability,
      "day" | "start_time" | "end_time"
    >[]
  ).map((w) => ({
    day: w.day,
    start_time: w.start_time.slice(0, 5),
    end_time: w.end_time.slice(0, 5),
  }));

  return (
    <Container maxW="2xl" py={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Flex justify="space-between" align="center" gap={4} wrap="wrap">
            <Heading size="xl">{event.name}</Heading>
            <Badge colorPalette="teal" size="lg">
              {STATUS_LABELS[event.status]}
            </Badge>
          </Flex>
          <Text color="fg.muted">
            {formatDateRange(event.start_date, event.end_date)}
            {event.location ? ` · ${event.location}` : ""}
          </Text>
          {event.description && <Text>{event.description}</Text>}
        </Stack>

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        {event.agenda_published && (
          <Alert.Root status="success">
            <Alert.Indicator />
            <Alert.Title>
              The agenda is out!{" "}
              <Link asChild fontWeight="bold" color="inherit">
                <NextLink href={`/e/${encodeURIComponent(code)}/agenda`}>
                  View the agenda →
                </NextLink>
              </Link>
            </Alert.Title>
          </Alert.Root>
        )}

        {inReview && !event.agenda_published && (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Title>
              The draft agenda is ready for review.{" "}
              <Link asChild fontWeight="bold" color="inherit">
                <NextLink href={`/e/${encodeURIComponent(code)}/agenda`}>
                  See the draft →
                </NextLink>
              </Link>
            </Alert.Title>
          </Alert.Root>
        )}

        {!current && event.status === "draft" && (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Title>
              This event isn&apos;t open for participation yet. Check back soon.
            </Alert.Title>
          </Alert.Root>
        )}

        {!current && event.status !== "draft" && (
          <Box borderWidth="1px" borderRadius="lg" p={6}>
            <form action={joinEvent.bind(null, code)}>
              <Stack gap={4}>
                <Heading size="md">Join this event</Heading>
                <Text color="fg.muted" fontSize="sm">
                  Enter your name to propose sessions and vote. No account
                  needed.
                </Text>
                <Field.Root required>
                  <Field.Label>Your name</Field.Label>
                  <Input name="name" placeholder="e.g. Alex" />
                </Field.Root>
                <Button type="submit" colorPalette="teal" alignSelf="flex-start">
                  Join
                </Button>
              </Stack>
            </form>
          </Box>
        )}

        {current && (
          <Text color="fg.muted" fontSize="sm">
            You&apos;re participating as{" "}
            <Text as="span" fontWeight="bold">
              {current.attendee.name}
            </Text>
            .
          </Text>
        )}

        {current && canVote && days.length > 0 && (
          <UnavailabilityPicker
            code={code}
            days={days}
            initial={unavailabilityWindows}
          />
        )}

        {current && canPropose && (
          <Box borderWidth="1px" borderRadius="lg" p={6}>
            <form action={submitProposal.bind(null, code)}>
              <Stack gap={4}>
                <Heading size="md">Propose a session</Heading>
                <ProposalFields fields={fields} />
                <Button type="submit" colorPalette="teal" alignSelf="flex-start">
                  Submit proposal
                </Button>
              </Stack>
            </form>
          </Box>
        )}

        <Stack gap={4}>
          <Heading size="md">
            Proposed sessions ({sortedProposals.length})
          </Heading>
          {sortedProposals.length === 0 && (
            <Text color="fg.muted">
              No proposals yet.{canPropose ? " Be the first!" : ""}
            </Text>
          )}
          {sortedProposals.map((p) => {
            const isMine = current && p.attendee_id === current.attendee.id;
            const myTier = myVotes.get(p.id) ?? null;
            return (
              <Box key={p.id} borderWidth="1px" borderRadius="lg" p={5}>
                <Flex justify="space-between" align="flex-start" gap={4}>
                  <Stack gap={1} flex="1">
                    <Heading size="sm">{p.title}</Heading>
                    {p.description && (
                      <Text fontSize="sm" color="fg.muted">
                        {p.description}
                      </Text>
                    )}
                    <Text fontSize="xs" color="fg.muted">
                      {[
                        `by ${p.proposer_name}`,
                        p.format,
                        p.duration_minutes ? `${p.duration_minutes} min` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Stack>
                  <Stack gap={2} align="flex-end">
                    {current && canVote ? (
                      <Stack gap={1} align="flex-end">
                        <Flex gap={1}>
                          {(
                            [
                              ["Skip", null],
                              ["Would", "would"],
                              ["Must ✦", "must"],
                            ] as const
                          ).map(([label, tier]) => {
                            const active = myTier === tier;
                            return (
                              <form
                                key={label}
                                action={setVote.bind(null, code, p.id, tier)}
                              >
                                <Button
                                  type="submit"
                                  size="xs"
                                  variant={active ? "solid" : "outline"}
                                  colorPalette={tier === null ? "gray" : "teal"}
                                  aria-pressed={active}
                                >
                                  {label}
                                </Button>
                              </form>
                            );
                          })}
                        </Flex>
                        <Text fontSize="xs" color="fg.muted">
                          {formatVoteSplit(voteSummaries.get(p.id))}
                        </Text>
                      </Stack>
                    ) : (
                      <Badge colorPalette="teal" size="lg">
                        {formatVoteSplit(voteSummaries.get(p.id))}
                      </Badge>
                    )}
                    {isMine && canPropose && (
                      <Stack gap={1} align="flex-end">
                        <EditableProposal
                          code={code}
                          proposalId={p.id}
                          fields={fields}
                          values={{
                            title: p.title,
                            description: p.description,
                            format: p.format,
                            duration_minutes: p.duration_minutes,
                            custom_answers: p.custom_answers,
                          }}
                        />
                        <form action={deleteOwnProposal.bind(null, code, p.id)}>
                          <Button
                            type="submit"
                            size="2xs"
                            variant="ghost"
                            colorPalette="red"
                          >
                            Delete mine
                          </Button>
                        </form>
                      </Stack>
                    )}
                  </Stack>
                </Flex>
              </Box>
            );
          })}
        </Stack>
      </Stack>
    </Container>
  );
}
