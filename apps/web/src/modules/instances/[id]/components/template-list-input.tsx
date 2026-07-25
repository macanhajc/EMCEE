"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { fieldControlClass } from "./field-control-class";

/** One `welcome.templates` entry while it's being edited client-side. */
interface TemplateDraft {
  key: string;
  value: string;
}

/**
 * `welcome.templates` editor — one free-text row per template, add/remove.
 * Deliberately NOT TagListInput: every default template ("Welcome to
 * {room_name}, {username}!") contains a literal comma, and TagListInput
 * treats a typed comma as a tag separator — reusing it here would silently
 * split a single template into two entries the moment someone typed (or
 * pasted) one. Still serializes to the same newline-joined wire format
 * schema-form.ts's "string-array" case already expects — only the editor
 * differs. `form` optionally targets a sibling `<form>` by id, same HTML
 * `form=` attribute trick tag-list-input.tsx uses.
 */
export function TemplateListInput({
  id,
  name,
  form,
  defaultValue,
  maxItems,
  placeholder,
}: {
  id: string;
  name: string;
  form?: string;
  defaultValue: string[];
  maxItems?: number;
  placeholder?: string;
}) {
  const [templates, setTemplates] = useState<TemplateDraft[]>(() =>
    defaultValue.map((value) => ({ key: crypto.randomUUID(), value })),
  );

  const serialized = useMemo(
    () =>
      templates
        .map((t) => t.value.trim())
        .filter(Boolean)
        .join("\n"),
    [templates],
  );

  const atLimit = maxItems !== undefined && templates.length >= maxItems;

  function addTemplate() {
    if (atLimit) return;
    setTemplates((prev) => [...prev, { key: crypto.randomUUID(), value: "" }]);
  }

  function updateTemplate(key: string, value: string) {
    setTemplates((prev) => prev.map((t) => (t.key === key ? { ...t, value } : t)));
  }

  function removeTemplate(key: string) {
    setTemplates((prev) => prev.filter((t) => t.key !== key));
  }

  const t = useTranslations("instanceDetail.config.templateListInput");

  return (
    <div>
      <input type="hidden" id={id} name={name} form={form} value={serialized} readOnly />
      <div className="grid gap-2">
        {templates.map((template, index) => (
          <div key={template.key} className="flex items-center gap-2">
            <Input
              value={template.value}
              onChange={(e) => updateTemplate(template.key, e.target.value)}
              placeholder={placeholder}
              className={`h-9 ${fieldControlClass}`}
            />
            <button
              type="button"
              onClick={() => removeTemplate(template.key)}
              className="rounded-full p-1 text-dust hover:text-paper"
              aria-label={t("removeTemplate", { index: index + 1 })}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {templates.length === 0 && <p className="text-xs text-dust">{t("noneYet")}</p>}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={addTemplate}
        disabled={atLimit}
        className="mt-3 h-9 cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
      >
        {t("addTemplate")}
      </Button>
      {atLimit && <p className="mt-2 text-xs text-dust">{t("maxTemplates", { max: maxItems })}</p>}
    </div>
  );
}
