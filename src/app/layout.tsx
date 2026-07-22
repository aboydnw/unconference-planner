import type { Metadata } from "next";

import { DevFeedback } from "./DevFeedback";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Unconference Planner",
  description:
    "Plan unconference-style events: collect session proposals, vote, and build the agenda together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <DevFeedback />
      </body>
    </html>
  );
}
