"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorFallback } from "@/components/Elements/error-fallback";
import "./globals.css";

/**
 * Root-level boundary — catches errors the nested app/error.tsx can't,
 * i.e. ones thrown by layout.tsx itself. Next.js requires this to render
 * its own <html>/<body>; the font loader vars from layout.tsx aren't
 * available here, so branded fonts fall back to system defaults. Colors
 * (globals.css custom properties) still apply.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ErrorFallback reset={reset} />
      </body>
    </html>
  );
}
