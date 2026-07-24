"use client";

import { useState } from "react";

import {
  Button,
  Field,
  Flex,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import { submitChangeRequest } from "@/app/actions/changeRequests";
import { formatDay, formatTime, type ChangeRequestKind } from "@/lib/types";

export interface SessionOption {
  id: string;
  title: string;
}

export interface TrackOption {
  id: string;
  name: string;
}

const KINDS: { value: ChangeRequestKind; label: string }[] = [
  { value: "move", label: "Move a session" },
  { value: "swap", label: "Swap two sessions" },
  { value: "add", label: "Add an unscheduled session" },
];

export function ProposeChangeForm({
  code,
  scheduled,
  unscheduled,
  days,
  times,
  tracks,
}: {
  code: string;
  scheduled: SessionOption[];
  unscheduled: SessionOption[];
  days: string[];
  times: string[];
  tracks: TrackOption[];
}) {
  const [kind, setKind] = useState<ChangeRequestKind>("move");
  const sessions = kind === "add" ? unscheduled : scheduled;
  const showTarget = kind !== "swap";
  const targetRequired = kind === "move";

  return (
    <form action={submitChangeRequest.bind(null, code)}>
      <Stack gap={4}>
        <Field.Root>
          <Field.Label>Change type</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ChangeRequestKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>

        {sessions.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            {kind === "add"
              ? "Every session is already on the agenda."
              : "No sessions are scheduled yet."}
          </Text>
        ) : (
          <>
            <Field.Root required>
              <Field.Label>Session</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field name="proposal_id">
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>

            {kind === "swap" && (
              <Field.Root required>
                <Field.Label>Swap with</Field.Label>
                <NativeSelect.Root>
                  <NativeSelect.Field name="other_proposal_id">
                    {scheduled.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
            )}

            {showTarget && (
              <Flex gap={3} wrap="wrap">
                <Field.Root required={targetRequired} flex="1" minW="10rem">
                  <Field.Label>Day</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field name="target_day">
                      {!targetRequired && <option value="">No suggestion</option>}
                      {days.map((d) => (
                        <option key={d} value={d}>
                          {formatDay(d)}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root required={targetRequired} flex="1" minW="8rem">
                  <Field.Label>Start</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field name="target_start_time">
                      {!targetRequired && <option value="">No suggestion</option>}
                      {times.map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root flex="1" minW="10rem">
                  <Field.Label>Room</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field name="target_track_id">
                      <option value="">Any room</option>
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              </Flex>
            )}

            <Field.Root>
              <Field.Label>Why?</Field.Label>
              <Textarea
                name="rationale"
                rows={2}
                placeholder="Optional — help others decide whether to back this"
              />
            </Field.Root>

            <Button type="submit" size="sm" colorPalette="teal" alignSelf="flex-start">
              Propose change
            </Button>
          </>
        )}
      </Stack>
    </form>
  );
}
