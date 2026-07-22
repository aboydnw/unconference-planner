"use client";

import { useState } from "react";

import { Box, Button, Flex, Heading, Stack } from "@chakra-ui/react";

export function CollapsibleBox({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box borderWidth="1px" borderRadius="lg" p={6}>
      <Flex justify="space-between" align="center">
        <Heading size="md">{title}</Heading>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Collapse" : "Edit"}
        </Button>
      </Flex>
      {open && <Stack gap={6} pt={4}>{children}</Stack>}
    </Box>
  );
}
