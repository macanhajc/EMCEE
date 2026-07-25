"use client";

import { startTransition, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Label } from "@/components/UI/label";
import { fieldControlClass } from "./field-control-class";
import { useGeneral } from "../hooks/use-general";

const BOT_LANGUAGES = ["en", "es", "de", "pt", "ru"] as const;

/**
 * Status → Bot language card — the whole card, chrome included. Fully
 * self-contained: fetches its own current `bot_language` via useGeneral and
 * owns its own save action, rather than being handed `config.general` down
 * from the page's own server-rendered props. Rendered directly in
 * instance-config.tsx's Status tab (bot-wide, not tied to any one feature
 * module) alongside `BotTokenUpdate`/`StatusLog`/`BotDangerZone`.
 *
 * `general` has no section-level `enabled` (the schema section has none —
 * a language is always "on") and exactly one field, so unlike every
 * checkbox-driven auto-save card this doesn't need the createPortal/
 * useSyncExternalStore form-outside-the-DOM-subtree trick or the manual
 * FormData-plus-forced-value workaround Radix's `Checkbox` needs (see
 * `welcome-card.tsx`'s comment on why that one does) — a native `<select>`'s
 * value is already current in the DOM by the time its own `onChange` fires,
 * so `new FormData(e.currentTarget.form)` just works, same plain-inline-form
 * shape the Status tab's other cards already settled on (docs/decisions.md,
 * 2026-07-24).
 */
export function GeneralCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.config");
  const tInstance = useTranslations("instanceDetail");
  const { data, state, formAction } = useGeneral(instanceId);

  const [botLanguage, setBotLanguage] = useState("en");
  const [seededFor, setSeededFor] = useState<typeof data>(null);
  if (data !== null && data !== seededFor) {
    setSeededFor(data);
    setBotLanguage(data.bot_language);
  }

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(tInstance("savedMessage"));
    } else {
      toast.error(tInstance.has(`errors.${state.error}`) ? tInstance(`errors.${state.error}`) : state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setBotLanguage(value);
    const form = e.currentTarget.form;
    if (!form) return;
    // useActionState's dispatch expects to run inside a transition when
    // called directly like this (not via the form's own submit) — skip it
    // and React warns "called outside of a transition" and isPending won't
    // track correctly.
    startTransition(() => {
      formAction(new FormData(form));
    });
  }

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h3 className="font-display text-base text-paper">{t("general.title")}</h3>
      <p className="mt-1 text-sm text-dust">{t("general.description")}</p>

      {!data ? (
        <p className="mt-5 text-xs text-dust">{t("loading")}</p>
      ) : (
        <form action={formAction} className="mt-5 grid gap-2">
          <Label htmlFor="general-bot-language" className="text-dust">
            {t("general.botLanguageLabel")}
          </Label>
          <select
            id="general-bot-language"
            name="bot_language"
            value={botLanguage}
            onChange={handleChange}
            className={`h-10 max-w-xs rounded-lg border px-3 text-sm focus-visible:outline-none ${fieldControlClass}`}
          >
            {BOT_LANGUAGES.map((value) => (
              <option key={value} value={value} className="bg-ink">
                {t(`languageLabels.${value}`)}
              </option>
            ))}
          </select>
        </form>
      )}
    </div>
  );
}
