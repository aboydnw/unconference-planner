"use client";

import { useState } from "react";

import { Button } from "@chakra-ui/react";

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button size="xs" variant="outline" onClick={copy}>
      {copied ? "Copied!" : "Copy share link"}
    </Button>
  );
}
