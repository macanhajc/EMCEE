import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-paper/10">
      <div className="flex flex-col px-4 py-12 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-sm text-paper"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-spotlight" />
            BOTMARKET
          </Link>

          <div className="flex gap-6 font-marquee-body text-sm text-dust">
            <a href="#the-act" className="transition-colors hover:text-paper">
              The bot
            </a>
            <a
              href="#how-it-works"
              className="transition-colors hover:text-paper"
            >
              How it works
            </a>
            <a href="#pricing" className="transition-colors hover:text-paper">
              Pricing
            </a>
            <Link href="/login" className="transition-colors hover:text-paper">
              Log in
            </Link>
          </div>
        </div>

        <p className="mt-8 font-ui-mono text-xs text-dust">
          Independent project. Not affiliated with Highrise or Pocket Worlds.
        </p>
      </div>
    </footer>
  );
}
