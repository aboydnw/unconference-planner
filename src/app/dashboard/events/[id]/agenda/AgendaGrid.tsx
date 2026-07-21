"use client";

import { useState, useTransition } from "react";

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";

import { assignProposal, unassignProposal } from "@/app/actions/agenda";
import {
  formatDay,
  formatTime,
  type AgendaAssignment,
  type Proposal,
  type TimeSlot,
  type Track,
} from "@/lib/types";

interface AgendaGridProps {
  eventId: string;
  slots: TimeSlot[];
  tracks: Track[];
  proposals: Proposal[];
  assignments: AgendaAssignment[];
  voteCounts: Record<string, number>;
}

export function AgendaGrid({
  eventId,
  slots,
  tracks,
  proposals,
  assignments,
  voteCounts,
}: AgendaGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const proposalById = new Map(proposals.map((p) => [p.id, p]));
  const assignedIds = new Set(assignments.map((a) => a.proposal_id));
  const cellAssignment = new Map(
    assignments.map((a) => [`${a.slot_id}:${a.track_id}`, a]),
  );
  const unscheduled = proposals
    .filter((p) => !assignedIds.has(p.id))
    .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0));

  const days = [...new Set(slots.map((s) => s.day))].sort();

  function handleCellClick(slotId: string, trackId: string) {
    if (!selectedId) return;
    const proposalId = selectedId;
    setSelectedId(null);
    startTransition(() => assignProposal(eventId, proposalId, slotId, trackId));
  }

  function handleUnassign(proposalId: string) {
    startTransition(() => unassignProposal(eventId, proposalId));
  }

  if (tracks.length === 0 || slots.length === 0) {
    return (
      <Text color="fg.muted">
        Add at least one time slot and one room below, then come back to place
        sessions on the grid.
      </Text>
    );
  }

  return (
    <Stack gap={6} opacity={isPending ? 0.7 : 1}>
      <Stack gap={2}>
        <Heading size="sm">
          Unscheduled sessions ({unscheduled.length})
        </Heading>
        {unscheduled.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            Everything is scheduled.
          </Text>
        ) : (
          <>
            <Text color="fg.muted" fontSize="sm">
              Click a session to pick it up, then click an empty grid cell to
              place it.
            </Text>
            <Flex gap={2} wrap="wrap">
              {unscheduled.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={selectedId === p.id ? "solid" : "outline"}
                  colorPalette={selectedId === p.id ? "teal" : "gray"}
                  onClick={() =>
                    setSelectedId(selectedId === p.id ? null : p.id)
                  }
                >
                  {p.title}
                  <Badge ml={1} colorPalette="teal" variant="subtle">
                    {voteCounts[p.id] ?? 0}
                  </Badge>
                </Button>
              ))}
            </Flex>
          </>
        )}
      </Stack>

      {days.map((day) => (
        <Stack key={day} gap={2}>
          <Heading size="sm">{formatDay(day)}</Heading>
          <Box overflowX="auto">
            <Table.Root size="sm" variant="outline">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="140px">Time</Table.ColumnHeader>
                  {tracks.map((t) => (
                    <Table.ColumnHeader key={t.id}>{t.name}</Table.ColumnHeader>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {slots
                  .filter((s) => s.day === day)
                  .map((slot) => (
                    <Table.Row key={slot.id}>
                      <Table.Cell verticalAlign="top">
                        <Text fontWeight="medium" fontSize="sm">
                          {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
                        </Text>
                        {slot.label && (
                          <Text fontSize="xs" color="fg.muted">
                            {slot.label}
                          </Text>
                        )}
                      </Table.Cell>
                      {tracks.map((track) => {
                        const assignment = cellAssignment.get(
                          `${slot.id}:${track.id}`,
                        );
                        const proposal = assignment
                          ? proposalById.get(assignment.proposal_id)
                          : undefined;
                        return (
                          <Table.Cell key={track.id} verticalAlign="top">
                            {proposal ? (
                              <Stack gap={1}>
                                <Text fontSize="sm" fontWeight="medium">
                                  {proposal.title}
                                </Text>
                                <Text fontSize="xs" color="fg.muted">
                                  {proposal.proposer_name} ·{" "}
                                  {voteCounts[proposal.id] ?? 0} would attend
                                </Text>
                                <Button
                                  size="2xs"
                                  variant="ghost"
                                  colorPalette="red"
                                  alignSelf="flex-start"
                                  onClick={() => handleUnassign(proposal.id)}
                                >
                                  Remove
                                </Button>
                              </Stack>
                            ) : (
                              <Button
                                size="xs"
                                variant="ghost"
                                w="full"
                                color="fg.muted"
                                disabled={!selectedId}
                                onClick={() =>
                                  handleCellClick(slot.id, track.id)
                                }
                              >
                                {selectedId ? "Place here" : "—"}
                              </Button>
                            )}
                          </Table.Cell>
                        );
                      })}
                    </Table.Row>
                  ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
