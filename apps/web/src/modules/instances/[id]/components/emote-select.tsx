"use client";

import { useTranslations } from "next-intl";
import { EMOTE_CATALOG } from "@/lib/emote-catalog";
import { fieldControlClass } from "./field-control-class";

/**
 * Single-emote `<select>` — reuses `EMOTE_CATALOG` so the owner picks a
 * friendly name instead of typing the raw internal id blind, the same
 * reason `EmotePicker` (instance-config.tsx) exists for `disabled_emotes`.
 * `form` optionally targets a sibling `<form>` by id, same HTML `form=`
 * attribute trick tag-list-input.tsx uses.
 *
 * Controlled (`value`/`onChange`), not `defaultValue` — React 19 resets
 * uncontrolled fields inside a `<form action={...}>` back to their
 * `defaultValue` once the action resolves successfully, which would snap
 * this back to whatever it was *before* the owner's pick the instant a save
 * completes (idle-emote-loop-card.tsx's own `useIdleEmoteLoop` refetch
 * hasn't necessarily landed yet at that point). A controlled value is
 * immune — React owns it every render instead of the DOM.
 */
export function EmoteSelect({
  id,
  name,
  form,
  value,
  onChange,
}: {
  id: string;
  name: string;
  form?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("instanceDetail.config.emotePicker");
  return (
    <select
      id={id}
      name={name}
      form={form}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 max-w-xs rounded-lg border px-3 text-sm focus-visible:outline-none ${fieldControlClass}`}
    >
      <option value="" className="bg-ink">
        {t("chooseEmote")}
      </option>
      {EMOTE_CATALOG.map((emote) => (
        <option key={emote.id} value={emote.id} className="bg-ink">
          {emote.name}
        </option>
      ))}
    </select>
  );
}
