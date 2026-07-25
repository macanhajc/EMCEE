"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/UI/input";
import type { OutfitItemInfo } from "@/lib/highrise-webapi";
import { fieldControlClass } from "./field-control-class";
import { OutfitItemTile, placeholderOutfitItem, useOutfitSearch } from "./outfit-shared";

/**
 * `default_outfit.item_ids` editor — a two-column "search the catalog, build
 * the loadout" layout instead of a raw id textarea. Left column searches
 * Highrise's public item catalog live (`onSearch`, debounced); clicking a
 * result moves it into the right column, styled like a game inventory
 * (icon + name + rarity-colored category), which is also this dashboard's
 * only visual stand-in for "what the bot is wearing" — there's no API that
 * returns a single composited avatar image (checked directly against the
 * pinned SDK source), only per-item icons, so a real body render isn't on
 * the table here. `form` optionally targets a sibling `<form>` by id, same
 * HTML `form=` attribute trick tag-list-input.tsx uses.
 */
export function OutfitPicker({
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
  const [selected, setSelected] = useState<OutfitItemInfo[]>(() =>
    defaultValue.map(
      (itemId) => resolved[itemId] ?? placeholderOutfitItem(itemId),
    ),
  );
  const { query, setQuery, results, searching } = useOutfitSearch(onSearch);

  const selectedIds = useMemo(
    () => new Set(selected.map((i) => i.id)),
    [selected],
  );
  const atLimit = maxItems !== undefined && selected.length >= maxItems;

  function addItem(item: OutfitItemInfo) {
    if (selectedIds.has(item.id) || atLimit) return;
    setSelected((prev) => [...prev, item]);
  }

  function removeItem(itemId: string) {
    setSelected((prev) => prev.filter((i) => i.id !== itemId));
  }

  const t = useTranslations("instanceDetail.config.outfitPicker");

  return (
    <div>
      <input
        type="hidden"
        name={name}
        form={form}
        value={selected.map((i) => i.id).join("\n")}
        readOnly
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-paper/10 bg-ink/30 p-3">
          <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
            {t("searchCatalogLabel")}
          </p>
          <Input
            id={id}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className={`mt-2 h-9 ${fieldControlClass}`}
          />
          <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-x-hidden overflow-y-auto pr-1 sm:grid-cols-4">
            {results.map((item) => (
              <OutfitItemTile
                key={item.id}
                item={item}
                onClick={() => addItem(item)}
                disabled={selectedIds.has(item.id) || atLimit}
              />
            ))}
            {!searching && query.trim() && results.length === 0 && (
              <p className="col-span-full p-2 text-xs text-dust">
                {t("noMatches", { query })}
              </p>
            )}
            {!query.trim() && (
              <p className="col-span-full p-2 text-xs text-dust">
                {t("typeToSearch")}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-paper/10 bg-ink/30 p-3">
          <div className="flex items-center justify-between">
            <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
              {t("equippedLabel")}
            </p>
            <span className="font-ui-mono text-xs text-dust">
              {selected.length}
              {maxItems !== undefined ? ` / ${maxItems}` : ""}
            </span>
          </div>
          <div className="pt-3 pr-4 grid max-h-86.25 grid-cols-3 gap-2 overflow-x-hidden overflow-y-auto sm:grid-cols-4">
            {selected.map((item) => (
              <OutfitItemTile
                key={item.id}
                item={item}
                onClick={() => removeItem(item.id)}
                removable
              />
            ))}
            {selected.length === 0 && (
              <p className="col-span-full p-2 text-xs text-dust">
                {t("noItemsYet")}
              </p>
            )}
          </div>
          {atLimit && <p className="mt-2 text-xs text-dust">{t("full")}</p>}
        </div>
      </div>
    </div>
  );
}
