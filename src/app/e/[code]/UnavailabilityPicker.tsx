"use client";

import { useState } from "react";

import {
  Box,
  Button,
  Field,
  Flex,
  Heading,
  Input,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";

import { setUnavailability } from "@/app/actions/attendee";
import { formatDay, formatTime } from "@/lib/types";

interface Window {
  day: string;
  start_time: string;
  end_time: string;
}

export function UnavailabilityPicker({
  code,
  days,
  initial,
}: {
  code: string;
  days: string[];
  initial: Window[];
}) {
  const [windows, setWindows] = useState<Window[]>(initial);
  const [day, setDay] = useState(days[0] ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const dirty = JSON.stringify(windows) !== JSON.stringify(initial);

  function addWindow() {
    if (!day || !start || !end || end <= start) return;
    setWindows([...windows, { day, start_time: start, end_time: end }]);
    setStart("");
    setEnd("");
  }

  return (
    <Box borderWidth="1px" borderRadius="lg" p={6}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading size="md">Your availability</Heading>
          <Text color="fg.muted" fontSize="sm">
            Only set times you can&apos;t attend — the draft agenda avoids
            scheduling your session then.
          </Text>
        </Stack>

        {windows.length > 0 && (
          <Stack gap={2}>
            {windows.map((w, i) => (
              <Flex key={`${w.day}-${w.start_time}-${i}`} justify="space-between" align="center">
                <Text fontSize="sm">
                  Unavailable {formatDay(w.day)} · {formatTime(w.start_time)}–
                  {formatTime(w.end_time)}
                </Text>
                <Button
                  size="2xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() => setWindows(windows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </Flex>
            ))}
          </Stack>
        )}

        <Flex gap={3} align="flex-end" wrap="wrap">
          <Field.Root>
            <Field.Label>Day</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field value={day} onChange={(e) => setDay(e.target.value)}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label>From</Field.Label>
            <Input
              size="sm"
              type="time"
              step={1800}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Until</Field.Label>
            <Input
              size="sm"
              type="time"
              step={1800}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field.Root>
          <Button size="sm" variant="outline" onClick={addWindow}>
            Add
          </Button>
        </Flex>

        <form action={setUnavailability.bind(null, code)}>
          <input type="hidden" name="slots" value={JSON.stringify(windows)} />
          <Button type="submit" size="sm" colorPalette="teal" disabled={!dirty}>
            Save availability
          </Button>
        </form>
      </Stack>
    </Box>
  );
}
