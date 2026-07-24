import { Badge, Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";

import {
  applyChangeRequest,
  declineChangeRequest,
} from "@/app/actions/changeRequests";
import type { ChangeRequest, ChangeRequestStatus } from "@/lib/types";

export type QueueState =
  | { kind: "ready"; delta: number; regressions: string[] }
  | { kind: "needs-slot"; note: string }
  | { kind: "blocked"; reason: string };

export interface QueueRow {
  cr: ChangeRequest;
  description: string;
  reactions: number;
  state: QueueState;
}

export interface ResolvedRow {
  cr: ChangeRequest;
  description: string;
  reactions: number;
}

const STATUS_BADGE: Record<ChangeRequestStatus, { label: string; palette: string }> = {
  open: { label: "Open", palette: "blue" },
  applied: { label: "Applied", palette: "green" },
  declined: { label: "Declined", palette: "gray" },
  invalidated: { label: "No longer possible", palette: "orange" },
  expired: { label: "Closed at publish", palette: "gray" },
};

function DeclineButton({ eventId, crId }: { eventId: string; crId: string }) {
  return (
    <form action={declineChangeRequest.bind(null, eventId, crId)}>
      <Button type="submit" size="sm" variant="ghost" colorPalette="red">
        Decline
      </Button>
    </form>
  );
}

export function ChangeRequestQueue({
  eventId,
  open,
  resolved,
}: {
  eventId: string;
  open: QueueRow[];
  resolved: ResolvedRow[];
}) {
  return (
    <Box borderWidth="1px" borderRadius="lg" p={6}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading size="md">Change requests</Heading>
          <Text color="fg.muted" fontSize="sm">
            Ranked by 👍. Applying pins the affected sessions and invalidates
            requests the new grid rules out.
          </Text>
        </Stack>

        {open.length === 0 && (
          <Text color="fg.muted" fontSize="sm">
            No open requests.
          </Text>
        )}

        {open.map((row) => (
          <Box key={row.cr.id} borderWidth="1px" borderRadius="md" p={4}>
            <Flex justify="space-between" align="flex-start" gap={4} wrap="wrap">
              <Stack gap={1} flex="1" minW="18rem">
                <Text fontWeight="medium">{row.description}</Text>
                <Text color="fg.muted" fontSize="sm">
                  👍 {row.reactions} · {row.cr.author_name}
                  {row.cr.rationale ? ` · ${row.cr.rationale}` : ""}
                </Text>
                {row.state.kind === "ready" && row.state.regressions.length > 0 && (
                  <Stack gap={0}>
                    {row.state.regressions.map((r) => (
                      <Text key={r} fontSize="xs" color="orange.600">
                        Trade-off: {r}
                      </Text>
                    ))}
                  </Stack>
                )}
                {row.state.kind === "needs-slot" && (
                  <Text fontSize="sm" color="fg.muted">
                    {row.state.note}
                  </Text>
                )}
                {row.state.kind === "blocked" && (
                  <Text fontSize="sm" color="red.600">
                    Blocked — {row.state.reason}
                  </Text>
                )}
              </Stack>
              <Flex gap={2} align="center">
                {row.state.kind === "ready" && (
                  <>
                    <Badge colorPalette={row.state.delta >= 0 ? "green" : "orange"}>
                      {row.state.delta >= 0 ? "+" : ""}
                      {row.state.delta.toFixed(2)} fit
                    </Badge>
                    <form action={applyChangeRequest.bind(null, eventId, row.cr.id)}>
                      <Button type="submit" size="sm" colorPalette="teal">
                        Apply
                      </Button>
                    </form>
                  </>
                )}
                <DeclineButton eventId={eventId} crId={row.cr.id} />
              </Flex>
            </Flex>
          </Box>
        ))}

        {resolved.length > 0 && (
          <Stack gap={2}>
            <Heading size="sm" color="fg.muted">
              Resolved
            </Heading>
            {resolved.map((row) => (
              <Flex key={row.cr.id} gap={3} align="center" wrap="wrap">
                <Text fontSize="sm" color="fg.muted">
                  {row.description}
                </Text>
                <Badge colorPalette={STATUS_BADGE[row.cr.status].palette}>
                  {STATUS_BADGE[row.cr.status].label}
                </Badge>
                {row.cr.invalid_reason && (
                  <Text fontSize="xs" color="fg.muted">
                    {row.cr.invalid_reason}
                  </Text>
                )}
              </Flex>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
