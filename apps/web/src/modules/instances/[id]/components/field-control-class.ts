/** Shared Tailwind classes for this page's raw `<input>`/`<select>` config
 * controls — split out so both instance-config.tsx and any card that's
 * broken out of it (e.g. anchor-spot-card.tsx) can use the same styling
 * without importing from each other. */
export const fieldControlClass =
  "border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30";
