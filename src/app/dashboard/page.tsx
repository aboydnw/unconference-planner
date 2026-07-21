import NextLink from "next/link";
import { redirect } from "next/navigation";

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
  Textarea,
} from "@chakra-ui/react";

import { signOut } from "@/app/actions/auth";
import { createEvent } from "@/app/actions/events";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, formatDateRange, type UnconfEvent } from "@/lib/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <Container maxW="3xl" py={10}>
      <Stack gap={10}>
        <Flex justify="space-between" align="center">
          <Heading size="xl">Your events</Heading>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out ({user.email})
            </Button>
          </form>
        </Flex>

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        <Stack gap={4}>
          {(events ?? []).map((event: UnconfEvent) => (
            <Link
              key={event.id}
              asChild
              _hover={{ textDecoration: "none" }}
            >
              <NextLink href={`/dashboard/events/${event.id}`}>
                <Box
                  borderWidth="1px"
                  borderRadius="lg"
                  p={5}
                  w="full"
                  _hover={{ borderColor: "teal.500", bg: "bg.subtle" }}
                >
                  <Flex justify="space-between" align="center" gap={4}>
                    <Stack gap={1}>
                      <Heading size="md">{event.name}</Heading>
                      <Text color="fg.muted" fontSize="sm">
                        {formatDateRange(event.start_date, event.end_date)}
                        {event.location ? ` · ${event.location}` : ""}
                        {" · code "}
                        <Text as="span" fontFamily="mono" fontWeight="bold">
                          {event.code}
                        </Text>
                      </Text>
                    </Stack>
                    <Badge colorPalette={event.status === "draft" ? "gray" : "teal"}>
                      {STATUS_LABELS[event.status]}
                    </Badge>
                  </Flex>
                </Box>
              </NextLink>
            </Link>
          ))}
          {(events ?? []).length === 0 && (
            <Text color="fg.muted">
              No events yet. Create your first one below.
            </Text>
          )}
        </Stack>

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <form action={createEvent}>
            <Stack gap={4}>
              <Heading size="md">Create an event</Heading>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Input name="name" placeholder="e.g. Lisbon Team Week 2026" />
              </Field.Root>
              <Field.Root>
                <Field.Label>Location</Field.Label>
                <Input name="location" placeholder="e.g. Lisbon, Portugal" />
              </Field.Root>
              <Stack direction={{ base: "column", sm: "row" }} gap={4}>
                <Field.Root>
                  <Field.Label>Start date</Field.Label>
                  <Input name="start_date" type="date" />
                </Field.Root>
                <Field.Root>
                  <Field.Label>End date</Field.Label>
                  <Input name="end_date" type="date" />
                </Field.Root>
              </Stack>
              <Field.Root>
                <Field.Label>Description</Field.Label>
                <Textarea
                  name="description"
                  rows={3}
                  placeholder="What is this event about? What kinds of sessions are you hoping for?"
                />
              </Field.Root>
              <Button type="submit" colorPalette="teal" alignSelf="flex-start">
                Create event
              </Button>
            </Stack>
          </form>
        </Box>
      </Stack>
    </Container>
  );
}
