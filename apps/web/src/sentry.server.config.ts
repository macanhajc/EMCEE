import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // No PII by default — session cookies and request bodies can carry
  // customer data; beforeSend still scrubs anything token/secret-shaped
  // that slips through regardless.
  sendDefaultPii: false,
  beforeSend: scrubSensitiveData,
});
