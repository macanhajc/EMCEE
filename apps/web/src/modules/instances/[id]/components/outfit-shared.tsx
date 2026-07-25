"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Shirt, X } from "lucide-react";
import type { OutfitItemInfo } from "@/lib/highrise-webapi";

export const RARITY_COLORS: Record<string, string> = {
  common: "text-dust",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-violet-400",
  legendary: "text-amber-400",
  none_: "text-dust/60",
};

/**
 * Debounced catalog search, shared by `OutfitPicker` (default-outfit-card.tsx,
 * single loadout) and `PresetRow` (instance-config.tsx, one search per named
 * preset) — same 300ms debounce and stale-response guard (`requestIdRef`)
 * either would otherwise duplicate.
 */
export function useOutfitSearch(
  onSearch: (query: string) => Promise<OutfitItemInfo[]>,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OutfitItemInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const requestId = ++requestIdRef.current;
    const handle = setTimeout(() => {
      if (!q) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      onSearch(q)
        .then((items) => {
          if (requestIdRef.current === requestId) setResults(items);
        })
        .catch(() => {
          if (requestIdRef.current === requestId) setResults([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [query, onSearch]);

  return { query, setQuery, results, searching };
}

/**
 * A saved item id that isn't in a `resolved` map yet (not yet fetched from
 * the Highrise catalog, e.g. right after page load) still needs to render as
 * *something* — falls back to showing the raw id as its own name.
 */
export function placeholderOutfitItem(itemId: string): OutfitItemInfo {
  return {
    id: itemId,
    name: itemId,
    category: null,
    rarity: "none_",
    iconUrl: null,
  };
}

/** One item tile, shared by both the search results and the equipped grid. */
export function OutfitItemTile({
  item,
  onClick,
  disabled,
  removable,
}: {
  item: OutfitItemInfo;
  onClick?: () => void;
  disabled?: boolean;
  removable?: boolean;
}) {
  const t = useTranslations("instanceDetail.config.outfitPicker");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={item.name}
      className={`group relative flex flex-col items-center gap-1 rounded-lg border p-2 text-center ${
        disabled
          ? "cursor-default border-paper/5 bg-paper/[0.03] opacity-50"
          : "cursor-pointer border-paper/10 bg-paper/5 hover:border-marquee/50 hover:bg-paper/10"
      }`}
    >
      {removable && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-ink p-0.5 text-dust group-hover:text-paper">
          <X className="size-3" />
        </span>
      )}
      {item.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Highrise CDN icon, unknown host set
        <img
          src={item.iconUrl}
          alt=""
          loading="lazy"
          className="size-10 rounded bg-ink/40 object-contain"
        />
      ) : (
        <div className="flex size-10 items-center justify-center rounded bg-ink/40 text-dust">
          <Shirt className="size-5" aria-hidden />
        </div>
      )}
      <span className="line-clamp-2 text-[10px] leading-tight text-paper">
        {item.name}
      </span>
      <span
        className={`text-[9px] uppercase ${RARITY_COLORS[item.rarity] ?? "text-dust"}`}
      >
        {item.category ?? t("itemFallback")}
      </span>
    </button>
  );
}
