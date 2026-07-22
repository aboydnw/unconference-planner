"use client";

import { RiffrecProvider, RiffrecRecorder } from "riffrec";

/**
 * Mounts the riffrec session recorder (screen video, mic narration, clicks,
 * navigation, network outcomes, console errors).
 *
 * `forceEnable` is required because riffrec disables itself in production
 * builds by default. We keep it on so internal testers can record sessions
 * anywhere, including the deployed app.
 */
export default function RiffrecMount() {
  return (
    <RiffrecProvider forceEnable>
      <RiffrecRecorder />
    </RiffrecProvider>
  );
}
