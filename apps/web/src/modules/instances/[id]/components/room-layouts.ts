/** Highrise's fixed room-layout presets (the room-creation picker) — a
 * room's floor plan is always one of these, never an arbitrary size, so the
 * Anchor spot preview (room-layout-preview.tsx) needs the bot owner to say
 * which one their room uses rather than guessing bounds. `width`/`depth` are
 * the tile-grid extent along the room's X/Z axes; ROOM_MASKS masks out tiles
 * that aren't part of the floor for the three irregular presets (Jagged,
 * Zigzag, Cross) — built by the generators below so every mask's row/column
 * count is guaranteed to match its layout's declared `depth`/`width` rather
 * than relying on hand-typed literals staying in sync. The shapes themselves
 * are a stylized approximation eyeballed off the reference icons, not a
 * verified tile-for-tile export from Highrise — good enough to orient a
 * click-to-place preview, not to be trusted as exact.
 */

export type RoomLayoutId =
  | "8x8"
  | "10x10"
  | "15x15"
  | "16x18_jagged"
  | "18x16_zigzag"
  | "18x18_cross"
  | "18x30"
  | "20x20";

export interface RoomLayout {
  id: RoomLayoutId;
  label: string;
  width: number;
  depth: number;
}

export const ROOM_LAYOUTS: RoomLayout[] = [
  { id: "8x8", label: "8×8", width: 8, depth: 8 },
  { id: "10x10", label: "10×10", width: 10, depth: 10 },
  { id: "15x15", label: "15×15", width: 15, depth: 15 },
  { id: "16x18_jagged", label: "16×18 Jagged", width: 16, depth: 18 },
  { id: "18x16_zigzag", label: "18×16 Zigzag", width: 18, depth: 16 },
  { id: "18x18_cross", label: "18×18 Cross", width: 18, depth: 18 },
  { id: "18x30", label: "18×30", width: 18, depth: 30 },
  { id: "20x20", label: "20×20", width: 20, depth: 20 },
];

/** A plain rectangular floor — every tile active. */
function rectMask(width: number, depth: number): number[][] {
  return Array.from({ length: depth }, () => Array<number>(width).fill(1));
}

/** Two overlapping rectangles, one anchored top-left and one bottom-right —
 * the diagonal "staircase" floor plan. */
function zigzagMask(width: number, depth: number): number[][] {
  const half = Math.ceil(depth / 2);
  const split = Math.round((width * 2) / 3);
  return Array.from({ length: depth }, (_, row) =>
    Array.from({ length: width }, (_, col) =>
      row < half ? (col < split ? 1 : 0) : (col >= width - split ? 1 : 0),
    ),
  );
}

/** A plus sign: a full-width horizontal bar crossing a full-depth vertical
 * arm, each spanning the middle third of its axis. */
function crossMask(width: number, depth: number): number[][] {
  const armWidth = Math.round(width / 3);
  const armStart = Math.floor((width - armWidth) / 2);
  const armEnd = armStart + armWidth;
  const barDepth = Math.round(depth / 3);
  const barStart = Math.floor((depth - barDepth) / 2);
  const barEnd = barStart + barDepth;
  return Array.from({ length: depth }, (_, row) =>
    Array.from({ length: width }, (_, col) => {
      const inArm = col >= armStart && col < armEnd;
      const inBar = row >= barStart && row < barEnd;
      return inArm || inBar ? 1 : 0;
    }),
  );
}

export const ROOM_MASKS: Record<RoomLayoutId, number[][]> = {
  "8x8": rectMask(8, 8),
  "10x10": rectMask(10, 10),
  "15x15": rectMask(15, 15),
  "16x18_jagged": [
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  "18x16_zigzag": zigzagMask(18, 16),
  "18x18_cross": crossMask(18, 18),
  "18x30": rectMask(18, 30),
  "20x20": rectMask(20, 20),
};

export function getRoomLayout(id: RoomLayoutId | null | undefined): RoomLayout | undefined {
  return ROOM_LAYOUTS.find((layout) => layout.id === id);
}
