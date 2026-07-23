"use client";

import { Plus, Shirt, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ConfigActionState } from "@/app/[locale]/instances/[id]/actions";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import { EMOTE_CATALOG } from "@/lib/emote-catalog";
import { BOT_ROADMAP } from "@/lib/roadmap";
import type { OutfitItemInfo } from "@/lib/highrise-webapi";
import type { FieldSpec, SectionSpec } from "@/lib/schema-form";
import { StatusLog } from "./status-log";
import { BotTokenUpdate } from "./bot-token-update";
import { BotDangerZone } from "./bot-danger-zone";
import { RegularsTable } from "./regulars-table";
import { BanByUsername } from "./ban-by-username";
import { ActivityLog } from "./activity-log";

const RARITY_COLORS: Record<string, string> = {
  common: "text-dust",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-violet-400",
  legendary: "text-amber-400",
  none_: "text-dust/60",
};

const fieldControlClass =
  "border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30";

// Stored config values are only ever present once something has actually
// saved that key — an untouched section (a new field added to the schema
// after an instance's config was last written, or a section nobody has
// opened yet) leaves it `undefined`. Falling back to the schema's own
// `default` here, rather than to `false`, keeps a true-by-default toggle
// (e.g. Avatar's `position.enabled`) rendering checked until an owner
// actually flips it — otherwise it renders unchecked, and the next
// unrelated config save silently writes that wrong `false` in for good.
function resolvedBoolean(value: unknown, fieldDefault: unknown): boolean {
  return typeof value === "boolean" ? value : Boolean(fieldDefault);
}

/** Surfaces a `useActionState` result as a toast — `errors.${code}` if a
 * translation exists for it, else the raw code/message the action returned
 * (matches the fallback the old `?error=` query-param banner used). */
function toastActionResult(state: ConfigActionState, tInstance: ReturnType<typeof useTranslations>): void {
  if (state.ok) {
    toast.success(tInstance("savedMessage"));
    return;
  }
  toast.error(tInstance.has(`errors.${state.error}`) ? tInstance(`errors.${state.error}`) : state.error);
}

// id of the standalone <form> (rendered outside the main config form, see
// InstanceConfig below) that the position editor's fields submit to via the
// HTML `form=` attribute — they live inside the "Anchor spot" SectionCard's
// markup but must NOT be nested in the config <form>, since coordinates are
// deliberately kept out of the JSON config (specs/bots/avatar.md).
const POSITION_FORM_ID = "avatar-position-form";

export interface AvatarPositionValue {
  x: number;
  y: number;
  z: number;
  facing: string;
}

/**
 * The "set from the dashboard" half of the Anchor spot card — a manual
 * x/y/z/facing editor, alongside the existing in-game "say anchor" flow.
 * Submits to its own `<form id={POSITION_FORM_ID}>` (rendered as a sibling
 * of the main config form, see InstanceConfig) via the `form` attribute on
 * each control, rather than the shared config form — its target is a
 * dedicated server action that writes straight to `avatar_positions`, not
 * the config save path.
 */
