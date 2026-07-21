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
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import {
  deleteOwnProposal,
  joinEvent,
  submitProposal,
  toggleVote,
} from "@/app/actions/attendee";
import { getCurrentAttendee, getEventByCode } from "@/lib/attendee";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_LABELS,
  formatDateRange,
  type Proposal,
  type Vote,
} from "@/lib/types";

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
  const [{ data: proposals }, { data: votes }] = await Promise.all([
    supabase
      .from("proposals")
      .select("*")
      .eq("event_id", event.id)
      .eq("hidden", false),
    supabase
      .from("votes")
      .select("proposal_id, attendee_id")
      .eq("event_id", event.id),
  ]);

  const voteCounts = new Map<string, number>();
  const myVotes = new Set<string>();
  for (const v of (votes ?? []) as Vote[]) {
    voteCounts.set(v.proposal_id, (voteCounts.get(v.proposal_id) ?? 0) + 1);
    if (current && v.attendee_id === current.attendee.id) {
      myVotes.add(v.proposal_id);
    }
  }
  const sortedProposals = [...((proposals ?? []) as Proposal[])].sort(
    (a, b) => (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0),
  );

  const canPropose = event.status === "proposals";
  const canVote = event.status === "proposals" || event.status === "voting";

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

        {current && canPropose && (
          <Box borderWidth="1px" borderRadius="lg" p={6}>
            <form action={submitProposal.bind(null, code)}>
              <Stack gap={4}>
                <Heading size="md">Propose a session</Heading>
                <Field.Root required>
                  <Field.Label>Title</Field.Label>
                  <Input
                    name="title"
                    placeholder="e.g. Mapping pipeline show &amp; tell"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Description</Field.Label>
                  <Textarea
                    name="description"
                    rows={3}
                    placeholder="What will you cover? What do you want from the group?"
                  />
                </Field.Root>
                <Flex gap={4}>
                  <Field.Root>
                    <Field.Label>Format</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field name="format">
                        <option value="">Any</option>
                        <option value="talk">Talk</option>
                        <option value="discussion">Discussion</option>
                        <option value="workshop">Workshop</option>
                        <option value="hands-on">Hands-on</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Duration</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field name="duration_minutes">
                        <option value="">Flexible</option>
                        <option value="30">30 min</option>
                        <option value="60">60 min</option>
                        <option value="90">90 min</option>
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                  </Field.Root>
                </Flex>
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
            const voted = myVotes.has(p.id);
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
                      <form action={toggleVote.bind(null, code, p.id)}>
                        <Button
                          type="submit"
                          size="sm"
                          variant={voted ? "solid" : "outline"}
                          colorPalette="teal"
                        >
                          {voted ? "✓ Attending" : "I'd attend"} ·{" "}
                          {voteCounts.get(p.id) ?? 0}
                        </Button>
                      </form>
                    ) : (
                      <Badge colorPalette="teal" size="lg">
                        {voteCounts.get(p.id) ?? 0} would attend
                      </Badge>
                    )}
                    {isMine && canPropose && (
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
