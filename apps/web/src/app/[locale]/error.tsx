"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { ErrorFallback } from "@/components/Elements/error-fallback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const t = useTranslations("errorPage");
  const locale = useLocale();

  return (
    <ErrorFallback
      reset={reset}
      homeHref={`/${locale}`}
      eyebrow={t("eyebrow")}
      title={t("title")}
      body={t("body")}
      tryAgainLabel={t("tryAgain")}
      goHomeLabel={t("goHome")}
    />
  );
}
