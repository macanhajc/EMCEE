"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/**
 * Comma-delimited tag input for "string-array" fields. Serializes to a
 * single newline-joined hidden input (the wire format every dedicated card's
 * own mutate action splits `string-array` fields back out of, e.g.
 * `updateVipConfig`'s `users`) via an `<input type="hidden">` — `form`
 * optionally targets a sibling `<form>` by id (the same HTML `form=`
 * attribute trick PositionEditor uses, for a field whose own component isn't
 * nested directly inside the form it submits to).
 */
export function TagListInput({
  id,
  name,
  form,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  form?: string;
  defaultValue: string[];
  placeholder?: string;
}) {
  const [tags, setTags] = useState(defaultValue);
  const [draft, setDraft] = useState("");

  function addTags(raw: string) {
    const additions = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (additions.length === 0) return;
    setTags((prev) => [...prev, ...additions.filter((t) => !prev.includes(t))]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val.includes(",")) {
      const parts = val.split(",");
      const remainder = parts.pop() ?? "";
      addTags(parts.join(","));
      setDraft(remainder);
    } else {
      setDraft(val);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTags(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function handleBlur() {
    if (draft) {
      addTags(draft);
      setDraft("");
    }
  }

  const t = useTranslations("instanceDetail.config");

  return (
    <div>
      <input type="hidden" name={name} form={form} value={tags.join("\n")} readOnly />
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-paper/15 bg-ink/50 px-2 py-1.5 focus-within:border-spotlight/50 focus-within:ring-3 focus-within:ring-spotlight/30">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-paper/10 py-0.5 pr-1 pl-2 text-xs text-paper"
          >
            {tag}
            <button
              type="button"
              onClick={() => setTags((prev) => prev.filter((v) => v !== tag))}
              className="rounded-full p-0.5 text-dust hover:text-paper"
              aria-label={t("removeTag", { tag })}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? placeholder : undefined}
          className="min-w-[8ch] flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-dust/50"
        />
      </div>
    </div>
  );
}
