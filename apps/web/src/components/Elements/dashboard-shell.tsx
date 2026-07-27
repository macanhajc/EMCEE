import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

export function DashboardShell({
  email,
  role,
  hasBilling,
  children,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-ink font-marquee-body">
      <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-display text-sm text-paper"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-spotlight" />
            BOTMAKER
          </Link>

          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <UserMenu email={email} role={role} hasBilling={hasBilling} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>
    </div>
  );
}
