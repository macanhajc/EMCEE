"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import {
  getActivationMessageConfig,
  getActivityLogEvents,
  getAnchorSpotEnabled,
  getAntiSpamConfig,
  getAvatarAnchorPosition,
  getBotDangerZoneInfo,
  getBotTokenInfo,
  getDefaultOutfitConfig,
  getEmoteAllConfig,
  getEmoteOnSayConfig,
  getExemptionsConfig,
  getFarewellConfig,
  getFilterConfig,
  getGeneralConfig,
  getIdleEmoteLoopConfig,
  getLadderConfig,
  getListCommandConfig,
  getLoopConfig,
  getModCommandsConfig,
  getOutfitCloneConfig,
  getOutfitPresetsConfig,
  getReactionBackConfig,
  getRegularsList,
  getStatusLogData,
  getVipConfig,
  getWelcomeConfig,
  type ActivationMessageConfig,
  type AntiSpamConfig,
  type BotDangerZoneInfo,
  type BotTokenInfo,
  type DefaultOutfitConfig,
  type EmoteAllConfig,
  type EmoteOnSayConfig,
  type ExemptionsConfig,
  type FarewellConfig,
  type FilterConfig,
  type GeneralConfig,
  type IdleEmoteLoopConfig,
  type LadderConfig,
  type ListCommandConfig,
  type LoopConfig,
  type ModCommandsConfig,
  type ModerationEvent,
  type OutfitCloneConfig,
  type OutfitPresetsConfig,
  type ReactionBackConfig,
  type Regular,
  type StatusLogData,
  type VipConfig,
  type WelcomeConfig,
} from "@/app/[locale]/instances/[id]/actions";
import type { AvatarPosition } from "@/db/avatar-positions";
import type { botInstances, catalogBots, subscriptions } from "@/db/schema";
import type { RoomInfo } from "@/lib/highrise-webapi";

type Instance = typeof botInstances.$inferSelect;
type CatalogBot = typeof catalogBots.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

export interface HeaderData {
  instance: Instance;
  bot: CatalogBot | undefined;
  subscription: Subscription | null;
}

export interface NotificationsData {
  emailAlertsEnabled: boolean;
  browserAlertsEnabled: boolean;
}

/**
 * Everything the instance detail page (`/instances/[id]`) shows, in one
 * store — built to fix a real UX problem, not for its own sake: Radix's
 * `Tabs.Content` unmounts inactive panels by default, so with each card
 * owning its own `useState`/`useEffect` fetch (the shape every card on this
 * page had before 2026-07-24), switching tabs away and back destroyed every
 * card underneath and refetched from scratch — a reload + loading flash on
 * every revisit. See docs/decisions.md, 2026-07-24, "instance store."
 *
 * **One store instance per page render, not a module singleton.** This page
 * is server-rendered per request (it's a "use client" component, but Next.js
 * still renders it to HTML on the server first). A plain module-level
 * `create()` store would be a single JS object shared by every concurrent
 * request the server process handles — two different customers opening two
 * different instances at the same moment could read or overwrite each
 * other's data. `createStore` (the vanilla, non-hook API) plus a Context
 * provider (`InstanceStoreProvider`, created fresh via `useState` on every
 * component mount — one per request during SSR, one per browser tab on the
 * client) keeps each page's data isolated, the standard fix for this exact
 * class of bug in a server-rendered React app.
 *
 * Two different loading strategies for two different kinds of data:
 * - `header`/`notifications`/`roomInfo` are **seeded synchronously**, baked
 *   straight into the store's initial state from `page.tsx`'s existing
 *   server-side fetch (passed as `InstanceStoreProvider`'s `seed` prop) —
 *   that data was never subject to the tab-switch bug (it's not inside a
 *   tab), so there's no reason to lose today's fast first paint by
 *   re-fetching it client-side, and baking it into the initial state (rather
 *   than setting it in an effect) means it's already there in the very first
 *   render, server-side included — no loading flash on first load either.
 * - Every tab-card field is fetched once, eagerly, by `loadAll` — fired once
 *   from `index.tsx`'s mount effect (client-only; the tab-card data was
 *   never server-rendered either, before or after this change). Each write
 *   happens independently as its own request resolves (not blocked on the
 *   slowest one), so fast sections render before slow ones finish.
 *
 * Mutations don't route through here directly — every card's own hook still
 * owns its `useActionState`-driven save (native `<form>` wiring, pending
 * state, all unchanged), and just calls `setSection` on success instead of
 * writing to local state.
 */
