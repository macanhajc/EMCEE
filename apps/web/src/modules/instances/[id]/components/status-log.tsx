"use client";

import { Check, Copy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/UI/button";
import type { instanceErrorKind, instanceStatus } from "@/db/schema";

type InstanceStatus = (typeof instanceStatus.enumValues)[number];
type ErrorKind = (typeof instanceErrorKind.enumValues)[number];

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

export function StatusLog({
  events,
  instanceId,
  botName,
  roomId,
  status,
  errorKind,
}: {
  events: OperationalEvent[];
  instanceId: string;
  botName: string;
  roomId: string;
  status: InstanceStatus;
  errorKind: ErrorKind | null;
}) {
  const t = useTranslations("instanceDetail.statusLog");
  const tStatus = useTranslations("instanceStatus");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);

  const eventLine = (event: OperationalEvent) =>
    `${format.dateTime(event.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — ${t(`events.${KNOWN_KINDS.has(event.kind) ? event.kind : "generic"}`)}`;

  // Plain text, not JSON — this is meant to be pasted straight into a
  // support email, not parsed. Same data the customer already sees on this
  // card (status, error kind, recent events); this just makes it copyable
  // with the instance id attached so support can look the row up.
  async function copyDiagnostics() {
    const statusLine = `${t("diagnostics.status")}: ${tStatus(`status.${status}`)}${
      errorKind ? ` — ${tStatus(`errorKind.${errorKind}`)}` : ""
    }`;
    const lines = [
      t("diagnostics.heading", { botName }),
      t("diagnostics.instance", { instanceId }),
      t("diagnostics.room", { roomId }),
      statusLine,
      t("diagnostics.generated", {
        timestamp: format.dateTime(new Date(), { dateStyle: "medium", timeStyle: "short" }),
      }),
      "",
      t("diagnostics.recentActivity"),
      ...(events.length ? events.map(eventLine) : [t("empty")]),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied/unavailable — button just stays as-is;
      // there's no meaningful fallback for a plain-text copy action.
    }
  }

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-base text-paper">{t("title")}</h2>
          <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copyDiagnostics}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("diagnostics.copied") : t("diagnostics.copy")}
        </Button>
      </div>

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
