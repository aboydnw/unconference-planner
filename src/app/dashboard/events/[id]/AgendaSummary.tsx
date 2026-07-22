import { Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";

import type { ScheduleDay } from "@/lib/agenda";
import { formatDay, formatTime } from "@/lib/types";

export function AgendaSummary({ schedule }: { schedule: ScheduleDay[] }) {
  const populated = schedule.filter((d) => d.entries.length > 0);
  if (populated.length === 0) {
    return <Text color="fg.muted">No agenda built yet.</Text>;
  }
  return (
    <Stack gap={5}>
      {populated.map((d) => (
        <Stack key={d.day} gap={2}>
          <Heading size="sm">{formatDay(d.day)}</Heading>
          <Stack gap={2}>
            {d.entries.map((e, i) =>
              e.kind === "block" ? (
                <Box key={i} borderWidth="1px" borderRadius="md" bg="gray.50" px={4} py={2}>
                  <Text fontSize="sm" fontWeight="medium" color="fg.muted">
                    {formatTime(e.startTime)}–{formatTime(e.endTime ?? e.startTime)} ·{" "}
                    {e.label || "Reserved"}
                  </Text>
                </Box>
              ) : (
                <Flex key={i} borderWidth="1px" borderRadius="md" px={4} py={2} gap={3} align="baseline">
                  <Text fontSize="sm" fontWeight="medium" minW="60px">
                    {formatTime(e.startTime)}
                  </Text>
                  <Box>
                    <Text fontSize="sm" fontWeight="medium">
                      {e.title}
                      {e.trackName ? ` · ${e.trackName}` : ""}
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      {[e.proposerName, e.durationMinutes ? `${e.durationMinutes} min` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Box>
                </Flex>
              ),
            )}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
