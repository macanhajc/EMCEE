import { useFormatter, useTranslations } from "next-intl";

interface OperationalEvent {
  id: number;
  kind: string;
  data: unknown;
  createdAt: Date;
}

const KNOWN_KINDS = new Set([
  "degraded",
  "disconnected",
  "connect_timed_out",
  "token_unseal_failed",
  "stopped",
  "config_applied",
  "config_rejected",
]);

export function StatusLog({ events }: { events: OperationalEvent[] }) {
  const t = useTranslations("instanceDetail.statusLog");
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
              <span className="text-paper">
                {t(`events.${KNOWN_KINDS.has(event.kind) ? event.kind : "generic"}`)}
              </span>
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
