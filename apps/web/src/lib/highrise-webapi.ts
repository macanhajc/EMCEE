/**
 * Highrise's public `webapi` (`GET /rooms/{room_id}`) — unauthenticated, no
 * bot token needed (confirmed by reading `highrise-bot-sdk`'s webapi.py,
 * which sends no auth header for this endpoint). Same env var name as the
 * SDK's own `HR_WEBAPI_URL` so a local fake server can be pointed at from
 * either plane.
 */
import "server-only";

export interface RoomInfo {
  name: string;
  description: string | null;
  category: string;
  accessPolicy: string;
  numConnected: number;
}

export interface OutfitItemInfo {
  id: string;
  name: string;
  category: string | null;
  rarity: string;
  iconUrl: string | null;
}

const WEBAPI_URL = process.env.HR_WEBAPI_URL ?? "https://webapi.highrise.game";

function toOutfitItemInfo(raw: unknown): OutfitItemInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.item_id !== "string") return null;
  return {
    id: item.item_id,
    name: typeof item.item_name === "string" ? item.item_name : item.item_id,
    category: typeof item.category === "string" ? item.category : null,
    rarity: typeof item.rarity === "string" ? item.rarity : "none_",
    iconUrl:
      typeof item.icon_url === "string"
        ? item.icon_url
        : typeof item.image_url === "string"
          ? item.image_url
          : null,
  };
}

/**
 * Best-effort: a deleted room, a bad room_id, or a Highrise outage must
 * never break the instance page — failures resolve to null, not a throw.
 */
export async function getRoomInfo(roomId: string): Promise<RoomInfo | null> {
  try {
    const res = await fetch(`${WEBAPI_URL}/rooms/${encodeURIComponent(roomId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const { room } = await res.json();
    if (!room || typeof room !== "object") return null;

    return {
      name: room.disp_name,
      description: room.description ?? null,
      category: room.category,
      accessPolicy: room.access_policy,
      numConnected: room.num_connected ?? 0,
    };
  } catch (err) {
    console.error("[highrise webapi] get_room failed", err);
    return null;
  }
}

/**
 * `GET /items?item_name=...` — public catalog search, no bot token needed.
 * Backs the default-outfit picker's search column. Best-effort: an empty
 * query, a Highrise outage, or a bad response all resolve to `[]` rather
 * than throwing, same posture as `getRoomInfo`.
 */
export async function searchOutfitItems(query: string, limit = 24): Promise<OutfitItemInfo[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const params = new URLSearchParams({ item_name: trimmed, limit: String(limit) });
    const res = await fetch(`${WEBAPI_URL}/items?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const body = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    return items.map(toOutfitItemInfo).filter((i: OutfitItemInfo | null): i is OutfitItemInfo => i !== null);
  } catch (err) {
    console.error("[highrise webapi] search items failed", err);
    return [];
  }
}

/**
 * Resolves already-saved default-outfit item ids to display info (name +
 * icon) so the dashboard doesn't just show raw ids. One `GET /items/{id}`
 * per id — the public webapi has no batch-by-ids endpoint (only
 * `item_name`/`category`/`rarity` filters on the list endpoint, see
 * `webapi.py`'s `get_items`). `default_outfit.item_ids` caps at 40, and this
 * only runs on page load, not a hot path — same tradeoff `avatar.py`'s
 * per-candidate `get_item` calls already accept for outfit clone.
 */
export async function getOutfitItemsByIds(ids: string[]): Promise<Record<string, OutfitItemInfo>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};

  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${WEBAPI_URL}/items/${encodeURIComponent(id)}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const body = await res.json();
        return toOutfitItemInfo(body?.item);
      } catch (err) {
        console.error("[highrise webapi] get_item failed", err);
        return null;
      }
    }),
  );

  const byId: Record<string, OutfitItemInfo> = {};
  for (const item of results) if (item) byId[item.id] = item;
  return byId;
}
