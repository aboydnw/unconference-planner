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

import { signIn, signUp } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <Container maxW="md" py={16}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Heading size="xl">Organizer sign in</Heading>
          <Text color="fg.muted">
            Sign in (or create an account) to set up and run your event.
          </Text>
        </Stack>

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}
        {message && (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Title>{message}</Alert.Title>
          </Alert.Root>
        )}

        <Box borderWidth="1px" borderRadius="lg" p={6}>
          <form>
            <Stack gap={4}>
              <Field.Root required>
                <Field.Label>Email</Field.Label>
                <Input name="email" type="email" autoComplete="email" />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Password</Field.Label>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                />
              </Field.Root>
              <Stack direction="row" gap={3}>
                <Button type="submit" formAction={signIn} colorPalette="teal">
                  Sign in
                </Button>
                <Button type="submit" formAction={signUp} variant="outline">
                  Create account
                </Button>
              </Stack>
            </Stack>
          </form>
        </Box>

        <Text color="fg.muted" fontSize="sm">
          Attending an event instead?{" "}
          <Link asChild color="teal.600">
            <NextLink href="/">Join with an event code</NextLink>
          </Link>
        </Text>
      </Stack>
    </Container>
  );
}