interface InstanceStoreState {
  instanceId: string;

  header: HeaderData;
  notifications: NotificationsData;
  roomInfo: RoomInfo | null;

  emoteOnSay: EmoteOnSayConfig | null;
  emoteAll: EmoteAllConfig | null;
  listCommand: ListCommandConfig | null;
  loop: LoopConfig | null;

  activationMessage: ActivationMessageConfig | null;
  welcome: WelcomeConfig | null;
  vip: VipConfig | null;
  farewell: FarewellConfig | null;

  filter: FilterConfig | null;
  antiSpam: AntiSpamConfig | null;
  ladder: LadderConfig | null;
  exemptions: ExemptionsConfig | null;
  modCommands: ModCommandsConfig | null;

  anchorSpotEnabled: boolean | null;
  // undefined = not loaded yet, null = loaded and genuinely no position
  // saved — same tri-state use-avatar-anchor-position.ts already relied on.
  avatarPosition: AvatarPosition | null | undefined;
  idleEmoteLoop: IdleEmoteLoopConfig | null;
  reactionBack: ReactionBackConfig | null;
  defaultOutfit: DefaultOutfitConfig | null;
  outfitPresets: OutfitPresetsConfig | null;
  outfitClone: OutfitCloneConfig | null;

  general: GeneralConfig | null;
  botToken: BotTokenInfo | null;
  statusLog: StatusLogData | null;
  botDangerZone: BotDangerZoneInfo | null;

  regulars: Regular[] | null;
  activityLog: ModerationEvent[] | null;
}

type TabCardKey = keyof Omit<InstanceStoreState, "instanceId" | "header" | "notifications" | "roomInfo">;

const initialSections: Pick<InstanceStoreState, TabCardKey> = {
  emoteOnSay: null,
  emoteAll: null,
  listCommand: null,
  loop: null,
  activationMessage: null,
  welcome: null,
  vip: null,
  farewell: null,
  filter: null,
  antiSpam: null,
  ladder: null,
  exemptions: null,
  modCommands: null,
  anchorSpotEnabled: null,
  avatarPosition: undefined,
  idleEmoteLoop: null,
  reactionBack: null,
  defaultOutfit: null,
  outfitPresets: null,
  outfitClone: null,
  general: null,
  botToken: null,
  statusLog: null,
  botDangerZone: null,
  regulars: null,
  activityLog: null,
};

interface InstanceStoreActions {
  /** Replaces `header`/`notifications`/`roomInfo` with a fresh server fetch
   * (used after a header mutation succeeds, e.g. `setBotRunning`) and resets
   * every tab-card section back to "not loaded" if this is a different
   * instance than the store currently holds (client-side navigation from one
   * instance's page straight to another's), so stale data from the previous
   * instance can't flash before `loadAll` resolves. */
  reseedHeader(instanceId: string, header: HeaderData, notifications: NotificationsData, roomInfo: RoomInfo | null): void;
  /** Fires every tab-card query action in parallel; each writes its own
   * section as its own request resolves. */
  loadAll(instanceId: string): void;
  /** Used by every card's mutate-success handler instead of local
   * `setState`. */
  setSection<K extends TabCardKey>(key: K, value: InstanceStoreState[K]): void;
  /** Notifications card's two toggles write straight back here — the card
   * already knows the value it just submitted, no refetch needed. */
  setNotifications(notifications: NotificationsData): void;
}

type InstanceStore = InstanceStoreState & InstanceStoreActions;

export interface InstanceStoreSeed {
  instanceId: string;
  header: HeaderData;
  notifications: NotificationsData;
  roomInfo: RoomInfo | null;
}

