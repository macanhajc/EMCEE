import { Button } from "@/components/UI/button";

/**
 * Shared fallback UI for both error boundaries. Deliberately takes its copy
 * as props with English defaults rather than calling useTranslations itself:
 * global-error.tsx renders this when the root layout — the one place
 * NextIntlClientProvider is set up — has itself thrown, so it can't lean on
 * that context. app/[locale]/error.tsx (which sits below a working layout)
 * passes translated copy down instead.
 */
export function ErrorFallback({
  reset,
  homeHref = "/",
  eyebrow = "Something broke",
  title = "The show hit a snag",
  body = "This is on us, not you — it's already been reported and we're on it. Try again, or head back home.",
  tryAgainLabel = "Try again",
  goHomeLabel = "Go home",
}: {
  reset?: () => void;
  homeHref?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  tryAgainLabel?: string;
  goHomeLabel?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-ink px-6 py-20 font-marquee-body">
      <div className="w-full max-w-sm text-center">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">{eyebrow}</p>
        <h1 className="mt-3 font-display text-2xl text-paper">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-dust">{body}</p>

        <div className="mt-8 rounded-2xl border border-paper/10 bg-panel p-6">
          <div className="flex gap-2">
            {reset && (
              <Button
                onClick={reset}
                className="flex-1 bg-marquee text-ink hover:bg-marquee/85"
              >
                {tryAgainLabel}
              </Button>
            )}
            <Button asChild variant="outline" className="flex-1">
              <a href={homeHref}>{goHomeLabel}</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
