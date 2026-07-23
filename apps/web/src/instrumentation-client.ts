import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubSensitiveData,
});

// Required by the SDK so crash reports carry which route the user was
// navigating to/from — not performance tracing (no tracesSampleRate is set).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
