import { useFormatter, useTranslations } from "next-intl";

interface ModerationEvent {
  id: number;
  data: unknown;
  createdAt: Date;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

const KNOWN_ACTIONS = new Set(["warn", "mute", "kick", "ban", "unban"]);

/** Renders one event's `data` (see workers/runtime/catalog/warden.py's
 * `_log_event`/`_insert_event` for the shapes this switches on) as a single
 * human-readable line. Unknown/malformed payloads fall back to a generic
 * label rather than throwing — this reads live data written by the Python
 * runtime, not something the TS side controls the shape of end-to-end.
 *
 * `action` is one of warn/mute/kick/ban/unban (see warden.py's
 * `_apply_action`/`apply_dashboard_action` call sites) — translated via
 * actionPast/actionInfinitive rather than
 * naive suffix concatenation (the old `${action}d` trick breaks even in
 * English, e.g. "kickd", and doesn't generalize to other languages at all). */
function describe(data: unknown, t: Translate): string {
  if (typeof data !== "object" || data === null) return t("events.generic");
  const d = data as Record<string, unknown>;
  const username = typeof d.username === "string" ? d.username : "someone";
  const rawAction = typeof d.action === "string" ? d.action : null;
  const action = rawAction && KNOWN_ACTIONS.has(rawAction) ? rawAction : null;

  switch (d.type) {
    case "filter_hit":
      return t("events.filterHit", { username });
    case "strike": {
      const reason = typeof d.reason === "string" ? d.reason : "rule trip";
      const count = typeof d.count === "number" ? d.count : "?";
      return t("events.strike", { username, reason, count });
    }
    case "moderation_applied": {
      const actionPast = action ? t(`actionPast.${action}`) : (rawAction ?? "moderated");
      const requester = typeof d.requester === "string" && d.requester !== "auto" ? d.requester : null;
      return requester
        ? t("events.moderationAppliedBy", { username, action: actionPast, requester })
        : t("events.moderationApplied", { username, action: actionPast });
    }
    case "moderation_denied": {
      const actionInf = action ? t(`actionInfinitive.${action}`) : (rawAction ?? "moderate");
      return t("events.moderationDenied", { username, action: actionInf });
    }
    case "dashboard_moderation_applied": {
      const actionPast = action ? t(`actionPast.${action}`) : (rawAction ?? "moderated");
      return t("events.dashboardModerationApplied", { username, action: actionPast });
    }
    case "dashboard_moderation_denied": {
      const actionInf = action ? t(`actionInfinitive.${action}`) : (rawAction ?? "moderate");
      return t("events.dashboardModerationDenied", { username, action: actionInf });
    }
    case "external": {
      const target = typeof d.target_user_id === "string" ? d.target_user_id : "a user";
      const actionPast = action ? t(`actionPast.${action}`) : (rawAction ?? "moderated");
      return t("events.external", { target, action: actionPast });
    }
    default:
      return t("events.generic");
  }
}

export function ActivityLog({ events }: { events: ModerationEvent[] }) {
  const t = useTranslations("instanceDetail.activityLog");
  const format = useFormatter();

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-dust">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-baseline justify-between gap-4 border-b border-paper/5 pb-2 text-sm last:border-0"
            >
              <span className="text-paper">{describe(event.data, t)}</span>
              <span className="shrink-0 font-ui-mono text-xs text-dust">
                {format.dateTime(event.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
