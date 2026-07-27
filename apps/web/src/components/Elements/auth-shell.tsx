import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  maxWidth = "max-w-sm",
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-ink font-marquee-body">
      <header className="flex items-center justify-between px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 font-display text-sm text-paper">
          <span aria-hidden className="size-2.5 rounded-full bg-spotlight" />
          BOTMAKER
        </Link>
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className={`w-full ${maxWidth}`}>
          <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl text-paper">{title}</h1>
          {subtitle && (
            <p className="mt-3 font-marquee-body text-sm leading-relaxed text-dust">
              {subtitle}
            </p>
          )}

          <div className="mt-8 rounded-2xl border border-paper/10 bg-panel p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
