"use client";

import { useMemo, useState, useTransition } from "react";

import { Badge, Box, Button, Flex, Heading, Stack, Table, Text } from "@chakra-ui/react";

import { assignProposal, deleteBlock, unassignProposal } from "@/app/actions/agenda";
import {
  canPlaceSession,
  durationRows,
  eventDays,
  formatDayLabel,
  generateRowTimes,
  timeToMinutes,
} from "@/lib/agenda";
import { formatTime, type AgendaAssignment, type AgendaBlock, type Proposal, type Track, type UnconfEvent } from "@/lib/types";

interface AgendaGridProps {
  event: UnconfEvent;
  tracks: Track[];
  proposals: Proposal[];
  assignments: AgendaAssignment[];
  blocks: AgendaBlock[];
  voteCounts: Record<string, number>;
}

export function AgendaGrid({
  event,
  tracks,
  proposals,
  assignments,
  blocks,
  voteCounts,
}: AgendaGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const proposalById = useMemo(
    () => new Map(proposals.map((p) => [p.id, p])),
    [proposals],
  );
  const proposalDurations = useMemo(
    () => new Map(proposals.map((p) => [p.id, p.duration_minutes])),
    [proposals],
  );
  const assignedIds = new Set(assignments.map((a) => a.proposal_id));
  const unscheduled = proposals
    .filter((p) => !assignedIds.has(p.id))
    .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0));

  const days = eventDays(event.start_date, event.end_date);
  const rowTimes = generateRowTimes(event.agenda_day_start, event.agenda_day_end);
  const selected = selectedId ? proposalById.get(selectedId) : undefined;

  function handleCellClick(day: string, trackId: string, startTime: string) {
    if (!selectedId) return;
    const proposalId = selectedId;
    setSelectedId(null);
    startTransition(() =>
      assignProposal(event.id, proposalId, trackId, day, startTime),
    );
  }

  function handleUnassign(proposalId: string) {
    startTransition(() => unassignProposal(event.id, proposalId));
  }

  function handleDeleteBlock(blockId: string) {
    startTransition(() => deleteBlock(event.id, blockId));
  }

  if (days.length === 0) {
    return (
      <Text color="fg.muted">
        Set the event start and end dates on the event page first, then set your
        daily hours below to build the grid.
      </Text>
    );
  }
  if (tracks.length === 0) {
    return (
      <Text color="fg.muted">
        Add at least one room below, then place sessions on the grid.
      </Text>
    );
  }

  return (
    <Stack gap={6} opacity={isPending ? 0.7 : 1}>
      <Stack gap={2}>
        <Heading size="sm">Unscheduled sessions ({unscheduled.length})</Heading>
        {unscheduled.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            Everything is scheduled.
          </Text>
        ) : (
          <>
            <Text color="fg.muted" fontSize="sm">
              Click a session to pick it up, then click a start cell to place it.
              It fills its duration downward.
            </Text>
            <Flex gap={2} wrap="wrap">
              {unscheduled.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={selectedId === p.id ? "solid" : "outline"}
                  colorPalette={selectedId === p.id ? "teal" : "gray"}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                >
                  {p.title}
                  <Badge ml={1} colorPalette="teal" variant="subtle">
                    {p.duration_minutes ?? 30}m · {voteCounts[p.id] ?? 0}
                  </Badge>
                </Button>
              ))}
            </Flex>
          </>
        )}
      </Stack>

      {days.map((day) => {
        const dayAssignments = assignments.filter((a) => a.day === day);
        const dayBlocks = blocks.filter((b) => b.day === day);
        const startByCell = new Map(
          dayAssignments.map((a) => [`${a.track_id}:${a.start_time.slice(0, 5)}`, a]),
        );
        const coveredCells = new Set<string>();
        for (const a of dayAssignments) {
          const rows = durationRows(proposalDurations.get(a.proposal_id) ?? null);
          const startMin = timeToMinutes(a.start_time);
          for (let i = 1; i < rows; i++) {
            coveredCells.add(`${a.track_id}:${startMin + i * 30}`);
          }
        }
        const blockStartByRow = new Map(
          dayBlocks.map((b) => [b.start_time.slice(0, 5), b]),
        );
        const blockCoveredRows = new Set<number>();
        for (const b of dayBlocks) {
          const s = timeToMinutes(b.start_time);
          const e = timeToMinutes(b.end_time);
          for (let m = s; m < e; m += 30) blockCoveredRows.add(m);
        }

        return (
          <Stack key={day} gap={2}>
            <Heading size="sm">{formatDayLabel(day)}</Heading>
            <Box overflowX="auto">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader w="110px">Time</Table.ColumnHeader>
                    {tracks.map((t) => (
                      <Table.ColumnHeader key={t.id}>{t.name}</Table.ColumnHeader>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rowTimes.map((time) => {
                    const rowMin = timeToMinutes(time);
                    const block = blockStartByRow.get(time);
                    const isBlockCovered = blockCoveredRows.has(rowMin);
                    return (
                      <Table.Row key={time}>
                        <Table.Cell verticalAlign="top">
                          <Text fontSize="sm" fontWeight="medium">
                            {time}
                          </Text>
                        </Table.Cell>
                        {block ? (
                          <Table.Cell
                            colSpan={tracks.length}
                            rowSpan={Math.max(
                              1,
                              Math.round(
                                (timeToMinutes(block.end_time) -
                                  timeToMinutes(block.start_time)) /
                                  30,
                              ),
                            )}
                            verticalAlign="middle"
                            bg="gray.50"
                          >
                            <Flex justify="space-between" align="center" gap={2}>
                              <Text fontSize="sm" fontWeight="medium">
                                {block.label || "Reserved"} ·{" "}
                                {formatTime(block.start_time)}–
                                {formatTime(block.end_time)}
                              </Text>
                              <Button
                                size="2xs"
                                variant="ghost"
                                colorPalette="red"
                                onClick={() => handleDeleteBlock(block.id)}
                              >
                                Remove
                              </Button>
                            </Flex>
                          </Table.Cell>
                        ) : isBlockCovered ? null : (
                          tracks.map((track) => {
                            const cellKey = `${track.id}:${time}`;
                            if (coveredCells.has(`${track.id}:${rowMin}`)) return null;
                            const assignment = startByCell.get(cellKey);
                            const proposal = assignment
                              ? proposalById.get(assignment.proposal_id)
                              : undefined;
                            if (proposal) {
                              return (
                                <Table.Cell
                                  key={track.id}
                                  verticalAlign="top"
                                  rowSpan={durationRows(proposal.duration_minutes)}
                                  bg="teal.50"
                                >
                                  <Stack gap={1}>
                                    <Text fontSize="sm" fontWeight="medium">
                                      {proposal.title}
                                    </Text>
                                    <Text fontSize="xs" color="fg.muted">
                                      {proposal.proposer_name} ·{" "}
                                      {proposal.duration_minutes ?? 30}m ·{" "}
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
                                </Table.Cell>
                              );
                            }
                            const placeable =
                              !!selected &&
                              canPlaceSession({
                                day,
                                trackId: track.id,
                                startTime: time,
                                durationMinutes: selected.duration_minutes,
                                dayStart: event.agenda_day_start,
                                dayEnd: event.agenda_day_end,
                                assignments: dayAssignments,
                                blocks: dayBlocks,
                                proposalDurations,
                              });
                            return (
                              <Table.Cell key={track.id} verticalAlign="top">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  w="full"
                                  color="fg.muted"
                                  disabled={!placeable}
                                  onClick={() =>
                                    handleCellClick(day, track.id, time)
                                  }
                                >
                                  {placeable ? "Place here" : "—"}
                                </Button>
                              </Table.Cell>
                            );
                          })
                        )}
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
