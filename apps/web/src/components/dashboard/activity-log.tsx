interface ModerationEvent {
  id: number;
  data: unknown;
  createdAt: Date;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Renders one event's `data` (see workers/runtime/catalog/warden.py's
 * `_log_event`/`_insert_event` for the shapes this switches on) as a single
 * human-readable line. Unknown/malformed payloads fall back to a generic
 * label rather than throwing — this reads live data written by the Python
 * runtime, not something the TS side controls the shape of end-to-end. */
function describe(data: unknown): string {
  if (typeof data !== "object" || data === null) return "Moderation event";
  const d = data as Record<string, unknown>;
  const username = typeof d.username === "string" ? d.username : "someone";
  const action = typeof d.action === "string" ? d.action : "acted on";

  switch (d.type) {
    case "filter_hit":
      return `${username} tripped the word filter`;
    case "strike": {
      const reason = typeof d.reason === "string" ? d.reason : "rule trip";
      const count = typeof d.count === "number" ? d.count : "?";
      return `${username} got a strike (${reason}) — now at ${count}`;
    }
    case "moderation_applied": {
      const requester = typeof d.requester === "string" && d.requester !== "auto" ? ` by ${d.requester}` : "";
      return `${username} was ${action}d${requester}`;
    }
    case "moderation_denied":
      return `Tried to ${action} ${username}, but the bot doesn't have permission here`;
    case "external": {
      const target = typeof d.target_user_id === "string" ? d.target_user_id : "a user";
      return `${action} on ${target} by another moderator`;
    }
    default:
      return "Moderation event";
  }
}

export function ActivityLog({ events }: { events: ModerationEvent[] }) {
  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-xl text-paper">Activity log</h2>
      <p className="mt-1 text-sm text-dust">Warden&apos;s most recent moderation events in this room.</p>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-dust">Nothing logged yet — filter hits and mod actions will show up here.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-baseline justify-between gap-4 border-b border-paper/5 pb-2 text-sm last:border-0"
            >
              <span className="text-paper">{describe(event.data)}</span>
              <span className="shrink-0 font-ui-mono text-xs text-dust">{formatTimestamp(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
