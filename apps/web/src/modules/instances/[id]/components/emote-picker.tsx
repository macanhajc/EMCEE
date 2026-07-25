"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/UI/input";
import { EMOTE_CATALOG } from "@/lib/emote-catalog";
import { fieldControlClass } from "./field-control-class";

/**
 * Every catalog emote as a toggle chip — available (default) or blocked.
 * Submits the same wire format `disabled_emotes` already parses (a single
 * newline-joined form value) — only the *editor* differs from a plain
 * `TagListInput`, not the schema or the parser. `form` optionally targets a
 * sibling `<form>` by id, same HTML `form=` attribute trick tag-list-input.tsx
 * uses.
 */
export function EmotePicker({
  id,
  name,
  form,
  defaultValue,
}: {
  id: string;
  name: string;
  form?: string;
  defaultValue: string[];
}) {
  const [blocked, setBlocked] = useState(() => new Set(defaultValue));
  const [query, setQuery] = useState("");
  const t = useTranslations("instanceDetail.config.emotePicker");

  function toggle(emoteId: string) {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(emoteId)) next.delete(emoteId);
      else next.add(emoteId);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q
        ? EMOTE_CATALOG.filter(
            (e) => e.name.toLowerCase().includes(q) || e.id.includes(q),
          )
        : EMOTE_CATALOG,
    [q],
  );
  const availableCount = EMOTE_CATALOG.filter((e) => !blocked.has(e.id)).length;

  return (
    <div>
      <input
        type="hidden"
        name={name}
        form={form}
        value={Array.from(blocked).join("\n")}
        readOnly
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          id={id}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`h-9 max-w-56 ${fieldControlClass}`}
        />
        <div className="flex items-center gap-3 font-ui-mono text-xs text-dust">
          <span>
            {t("availableOf", {
              available: availableCount,
              total: EMOTE_CATALOG.length,
            })}
          </span>
          <button
            type="button"
            onClick={() => setBlocked(new Set())}
            className="text-marquee hover:underline"
          >
            {t("allowAll")}
          </button>
          <button
            type="button"
            onClick={() => setBlocked(new Set(EMOTE_CATALOG.map((e) => e.id)))}
            className="text-marquee hover:underline"
          >
            {t("blockAll")}
          </button>
        </div>
      </div>
      <div className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-paper/10 bg-ink/30 p-3">
        {visible.map((emote) => {
          const isBlocked = blocked.has(emote.id);
          return (
            <button
              key={emote.id}
              type="button"
              onClick={() => toggle(emote.id)}
              aria-pressed={!isBlocked}
              title={isBlocked ? t("blockedTitle") : t("availableTitle")}
              className={
                isBlocked
                  ? "rounded-full cursor-pointer border border-dashed border-paper/15 px-2.5 py-1 text-xs text-dust/50 line-through"
                  : "rounded-full cursor-pointer border border-transparent bg-paper/10 px-2.5 py-1 text-xs text-paper hover:bg-paper/20"
              }
            >
              {emote.name}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="p-2 text-xs text-dust">{t("noMatches", { query })}</p>
        )}
      </div>
    </div>
  );
}
