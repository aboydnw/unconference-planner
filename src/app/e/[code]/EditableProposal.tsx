"use client";

import { useState } from "react";

import { Button, Stack } from "@chakra-ui/react";

import { updateOwnProposal } from "@/app/actions/attendee";
import type { ProposalField } from "@/lib/types";

import { ProposalFields, type ProposalFormValues } from "./ProposalFields";

export function EditableProposal({
  code,
  proposalId,
  fields,
  values,
}: {
  code: string;
  proposalId: string;
  fields: ProposalField[];
  values: ProposalFormValues;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Button size="2xs" variant="ghost" onClick={() => setEditing(true)}>
        Edit mine
      </Button>
    );
  }

  return (
    <form action={updateOwnProposal.bind(null, code, proposalId)}>
      <Stack gap={3} pt={2}>
        <ProposalFields fields={fields} values={values} />
        <Stack direction="row" gap={2}>
          <Button type="submit" size="sm" colorPalette="teal">
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
