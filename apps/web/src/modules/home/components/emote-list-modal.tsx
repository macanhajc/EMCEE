"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/UI/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/UI/dialog";
import { Input } from "@/components/UI/input";
import { EMOTE_CATALOG } from "@/lib/emote-catalog";

/** "See all emotes" trigger + modal, scoped to the landing page's Emote feature card. */
export function EmoteListModal() {
  const t = useTranslations("home.botShowcase");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOTE_CATALOG;
    return EMOTE_CATALOG.filter((emote) => emote.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <Dialog onOpenChange={(open) => !open && setQuery("")}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="mt-4 h-8 cursor-pointer border-paper/15 bg-transparent text-xs text-paper hover:bg-paper/10 hover:text-paper"
        >
          {t("viewEmotesButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-scroll flex-col border-paper/10 bg-panel text-paper sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-paper">
            {t("emoteModalTitle")}
          </DialogTitle>
          <DialogDescription className="text-dust">
            {t("emoteModalDescription", { count: EMOTE_CATALOG.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-dust" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("emoteModalSearchPlaceholder")}
            className="border-paper/15 bg-ink/30 pl-9 text-paper placeholder:text-dust"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pr-1 sm:grid-cols-3">
          {filtered.map((emote) => (
            <p key={emote.id} className="truncate py-1 text-sm text-dust">
              {emote.name}
            </p>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-2 text-sm text-dust">
              {t("emoteModalNoMatches", { query })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
