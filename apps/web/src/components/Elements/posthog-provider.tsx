"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * No-ops (renders children as-is) when NEXT_PUBLIC_POSTHOG_KEY is unset,
 * so local dev without a PostHog project doesn't need a dummy key.
 *
 * Session recording is off outright rather than relying on masking — this
 * app's riskiest UI is a bot-token paste field, and specs/05-security.md
 * treats tokens as the one thing that must never leave the process.
 * `history_change` pageview capture matches the App Router (no full page
 * loads on navigation, so PostHog's default pageview tracking would miss
 * client-side transitions otherwise).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return children;

  return (
    <PHProvider
      apiKey={apiKey}
      options={{
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: "history_change",
        person_profiles: "identified_only",
        disable_session_recording: true,
      }}
    >
      {children}
    </PHProvider>
  );
}
