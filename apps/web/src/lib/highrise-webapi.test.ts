import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOutfitItemsByIds, getRoomInfo, getUserByUsername, searchOutfitItems } from "./highrise-webapi";

describe("getRoomInfo", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a successful response to RoomInfo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          room: {
            room_id: "abc123",
            disp_name: "The Lounge",
            description: "Chill vibes only",
            category: "chill",
            access_policy: "friends_only",
            owner_id: "usr_1",
            num_connected: 7,
          },
        }),
        { status: 200 },
      ),
    );

    await expect(getRoomInfo("abc123")).resolves.toEqual({
      name: "The Lounge",
      description: "Chill vibes only",
      category: "chill",
      accessPolicy: "friends_only",
      numConnected: 7,
    });
  });

  it("defaults numConnected and description when absent", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          room: {
            room_id: "abc123",
            disp_name: "The Lounge",
            category: "chill",
            access_policy: "public",
            owner_id: "usr_1",
          },
        }),
        { status: 200 },
      ),
    );

    const info = await getRoomInfo("abc123");
    expect(info?.numConnected).toBe(0);
    expect(info?.description).toBeNull();
  });

  it("returns null on a non-200 response (e.g. deleted room)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(getRoomInfo("gone")).resolves.toBeNull();
  });

  it("returns null instead of throwing on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    await expect(getRoomInfo("abc123")).resolves.toBeNull();
  });
});

describe("searchOutfitItems", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enriches list results with icons from the per-item detail endpoint", async () => {
    // Mirrors the real webapi: the list endpoint's items come back with
    // icon_url/image_url both null; only GET /items/{id} has the icon.
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/items?")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                item_id: "shirt-basic-tee",
                item_name: "Basic Tee",
                category: "shirt",
                rarity: "common",
                icon_url: null,
                image_url: null,
              },
            ],
            total: 1,
            first_id: "shirt-basic-tee",
            last_id: "shirt-basic-tee",
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/items/shirt-basic-tee")) {
        return new Response(
          JSON.stringify({
            item: {
              item_id: "shirt-basic-tee",
              item_name: "Basic Tee",
              category: "shirt",
              rarity: "common",
              icon_url: null,
              image_url: "https://cdn.example/full.png",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    await expect(searchOutfitItems("tee")).resolves.toEqual([
      {
        id: "shirt-basic-tee",
        name: "Basic Tee",
        category: "shirt",
        rarity: "common",
        iconUrl: "https://cdn.example/full.png",
      },
    ]);
  });

  it("falls back to the icon-less list result when a detail lookup fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/items?")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                item_id: "shirt-basic-tee",
                item_name: "Basic Tee",
                category: "shirt",
                rarity: "common",
                icon_url: null,
                image_url: null,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    await expect(searchOutfitItems("tee")).resolves.toEqual([
      {
        id: "shirt-basic-tee",
        name: "Basic Tee",
        category: "shirt",
        rarity: "common",
        iconUrl: null,
      },
    ]);
  });

  it("returns [] for a blank query without hitting the network", async () => {
    await expect(searchOutfitItems("   ")).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns [] on a non-200 response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(searchOutfitItems("tee")).resolves.toEqual([]);
  });

  it("returns [] instead of throwing on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    await expect(searchOutfitItems("tee")).resolves.toEqual([]);
  });
});

describe("getUserByUsername", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves via the singular /users/{username} endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: { user_id: "usr_123", username: "Troublemaker123" } }), { status: 200 }),
    );

    await expect(getUserByUsername("troublemaker123")).resolves.toEqual({
      userId: "usr_123",
      username: "Troublemaker123",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/troublemaker123"),
      expect.anything(),
    );
  });

  it("returns null on a 404 (Highrise's real 'User not found.' response)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("User not found.", { status: 404 }));
    await expect(getUserByUsername("nobody-by-this-name")).resolves.toBeNull();
  });

  it("returns null for a blank username without hitting the network", async () => {
    await expect(getUserByUsername("   ")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null on a non-200 response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(getUserByUsername("troublemaker123")).resolves.toBeNull();
  });

  it("returns null instead of throwing on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    await expect(getUserByUsername("troublemaker123")).resolves.toBeNull();
  });
});

describe("getOutfitItemsByIds", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves each id to its item info, keyed by id", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/items/shirt-basic-tee")) {
        return new Response(
          JSON.stringify({ item: { item_id: "shirt-basic-tee", item_name: "Basic Tee", rarity: "common" } }),
          { status: 200 },
        );
      }
      if (url.endsWith("/items/pants-denim")) {
        return new Response(
          JSON.stringify({ item: { item_id: "pants-denim", item_name: "Denim Pants", rarity: "uncommon" } }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const byId = await getOutfitItemsByIds(["shirt-basic-tee", "pants-denim"]);
    expect(byId["shirt-basic-tee"]?.name).toBe("Basic Tee");
    expect(byId["pants-denim"]?.name).toBe("Denim Pants");
  });

  it("skips ids Highrise no longer recognizes rather than throwing", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(getOutfitItemsByIds(["stale-id"])).resolves.toEqual({});
  });

  it("returns {} for an empty id list without hitting the network", async () => {
    await expect(getOutfitItemsByIds([])).resolves.toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
