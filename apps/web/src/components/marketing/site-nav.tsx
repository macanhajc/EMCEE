import Link from "next/link";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { UserMenu } from "../dashboard/user-menu";
import { db, tables } from "@/db";
import { eq } from "drizzle-orm";

export async function SiteNav() {
  const session = await auth();

  const user = session?.user
    ? (await db.select().from(tables.users).where(eq(tables.users.id, session.user.id)))[0]
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-sm text-paper"
        >
          <span aria-hidden className="size-2.5 rounded-full bg-spotlight" />
          BOTMARKET
        </Link>

        <div className="hidden items-center gap-8 font-marquee-body text-sm text-dust md:flex">
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
        </div>

        <div className="flex items-center gap-2">
          {session?.user ? (
            <UserMenu
              email={session.user.email ?? ""}
              role={session.user.role ?? "customer"}
              hasBilling={Boolean(user?.stripeCustomerId)}
            />
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                className="text-paper hover:bg-paper/10 hover:text-paper"
              >
                <Link href="/login">Log in</Link>
              </Button>
              <Button
                asChild
                className="bg-marquee text-ink hover:bg-marquee/85"
              >
                <Link href="/dashboard">Start free trial</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
