"use client";

import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/UI/dropdown-menu";

// Each language's name written in itself (endonym) — the standard
// convention for language pickers, so a visitor can find their own
// language without first having to read a language they don't speak.
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 px-3 py-1.5 font-ui-mono text-xs text-dust outline-none hover:bg-paper/10 hover:text-paper">
        <Globe aria-hidden className="size-3.5" />
        {locale.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border border-paper/10 bg-panel">
        {routing.locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            className="cursor-pointer text-paper focus:bg-paper/10 focus:text-marquee"
            onSelect={() => {
              router.replace(pathname, { locale: loc });
            }}
          >
            {LOCALE_LABELS[loc] ?? loc}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
