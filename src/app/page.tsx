import NextLink from "next/link";

import {
  Alert,
  Box,
  Button,
  Container,
  Field,
  Heading,
  Input,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";

import { findEvent } from "@/app/actions/attendee";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <Container maxW="lg" py={16}>
      <Stack gap={10}>
        <Stack gap={3}>
          <Heading size="2xl">Unconference Planner</Heading>
          <Text color="fg.muted" fontSize="lg">
            Plan your team week together. Pitch sessions, vote on what matters,
            and build the agenda as a group.
          </Text>
        </Stack>

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <form action={findEvent}>
            <Stack gap={4}>
              <Heading size="md">Joining an event?</Heading>
              <Field.Root>
                <Field.Label>Event code</Field.Label>
                <Input
                  name="code"
                  placeholder="e.g. TWKX3P"
                  textTransform="uppercase"
                  autoComplete="off"
                />
              </Field.Root>
              <Button type="submit" colorPalette="teal">
                Find event
              </Button>
            </Stack>
          </form>
        </Box>

        <Text color="fg.muted">
          Organizing an event?{" "}
          <Link asChild color="teal.600" fontWeight="medium">
            <NextLink href="/login">Sign in to get started</NextLink>
          </Link>
        </Text>
      </Stack>
    </Container>
  );
}