function createInstanceStore(seed: InstanceStoreSeed): StoreApi<InstanceStore> {
  return createStore<InstanceStore>((set, get) => ({
    instanceId: seed.instanceId,
    header: seed.header,
    notifications: seed.notifications,
    roomInfo: seed.roomInfo,
    ...initialSections,

    reseedHeader(instanceId, header, notifications, roomInfo) {
      const isNewInstance = get().instanceId !== instanceId;
      set({
        instanceId,
        header,
        notifications,
        roomInfo,
        ...(isNewInstance ? initialSections : {}),
      });
    },

    loadAll(instanceId) {
      getEmoteOnSayConfig(instanceId).then((v) => set({ emoteOnSay: v }));
      getEmoteAllConfig(instanceId).then((v) => set({ emoteAll: v }));
      getListCommandConfig(instanceId).then((v) => set({ listCommand: v }));
      getLoopConfig(instanceId).then((v) => set({ loop: v }));

      getActivationMessageConfig(instanceId).then((v) => set({ activationMessage: v }));
      getWelcomeConfig(instanceId).then((v) => set({ welcome: v }));
      getVipConfig(instanceId).then((v) => set({ vip: v }));
      getFarewellConfig(instanceId).then((v) => set({ farewell: v }));

      getFilterConfig(instanceId).then((v) => set({ filter: v }));
      getAntiSpamConfig(instanceId).then((v) => set({ antiSpam: v }));
      getLadderConfig(instanceId).then((v) => set({ ladder: v }));
      getExemptionsConfig(instanceId).then((v) => set({ exemptions: v }));
      getModCommandsConfig(instanceId).then((v) => set({ modCommands: v }));

      getAnchorSpotEnabled(instanceId).then((v) => set({ anchorSpotEnabled: v }));
      getAvatarAnchorPosition(instanceId).then((v) => set({ avatarPosition: v }));
      getIdleEmoteLoopConfig(instanceId).then((v) => set({ idleEmoteLoop: v }));
      getReactionBackConfig(instanceId).then((v) => set({ reactionBack: v }));
      getDefaultOutfitConfig(instanceId).then((v) => set({ defaultOutfit: v }));
      getOutfitPresetsConfig(instanceId).then((v) => set({ outfitPresets: v }));
      getOutfitCloneConfig(instanceId).then((v) => set({ outfitClone: v }));

      getGeneralConfig(instanceId).then((v) => set({ general: v }));
      getBotTokenInfo(instanceId).then((v) => set({ botToken: v }));
      getStatusLogData(instanceId).then((v) => set({ statusLog: v }));
      getBotDangerZoneInfo(instanceId).then((v) => set({ botDangerZone: v }));

      getRegularsList(instanceId).then((v) => set({ regulars: v }));
      getActivityLogEvents(instanceId).then((v) => set({ activityLog: v }));
    },

    setSection(key, value) {
      set({ [key]: value } as Partial<InstanceStoreState>);
    },

    setNotifications(notifications) {
      set({ notifications });
    },
  }));
}

const InstanceStoreContext = createContext<StoreApi<InstanceStore> | null>(null);

/**
 * Wraps the instance detail page. Creates exactly one store per component
 * instance (`useState`'s initializer runs once per mount — once per request
 * during SSR, once per browser tab on the client) with `seed` baked
 * straight into its initial state, so the very first render already has
 * header/notifications/room-info data, no loading flash.
 */
export function InstanceStoreProvider({ seed, children }: { seed: InstanceStoreSeed; children: ReactNode }) {
  const [store] = useState(() => createInstanceStore(seed));
  return <InstanceStoreContext.Provider value={store}>{children}</InstanceStoreContext.Provider>;
}

function useInstanceStoreApi(): StoreApi<InstanceStore> {
  const store = useContext(InstanceStoreContext);
  if (!store) throw new Error("useInstanceStore must be used within InstanceStoreProvider");
  return store;
}

/** Reactive selector — re-renders the calling component when the selected
 * slice changes, same calling convention as a plain `create()` hook. */
export function useInstanceStore<T>(selector: (state: InstanceStore) => T): T {
  return useStore(useInstanceStoreApi(), selector);
}

/** Imperative access (`.getState()`/actions) for use outside render — e.g.
 * `index.tsx`'s mount effect firing `loadAll` once. */
export function useInstanceStoreImperative(): StoreApi<InstanceStore> {
  return useInstanceStoreApi();
}
