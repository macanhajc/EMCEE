/**
 * Normalizes what gets pasted into the room-ID field. Highrise gives users a
 * share *link*, not a bare ID (.claude/skills/highrise/SKILL.md), and people
 * paste the whole URL out of habit. This is a heuristic — take the last
 * non-empty path segment when the input looks like a URL — not a parser
 * pinned to a confirmed share-link format; verify against a real link
 * before relying on it for anything beyond convenience.
 */
export function normalizeRoomId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes("://")) return trimmed;
  try {
    const segments = new URL(trimmed).pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? trimmed;
  } catch {
    return trimmed;
  }
}
