import { Link2, Lock } from "lucide-react";
import { eq, ne } from "drizzle-orm";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, tables } from "@/db";
import { BOT_FEATURES, BOT_ROADMAP } from "@/lib/roadmap";
import { createInstance } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts — try again in a few minutes.",
  missing_room: "Enter a room ID or paste your room's share link.",
  missing_token: "Paste your bot's API token.",
  unknown_bot: "That bot isn't available anymore — refresh and try again.",
  bad_token: "That token doesn't look right.",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  beta: "Beta",
  ga: "Live",
  retired: "Retired",
};

export default async function NewInstancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth(); // proxy.ts already guarantees this is set

  const [bots, [user]] = await Promise.all([
    db.select().from(tables.catalogBots).where(ne(tables.catalogBots.lifecycle, "retired")),
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
  ]);
  // v1: exactly one bot, not a catalog to choose between (docs/decisions.md, 2026-07-20).
  const bot = bots[0] ?? null;

  return (
    <DashboardShell
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
    >
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">New instance</p>
      <h1 className="mt-2 font-display text-3xl text-paper">Create a bot</h1>
      <p className="mt-3 max-w-lg font-marquee-body text-sm leading-relaxed text-dust">
        Connect it to your room and paste your token — it&apos;ll be live in about two minutes.
        Nothing is charged here: you&apos;ll configure it first and subscribe when you&apos;re
        ready.
      </p>

      {error && (
        <Alert className="mt-6 max-w-lg border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {ERROR_MESSAGES[error] ?? "Something went wrong."}
          </AlertDescription>
        </Alert>
      )}

      {!bot ? (
        <div className="mt-10 rounded-2xl border border-dashed border-paper/20 px-8 py-16 text-center">
          <p className="font-display text-xl text-paper">No bot available right now</p>
          <p className="mx-auto mt-2 max-w-sm font-marquee-body text-sm text-dust">
            Check back soon.
          </p>
        </div>
      ) : (
        <form action={createInstance} className="mt-8 grid max-w-6xl gap-8">
          <input type="hidden" name="bot" value={bot.slug} />

          <div className="rounded-2xl border border-paper/10 bg-panel p-7">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl text-paper">{bot.name}</h2>
              {bot.lifecycle !== "ga" && (
                <Badge className="rounded-full border-0 bg-marquee text-ink hover:bg-marquee">
                  {LIFECYCLE_LABELS[bot.lifecycle] ?? bot.lifecycle}
                </Badge>
              )}
            </div>
            {bot.tagline && <p className="mt-3 text-base text-dust">{bot.tagline}</p>}
            <div className="mt-5 grid gap-3 border-t border-paper/10 pt-5 sm:grid-cols-2">
              {BOT_FEATURES.map((feature) => (
                <div key={feature.name}>
                  <p className="font-display text-sm text-spotlight">{feature.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-dust">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
              Coming soon — same bot, new modules
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {BOT_ROADMAP.map((mod) => (
                <div
                  key={mod.name}
                  className="rounded-xl border border-dashed border-paper/15 bg-transparent p-3"
                >
                  <h3 className="font-display text-sm text-paper/70">{mod.name}</h3>
                  <p className="font-ui-mono text-[10px] text-dust">{mod.role}</p>
                  <p className="mt-1 text-xs text-dust">{mod.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid">
            <Label htmlFor="room_id" className="text-dust mb-2">
              Room share link or ID
            </Label>
            <Input
              id="room_id"
              name="room_id"
              required
              placeholder="Paste the room's share link, or just the ID"
              className="h-11 border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30"
            />
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-dust">
              <Link2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-marquee" />
              Paste the whole share link and we&apos;ll pull the room ID out of it automatically
              — or skip that and paste just the ID. Your bot needs designer rights in this room.
            </p>
          </div>

          <div className="rounded-2xl border border-paper/10 bg-panel p-5">
            <Label htmlFor="token" className="text-dust mb-2">
              Bot API token
            </Label>
            <Input
              id="token"
              name="token"
              type="password"
              autoComplete="off"
              required
              className="mt-1.5 h-11 border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30"
            />
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-dust">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-marquee" />
              Encrypted the moment you submit this. It&apos;s write-only from here on — nobody,
              us included, can view it again. The dashboard only ever shows the last 4 characters.
            </p>
            <details className="mt-4 group/details">
              <summary className="cursor-pointer font-ui-mono text-[11px] tracking-[0.1em] text-marquee uppercase select-none">
                How do I get a token?
              </summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-dust">
                <li>
                  Go to create.highrise.game → <span className="text-paper">Dashboard</span> →{" "}
                  <span className="text-paper">Bots &amp; API Keys</span>.
                </li>
                <li>Create a bot (or pick an existing one) and copy its API token.</li>
                <li>
                  Bot API access requires Trust &amp; Safety eligibility on your Highrise account
                  — you&apos;ll see the option there if you qualify.
                </li>
              </ol>
            </details>
          </div>

          <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
            Create instance
          </Button>
        </form>
      )}
    </DashboardShell>
  );
}
