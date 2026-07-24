import {
  Button,
  Field,
  Flex,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import { submitReviewSession } from "@/app/actions/changeRequests";
import { ProposalFields } from "@/app/e/[code]/ProposalFields";
import { formatDay, formatTime, type ProposalField } from "@/lib/types";

import type { TrackOption } from "./ProposeChangeForm";

export function PitchSessionForm({
  code,
  fields,
  days,
  times,
  tracks,
}: {
  code: string;
  fields: ProposalField[];
  days: string[];
  times: string[];
  tracks: TrackOption[];
}) {
  return (
    <form action={submitReviewSession.bind(null, code)}>
      <Stack gap={4}>
        <Text color="fg.muted" fontSize="sm">
          Voting is closed — 👍s on your request are its demand signal.
        </Text>
        <ProposalFields fields={fields} />
        <Flex gap={3} wrap="wrap">
          <Field.Root flex="1" minW="10rem">
            <Field.Label>Suggested day</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field name="target_day">
                <option value="">No suggestion</option>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root flex="1" minW="8rem">
            <Field.Label>Suggested start</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field name="target_start_time">
                <option value="">No suggestion</option>
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
        <Field.Root>
          <Field.Label>Why now?</Field.Label>
          <Textarea
            name="rationale"
            rows={2}
            placeholder="Optional — why this belongs on the agenda"
          />
        </Field.Root>
        <Button type="submit" size="sm" colorPalette="teal" alignSelf="flex-start">
          Pitch session
        </Button>
      </Stack>
    </form>
  );
}
