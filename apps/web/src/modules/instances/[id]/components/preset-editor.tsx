"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import type { OutfitItemInfo } from "@/lib/highrise-webapi";
import { fieldControlClass } from "./field-control-class";
import { OutfitItemTile, placeholderOutfitItem, useOutfitSearch } from "./outfit-shared";

/** One `outfit_presets.presets` entry while it's being edited client-side. */
interface PresetDraft {
  key: string;
  name: string;
  items: OutfitItemInfo[];
}

/**
 * Parses one wire-format line ("name: item_id, item_id, ...") into a draft.
 * Mirrors `_parse_presets` in workers/runtime/catalog/avatar.py — a missing
 * colon just means "no ids yet" here rather than "skip the line" (unlike the
 * runtime parser) since this side needs to keep an in-progress preset the
 * owner hasn't finished naming or filling in.
 */
function parsePresetLine(
  line: string,
  resolved: Record<string, OutfitItemInfo>,
): { name: string; items: OutfitItemInfo[] } {
  const colonIdx = line.indexOf(":");
  const name = colonIdx === -1 ? line.trim() : line.slice(0, colonIdx).trim();
  const idsPart = colonIdx === -1 ? "" : line.slice(colonIdx + 1);
  const items = idsPart
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((itemId) => resolved[itemId] ?? placeholderOutfitItem(itemId));
  return { name, items };
}

/** One preset's name + equipped items + its own (collapsible) catalog search. */
function PresetRow({
  preset,
  open,
  onToggleOpen,
  onRename,
  onRemove,
  onAddItem,
  onRemoveItem,
  onSearch,
}: {
  preset: PresetDraft;
  open: boolean;
  onToggleOpen: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddItem: (item: OutfitItemInfo) => void;
  onRemoveItem: (itemId: string) => void;
  onSearch: (query: string) => Promise<OutfitItemInfo[]>;
}) {
  const { query, setQuery, results, searching } = useOutfitSearch(onSearch);
  const selectedIds = useMemo(
    () => new Set(preset.items.map((i) => i.id)),
    [preset.items],
  );
  const t = useTranslations("instanceDetail.config.presetEditor");
  const tOutfit = useTranslations("instanceDetail.config.outfitPicker");

  return (
    <div className="rounded-xl border border-paper/10 bg-ink/30 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={preset.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder={t("namePlaceholder")}
          className={`h-9 max-w-56 ${fieldControlClass}`}
        />
        <span className="font-ui-mono text-xs text-dust">
          {t("itemCount", { count: preset.items.length })}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-full p-1 text-dust hover:text-paper"
          aria-label={t("removePreset", { name: preset.name || t("untitled") })}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {preset.items.map((item) => (
          <OutfitItemTile
            key={item.id}
            item={item}
            onClick={() => onRemoveItem(item.id)}
            removable
          />
        ))}
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex size-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-paper/20 text-dust hover:border-marquee/50 hover:text-paper"
        >
          {open ? <X className="size-4" /> : <Plus className="size-4" />}
          <span className="text-[10px]">
            {open ? t("close") : t("addItem")}
          </span>
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-paper/10 bg-ink/20 p-3">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tOutfit("searchPlaceholder")}
            className={`h-9 ${fieldControlClass}`}
          />
          <div className="mt-3 grid max-h-56 grid-cols-3 gap-2 overflow-x-hidden overflow-y-auto pr-1 sm:grid-cols-4">
            {results.map((item) => (
              <OutfitItemTile
                key={item.id}
                item={item}
                onClick={() => onAddItem(item)}
                disabled={selectedIds.has(item.id)}
              />
            ))}
            {!searching && query.trim() && results.length === 0 && (
              <p className="col-span-full p-2 text-xs text-dust">
                {tOutfit("noMatches", { query })}
              </p>
            )}
            {!query.trim() && (
              <p className="col-span-full p-2 text-xs text-dust">
                {t("typeToSearch")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * `outfit_presets.presets` editor — one card per named preset, each with its
 * own catalog search (`PresetRow`) instead of hand-typing
 * "name: item_id, item_id, ..." lines into a textarea. Still serializes to
 * that exact wire format (one newline-joined form value, parsed by both
 * schema-form.ts's generic "string-array" case and `_parse_presets` in
 * workers/runtime/catalog/avatar.py) — only the editor changed. `form`
 * optionally targets a sibling `<form>` by id, same HTML `form=` attribute
 * trick tag-list-input.tsx uses.
 */
export function PresetEditor({
  id,
  name,
  form,
  defaultValue,
  maxItems,
  resolved,
  onSearch,
}: {
  id: string;
  name: string;
  form?: string;
  defaultValue: string[];
  maxItems?: number;
  resolved: Record<string, OutfitItemInfo>;
  onSearch: (query: string) => Promise<OutfitItemInfo[]>;
}) {
  const [presets, setPresets] = useState<PresetDraft[]>(() =>
    defaultValue.map((line) => ({
      key: crypto.randomUUID(),
      ...parsePresetLine(line, resolved),
    })),
  );
  const [openKey, setOpenKey] = useState<string | null>(null);

  const serialized = useMemo(
    () =>
      presets
        .filter((p) => p.name.trim() && p.items.length > 0)
        .map((p) => `${p.name.trim()}: ${p.items.map((i) => i.id).join(", ")}`)
        .join("\n"),
    [presets],
  );

  const atLimit = maxItems !== undefined && presets.length >= maxItems;

  function addPreset() {
    if (atLimit) return;
    const key = crypto.randomUUID();
    setPresets((prev) => [...prev, { key, name: "", items: [] }]);
    setOpenKey(key);
  }

  function removePreset(key: string) {
    setPresets((prev) => prev.filter((p) => p.key !== key));
    setOpenKey((prev) => (prev === key ? null : prev));
  }

  function renamePreset(key: string, newName: string) {
    setPresets((prev) =>
      prev.map((p) => (p.key === key ? { ...p, name: newName } : p)),
    );
  }

  function addItemToPreset(key: string, item: OutfitItemInfo) {
    setPresets((prev) =>
      prev.map((p) =>
        p.key === key && !p.items.some((i) => i.id === item.id)
          ? { ...p, items: [...p.items, item] }
          : p,
      ),
    );
  }

  function removeItemFromPreset(key: string, itemId: string) {
    setPresets((prev) =>
      prev.map((p) =>
        p.key === key
          ? { ...p, items: p.items.filter((i) => i.id !== itemId) }
          : p,
      ),
    );
  }

  const t = useTranslations("instanceDetail.config.presetEditor");

  return (
    <div>
      <input type="hidden" id={id} name={name} form={form} value={serialized} readOnly />
      <div className="grid gap-3">
        {presets.map((preset) => (
          <PresetRow
            key={preset.key}
            preset={preset}
            open={openKey === preset.key}
            onToggleOpen={() =>
              setOpenKey((prev) => (prev === preset.key ? null : preset.key))
            }
            onRename={(newName) => renamePreset(preset.key, newName)}
            onRemove={() => removePreset(preset.key)}
            onAddItem={(item) => addItemToPreset(preset.key, item)}
            onRemoveItem={(itemId) => removeItemFromPreset(preset.key, itemId)}
            onSearch={onSearch}
          />
        ))}
        {presets.length === 0 && (
          <p className="text-xs text-dust">{t("noneYet")}</p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={addPreset}
        disabled={atLimit}
        className="mt-3 h-9 cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
      >
        {t("addPreset")}
      </Button>
      {atLimit && (
        <p className="mt-2 text-xs text-dust">
          {t("maxPresets", { max: maxItems })}
        </p>
      )}
    </div>
  );
}
