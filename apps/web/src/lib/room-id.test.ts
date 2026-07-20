import { describe, expect, it } from "vitest";
import { normalizeRoomId } from "./room-id";

describe("normalizeRoomId", () => {
  it("passes through a bare room id unchanged", () => {
    expect(normalizeRoomId("abc123def456")).toBe("abc123def456");
  });

  it("trims whitespace", () => {
    expect(normalizeRoomId("  abc123def456\n")).toBe("abc123def456");
  });

  it("extracts the last path segment from a share link", () => {
    expect(normalizeRoomId("https://highrise.game/room/abc123def456")).toBe("abc123def456");
  });

  it("extracts the last segment even with a trailing slash", () => {
    expect(normalizeRoomId("https://highrise.game/room/abc123def456/")).toBe("abc123def456");
  });

  it("falls back to the raw input for an unparseable URL-looking string", () => {
    expect(normalizeRoomId("http://")).toBe("http://");
  });
});
