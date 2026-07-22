"use client";

import { useState } from "react";

import { Button } from "@chakra-ui/react";

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button size="sm" variant="outline" onClick={copy}>
      {copied ? "Copied!" : "Copy attendee link"}
    </Button>
  );
}