function PositionEditor({
  position,
}: {
  position: AvatarPositionValue | null;
}) {
  const t = useTranslations("instanceDetail.config");
  const FACING_VALUES = [
    "FrontRight",
    "FrontLeft",
    "BackRight",
    "BackLeft",
  ] as const;

  return (
    <div className="grid gap-3">
      <div>
        <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
          {t("position.fromDashboard")}
        </p>
        <p className="mt-1 text-xs text-dust">
          {position
            ? t("position.withPosition")
            : t("position.withoutPosition")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="avatar-position-x" className="text-dust">
            {t("position.x")}
          </Label>
          <Input
            id="avatar-position-x"
            form={POSITION_FORM_ID}
            name="x"
            type="number"
            step="any"
            required
            defaultValue={position?.x}
            className={`h-10 ${fieldControlClass}`}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="avatar-position-y" className="text-dust">
            {t("position.y")}
          </Label>
          <Input
            id="avatar-position-y"
            form={POSITION_FORM_ID}
            name="y"
            type="number"
            step="any"
            required
            defaultValue={position?.y}
            className={`h-10 ${fieldControlClass}`}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="avatar-position-z" className="text-dust">
            {t("position.z")}
          </Label>
          <Input
            id="avatar-position-z"
            form={POSITION_FORM_ID}
            name="z"
            type="number"
            step="any"
            required
            defaultValue={position?.z}
            className={`h-10 ${fieldControlClass}`}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="avatar-position-facing" className="text-dust">
            {t("position.facing")}
          </Label>
          <select
            id="avatar-position-facing"
            form={POSITION_FORM_ID}
            name="facing"
            defaultValue={position?.facing ?? "FrontRight"}
            className={`h-10 rounded-lg border px-3 text-sm focus-visible:outline-none ${fieldControlClass}`}
          >
            {FACING_VALUES.map((value) => (
              <option key={value} value={value} className="bg-ink">
                {t(`facingLabels.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button
        type="submit"
        form={POSITION_FORM_ID}
        variant="outline"
        className="h-9 justify-self-start cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
      >
        {t("position.save")}
      </Button>
    </div>
  );
}

/**
 * Comma-delimited tag input for "string-array" fields. Keeps the wire
 * format schema-form.ts already parses (newline-joined single form value)
 * so nothing server-side has to change — only the typing UX does.
 */
function TagListInput({
  id,
  name,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
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
      <input type="hidden" name={name} value={tags.join("\n")} readOnly />
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

/**
 * Every catalog emote as a toggle chip — available (default) or blocked.
 * Submits the same wire format `disabled_emotes` already parses (a single
 * newline-joined form value), so only the *editor* for this field changed,
 * not the schema or the parser.
 */
function EmotePicker({
  id,
  name,
  defaultValue,
}: {
  id: string;
  name: string;
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
                  ? "rounded-full border border-dashed border-paper/15 px-2.5 py-1 text-xs text-dust/50 line-through"
                  : "rounded-full border border-transparent bg-paper/10 px-2.5 py-1 text-xs text-paper hover:bg-paper/20"
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

/**
 * Single-emote `<select>` for `idle_emote.emote_id` — reuses `EMOTE_CATALOG`
 * so the owner picks a friendly name instead of typing the raw internal id
 * blind, the same reason `EmotePicker` above exists for `disabled_emotes`.
 */
function EmoteSelect({
  id,
  name,
  defaultValue,
}: {
  id: string;
  name: string;
  defaultValue: string;
}) {
  const t = useTranslations("instanceDetail.config.emotePicker");
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
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

/**
 * Debounced catalog search, shared by `OutfitPicker` (single loadout) and
 * `PresetRow` (one search per named preset) — same 300ms debounce and
 * stale-response guard (`requestIdRef`) either would otherwise duplicate.
 */
function useOutfitSearch(
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
function placeholderOutfitItem(itemId: string): OutfitItemInfo {
  return {
    id: itemId,
    name: itemId,
    category: null,
    rarity: "none_",
    iconUrl: null,
  };
}

/** One item tile, shared by both the search results and the equipped grid. */
function OutfitItemTile({
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

/**
 * `default_outfit.item_ids` editor — a two-column "search the catalog, build
 * the loadout" layout instead of a raw id textarea. Left column searches
 * Highrise's public item catalog live (`onSearch`, debounced); clicking a
 * result moves it into the right column, styled like a game inventory
 * (icon + name + rarity-colored category), which is also this dashboard's
 * only visual stand-in for "what the bot is wearing" — there's no API that
 * returns a single composited avatar image (checked directly against the
 * pinned SDK source), only per-item icons, so a real body render isn't on
 * the table here.
 */
function OutfitPicker({
  id,
  name,
  defaultValue,
  maxItems,
  resolved,
  onSearch,
}: {
  id: string;
  name: string;
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
 * workers/runtime/catalog/avatar.py) — only the editor changed.
 */
function PresetEditor({
  id,
  name,
  defaultValue,
  maxItems,
  resolved,
  onSearch,
}: {
  id: string;
  name: string;
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
      <input type="hidden" id={id} name={name} value={serialized} readOnly />
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

function ConfigField({
  field,
  name,
  value,
  onCheckedChange,
  outfitItems,
  onSearchOutfitItems,
}: {
  field: FieldSpec;
  name: string;
  value: unknown;
  onCheckedChange?: (checked: boolean) => void;
  outfitItems?: Record<string, OutfitItemInfo>;
  onSearchOutfitItems?: (query: string) => Promise<OutfitItemInfo[]>;
}) {
  const t = useTranslations("instanceDetail.config");

  if (field.kind === "boolean") {
    return (
      <div className="flex items-start gap-3">
        <Checkbox
          id={name}
          name={name}
          defaultChecked={resolvedBoolean(value, field.default)}
          onCheckedChange={(checked) => onCheckedChange?.(checked === true)}
          className="mt-0.5 border-paper/30 cursor-pointer data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
        />
        <div>
          <Label htmlFor={name} className="font-normal leading-5 text-paper">
            {field.title}
          </Label>
          {field.description && (
            <p className="mt-1 text-xs text-dust">{field.description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={name} className="text-dust">
        {field.title}
      </Label>

      {field.kind === "integer" && (
        <Input
          id={name}
          name={name}
          type="number"
          min={field.minimum}
          max={field.maximum}
          defaultValue={typeof value === "number" ? value : undefined}
          className={`h-10 max-w-40 ${fieldControlClass}`}
        />
      )}

      {field.kind === "enum" && (
        <select
          id={name}
          name={name}
          defaultValue={typeof value === "string" ? value : ""}
          className={`h-10 max-w-xs rounded-lg border px-3 text-sm focus-visible:outline-none ${fieldControlClass}`}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt} className="bg-ink">
              {t.has(`enumLabels.${opt}`) ? t(`enumLabels.${opt}`) : opt}
            </option>
          ))}
        </select>
      )}

      {field.kind === "string" && field.key === "emote_id" && (
        <EmoteSelect
          id={name}
          name={name}
          defaultValue={typeof value === "string" ? value : ""}
        />
      )}

      {field.kind === "string" && field.key !== "emote_id" && (
        <Input
          id={name}
          name={name}
          type="text"
          defaultValue={typeof value === "string" ? value : ""}
          maxLength={field.maxLength}
          className={`h-10 ${fieldControlClass}`}
        />
      )}

      {field.kind === "string-array" && field.key === "disabled_emotes" && (
        <EmotePicker
          id={name}
          name={name}
          defaultValue={
            Array.isArray(value)
              ? value.filter((v) => typeof v === "string")
              : []
          }
        />
      )}

      {field.kind === "string-array" &&
        field.key === "presets" &&
        onSearchOutfitItems && (
          <PresetEditor
            id={name}
            name={name}
            defaultValue={
              Array.isArray(value)
                ? value.filter((v) => typeof v === "string")
                : []
            }
            maxItems={field.maxItems}
            resolved={outfitItems ?? {}}
            onSearch={onSearchOutfitItems}
          />
        )}

      {field.kind === "string-array" &&
        field.key === "item_ids" &&
        onSearchOutfitItems && (
          <OutfitPicker
            id={name}
            name={name}
            defaultValue={
              Array.isArray(value)
                ? value.filter((v) => typeof v === "string")
                : []
            }
            maxItems={field.maxItems}
            resolved={outfitItems ?? {}}
            onSearch={onSearchOutfitItems}
          />
        )}

      {field.kind === "string-array" &&
        field.key !== "disabled_emotes" &&
        field.key !== "presets" &&
        field.key !== "item_ids" && (
          <TagListInput
            id={name}
            name={name}
            defaultValue={
              Array.isArray(value)
                ? value.filter((v) => typeof v === "string")
                : []
            }
            placeholder={t("tagListPlaceholder")}
          />
        )}

      {field.description && (
        <p className="text-xs text-dust">{field.description}</p>
      )}
    </div>
  );
}

/**
 * One section's card. Most sections lead with an "enabled" toggle (see
 * packages/schemas/emcee/v1.json) — the rest of the section's fields
 * are noise while it's off, so they stay hidden (not unmounted, so a value
 * typed in before flipping the toggle off still round-trips on save) until
 * it's checked. A section without one (e.g. "farewell", which uses
 * `log_enabled` instead) just shows all its fields at once.
 *
 * Independently, a field can declare `enabledBy: "<siblingKey>"` (schema's
 * `x-enabled-by`) to hide itself while that other boolean sibling — not
 * necessarily the section's own "enabled" — is unchecked (e.g. quiet-hours
 * start/end/tz only matter once "Enable quiet hours" is on). Same
 * hidden-not-unmounted rule applies, for the same round-trip reason.
 */
function SectionCard({
  section,
  config,
  extra,
  otherFieldsHeading,
  outfitItems,
  onSearchOutfitItems,
}: {
  section: SectionSpec;
  config: Record<string, unknown>;
  extra?: React.ReactNode;
  otherFieldsHeading?: string;
  outfitItems?: Record<string, OutfitItemInfo>;
  onSearchOutfitItems?: (query: string) => Promise<OutfitItemInfo[]>;
}) {
  const enabledField = section.fields.find(
    (f): f is Extract<FieldSpec, { kind: "boolean" }> =>
      f.kind === "boolean" && f.key === "enabled",
  );
  // A stored config that's missing this key entirely (an instance saved
  // before this field/section existed, or before any save touched it) must
  // fall back to the schema's own default, not to `false` — otherwise the
  // checkbox renders unchecked against a true default, and the next
  // unrelated config save silently persists that wrong `false` for good.
  const [enabled, setEnabled] = useState(() =>
    enabledField ? resolvedBoolean(config.enabled, enabledField.default) : true,
  );
  const otherFields = section.fields.filter((f) => f !== enabledField);

  const gateKeys = useMemo(
    () =>
      new Set(
        otherFields
          .map((f) => f.enabledBy)
          .filter((k): k is string => Boolean(k)),
      ),
    [otherFields],
  );
  const [gates, setGates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      otherFields
        .filter((f) => gateKeys.has(f.key))
        .map((f) => [f.key, resolvedBoolean(config[f.key], f.default)]),
    ),
  );

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h3 className="font-display text-base text-paper">{section.title}</h3>
      {section.description && (
        <p className="mt-1 text-sm text-dust">{section.description}</p>
      )}
      <div className="mt-5 grid gap-5">
        {enabledField && (
          <ConfigField
            field={enabledField}
            name={`${section.key}.enabled`}
            value={config.enabled}
            onCheckedChange={setEnabled}
          />
        )}
        {(otherFields.length > 0 || extra) && (
          <div
            className={`grid gap-5 ${enabledField ? "border-t border-paper/10 pt-5" : ""} ${enabled ? "" : "hidden"}`}
          >
            {otherFields.length > 0 && (
              <div className="grid gap-5">
                {otherFieldsHeading && (
                  <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
                    {otherFieldsHeading}
                  </p>
                )}
                {otherFields.map((field) => {
                  const visible = field.enabledBy
                    ? (gates[field.enabledBy] ?? false)
                    : true;
                  return (
                    <div key={field.key} className={visible ? "" : "hidden"}>
                      <ConfigField
                        field={field}
                        name={`${section.key}.${field.key}`}
                        value={config[field.key]}
                        onCheckedChange={
                          gateKeys.has(field.key)
                            ? (checked) =>
                                setGates((prev) => ({
                                  ...prev,
                                  [field.key]: checked,
                                }))
                            : undefined
                        }
                        outfitItems={outfitItems}
                        onSearchOutfitItems={onSearchOutfitItems}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {extra && (
              <div
                className={
                  otherFields.length > 0 ? "border-t border-paper/10 pt-5" : ""
                }
              >
                {extra}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Live modules, in display order. Keyed by each section's "x-module" tag
// (packages/schemas/emcee/v1.json) — add an entry here when a module goes
// from BOT_ROADMAP ("coming soon", disabled tab) to a real schema section.
// Labels come from the `bot.features` namespace (see /messages) — same
// keys as BOT_FEATURES in lib/roadmap.ts, so the tab name always matches
// what the landing page and /instances/new call the same skill.
const LIVE_MODULES = [
  { key: "emote" },
  { key: "concierge" },
  { key: "warden" },
  { key: "avatar" },
];

// Not a config module — a read-only log, so it gets its own tab key outside
// LIVE_MODULES (no section/form fields) and BOT_ROADMAP (not a placeholder).
// Kept last in the tab order, after every module and roadmap tab, so its
// different nature (view, not configure) reads visually rather than blending
// in with the rest.
const STATUS_TAB_KEY = "status";
const ACTIVITY_TAB_KEY = "activity";

/**
 * Module-tabbed config UI, one shared `<form>` for every module. The tab
 * switcher only toggles which module's fields are *visible* (a plain
 * Tailwind `hidden` class, same "hidden not unmounted" approach SectionCard
 * already uses one level down) — never which are *mounted*. Radix's
 * TabsContent unmounts inactive panels by default, which would silently
 * drop that module's fields from the FormData on submit and wipe its saved
 * config; that's why module content isn't rendered inside TabsContent here.
 * Adding a module is "add a schema section + a LIVE_MODULES entry," not
 * "redesign this screen."
 */
export function InstanceConfig({
  sections,
  config,
  action,
  avatarPosition,
  onSavePosition,
  outfitItems,
  onSearchOutfitItems,
  operationalEvents,
  instanceId,
  status,
  errorKind,
  tokenLast4,
  replaceToken,
  roomId,
  replaceRoomId,
  isSubscribed,
  openBillingPortal,
  deleteInstance,
  botName,
  regulars,
  moderationEvents,
  requestModeration,
}: {
  sections: SectionSpec[];
  config: Record<string, Record<string, unknown>>;
  action: (prevState: ConfigActionState | null, formData: FormData) => Promise<ConfigActionState>;
  avatarPosition: AvatarPositionValue | null;
  onSavePosition: (prevState: ConfigActionState | null, formData: FormData) => Promise<ConfigActionState>;
  outfitItems: Record<string, OutfitItemInfo>;
  onSearchOutfitItems: (query: string) => Promise<OutfitItemInfo[]>;
  operationalEvents: React.ComponentProps<typeof StatusLog>["events"];
  instanceId: React.ComponentProps<typeof StatusLog>["instanceId"];
  status: React.ComponentProps<typeof StatusLog>["status"];
  errorKind: React.ComponentProps<typeof StatusLog>["errorKind"];
  tokenLast4: string;
  replaceToken: (formData: FormData) => Promise<void>;
  roomId: string;
  replaceRoomId: (formData: FormData) => Promise<void>;
  isSubscribed: boolean;
  openBillingPortal: () => void;
  deleteInstance: (formData: FormData) => Promise<void>;
  botName: string;
  regulars: React.ComponentProps<typeof RegularsTable>["regulars"];
  moderationEvents: React.ComponentProps<typeof ActivityLog>["events"];
  requestModeration: (formData: FormData) => Promise<void>;
}) {
  const [activeModule, setActiveModule] = useState(LIVE_MODULES[0].key);
  const t = useTranslations("instanceDetail.config");
  const tBot = useTranslations("bot");
  const tInstance = useTranslations("instanceDetail");

  // Both forms below report success/error through `useActionState` instead
  // of the server action redirecting — a redirect remounts the page and
  // resets `activeModule` back to the first tab, which is exactly the
  // "why did I get bounced out of Avatar" bug this was built to avoid.
  const [configState, configFormAction] = useActionState(action, null);
  const [positionState, positionFormAction] = useActionState(onSavePosition, null);

  useEffect(() => {
    if (configState) toastActionResult(configState, tInstance);
    // Only `configState`'s identity should trigger a toast — `tInstance` is
    // a fresh function every render and would otherwise refire this on any
    // unrelated re-render (e.g. switching tabs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configState]);

  useEffect(() => {
    if (positionState) toastActionResult(positionState, tInstance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionState]);

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl text-paper">{t("heading")}</h2>

      <Tabs
        value={activeModule}
        onValueChange={setActiveModule}
        className="mt-4 gap-5 relative"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-0">
          {LIVE_MODULES.map((mod) => (
            <TabsTrigger
              key={mod.key}
              value={mod.key}
              className="rounded-full border cursor-pointer border-paper/15 bg-transparent px-4 py-1.5 text-dust data-active:border-marquee data-active:bg-marquee data-active:text-ink data-active:shadow-none"
            >
              {tBot(`features.${mod.key}.name`)}
            </TabsTrigger>
          ))}

          {BOT_ROADMAP.map((mod) => (
            <TabsTrigger
              key={mod.key}
              value={mod.key}
              disabled
              className="rounded-full border border-dashed border-paper/10 bg-transparent px-4 py-1.5 text-dust/50"
            >
              {tBot(`roadmap.${mod.key}.name`)}
              <span className="font-ui-mono text-[9px] tracking-wide text-dust/50 uppercase">
                {t("soon")}
              </span>
            </TabsTrigger>
          ))}

          <div className="flex gap-1.5">
            <div className="border-r h-8 ml-4 mr-3 border-paper/10" />

            <TabsTrigger
              value={ACTIVITY_TAB_KEY}
              className="rounded-full border cursor-pointer border-paper/15 bg-transparent px-4 py-1.5 text-dust data-active:border-marquee data-active:bg-marquee data-active:text-ink data-active:shadow-none"
            >
              {t("activityTab")}
            </TabsTrigger>

            <TabsTrigger
              value={STATUS_TAB_KEY}
              className="rounded-full border cursor-pointer border-paper/15 bg-transparent px-4 py-1.5 text-dust data-active:border-marquee data-active:bg-marquee data-active:text-ink data-active:shadow-none"
            >
              {t("settingsTab")}
            </TabsTrigger>
          </div>
        </TabsList>

        {BOT_ROADMAP.map((mod) => (
          <TabsContent key={mod.key} value={mod.key}>
            <div className="rounded-2xl border border-dashed border-paper/15 bg-transparent p-8 text-center">
              <p className="font-ui-mono text-[11px] tracking-[0.15em] text-marquee uppercase">
                {tBot(`roadmap.${mod.key}.role`)}
              </p>
              <p className="mt-2 font-display text-lg text-paper">
                {t("comingSoon", { name: tBot(`roadmap.${mod.key}.name`) })}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-dust">
                {tBot(`roadmap.${mod.key}.body`)}
              </p>
            </div>
          </TabsContent>
        ))}

        <TabsContent value={ACTIVITY_TAB_KEY} className="flex flex-col gap-6">
          <RegularsTable regulars={regulars} requestModeration={requestModeration} />

          <BanByUsername requestModeration={requestModeration} />

          <ActivityLog events={moderationEvents} />
        </TabsContent>

        <TabsContent value={STATUS_TAB_KEY} className="flex flex-col gap-6">
          <BotTokenUpdate
            tokenLast4={tokenLast4}
            replaceToken={replaceToken}
            roomId={roomId}
            replaceRoomId={replaceRoomId}
          />

          <StatusLog
            events={operationalEvents}
            instanceId={instanceId}
            botName={botName}
            roomId={roomId}
            status={status}
            errorKind={errorKind}
          />

          <BotDangerZone
            isSubscribed={isSubscribed}
            openBillingPortal={openBillingPortal}
            deleteInstance={deleteInstance}
            name={botName}
          />
        </TabsContent>
      </Tabs>

      <form action={configFormAction} className="mt-5 grid gap-6">
        {LIVE_MODULES.map((mod) => (
          <div
            key={mod.key}
            className={`grid gap-6 ${activeModule === mod.key ? "" : "hidden"}`}
          >
            {sections
              .filter((section) => section.module === mod.key)
              .map((section) => (
                <SectionCard
                  key={section.key}
                  section={section}
                  config={config[section.key] ?? {}}
                  otherFieldsHeading={
                    mod.key === "avatar" && section.key === "position"
                      ? t("inGameHeading")
                      : undefined
                  }
                  extra={
                    mod.key === "avatar" && section.key === "position" ? (
                      <PositionEditor position={avatarPosition} />
                    ) : undefined
                  }
                  outfitItems={outfitItems}
                  onSearchOutfitItems={onSearchOutfitItems}
                />
              ))}
          </div>
        ))}

        {!!(activeModule !== STATUS_TAB_KEY) && !!(activeModule !== ACTIVITY_TAB_KEY) && (
          <Button
            type="submit"
            className="h-11 justify-self-start cursor-pointer bg-marquee px-8 text-ink hover:bg-marquee/85"
          >
            {t("saveChanges")}
          </Button>
        )}
      </form>

      {/* Not nested inside the config <form> above — the position editor's
          fields target this one via the HTML `form=` attribute instead
          (see POSITION_FORM_ID), since a dashboard-set anchor spot writes
          straight to `avatar_positions`, not the JSON config. */}
      <form id={POSITION_FORM_ID} action={positionFormAction} />
    </div>
  );
}
