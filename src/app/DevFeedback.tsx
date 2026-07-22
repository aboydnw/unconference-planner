"use client";

import dynamic from "next/dynamic";

const RiffrecMount = dynamic(() => import("./RiffrecMount"), { ssr: false });

/**
 * Client-only entry point for the session recorder. riffrec touches browser
 * APIs (getDisplayMedia, MediaRecorder), so it must never run during SSR —
 * `ssr: false` keeps it out of the server render and code-splits it into its
 * own client chunk.
 */
export function DevFeedback() {
  return <RiffrecMount />;
}
