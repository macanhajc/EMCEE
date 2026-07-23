import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Button } from "@/components/UI/button";
import { LocaleSwitcher } from "@/components/Elements/locale-switcher";
import { UserMenu } from "@/components/Elements/user-menu";
import { Link } from "@/i18n/navigation";
import { db, tables } from "@/db";
import { eq } from "drizzle-orm";

export async function SiteNav() {
  const session = await auth();
  const t = await getTranslations();

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
          {t("common.brand")}
        </Link>

        <div className="hidden items-center gap-8 font-marquee-body text-sm text-dust md:flex">
          <Link href="/#the-act" className="transition-colors hover:text-paper">
            {t("nav.theBot")}
          </Link>
          <Link href="/#how-it-works" className="transition-colors hover:text-paper">
            {t("nav.howItWorks")}
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-paper">
            {t("nav.pricing")}
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
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
                <Link href="/login">{t("common.loginLink")}</Link>
              </Button>
              <Button
                asChild
                className="bg-marquee text-ink hover:bg-marquee/85"
              >
                <Link href="/dashboard">{t("nav.getStarted")}</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
