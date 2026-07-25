"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import { Bell, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/UI/checkbox";
import { Label } from "@/components/UI/label";
import { Button } from "@/components/UI/button";
import {
  getInstanceStatus,
  setBrowserAlertsEnabled,
} from "@/app/[locale]/instances/[id]/actions";
import type { botInstances } from "@/db/schema";
import { useInstanceStore } from "../store";
import { useNotifications } from "../hooks/use-notifications";

type InstanceStatus = (typeof botInstances.$inferSelect)["status"];

const POLL_INTERVAL_MS = 30_000;
// Worth interrupting the customer for while their tab happens to be open —
// "provisioning"/"created"/"stopped" are all either expected or already
// something the customer just did themselves.
const ALERT_STATUSES = new Set<InstanceStatus>(["degraded", "suspended"]);

// No subscribe source (Notification.permission has no change event across
// browsers) — reading it via useSyncExternalStore instead of an effect+state
// still gives an SSR-safe snapshot (no `Notification` global on the server)
// without the "setState synchronously in an effect" cascading-render issue.
// After our own requestPermission() call, forceRefresh() (a plain reducer
// bump from the click handler, not an effect) makes the next render reread
// the now-changed value.
function subscribeNever() {
  return () => {};
}
function getPermissionSnapshot(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}
function getServerPermissionSnapshot(): NotificationPermission | "unsupported" {
  return "unsupported";
}

/**
 * Account-wide notification prefs (schema.ts's comment on
 * users.emailAlertsEnabled/browserAlertsEnabled), surfaced on the instance
 * page since that's where "is my bot okay" actually matters to the
 * customer. Email piggybacks on the existing degraded-alert cron
 * (db/instance-alerts.ts) — this only flips whether it's allowed to send.
 * Browser alerts are deliberately in-page only: no service worker/Web
 * Push, just the Notification API firing while this tab is open, on a
 * light poll of the instance's own status.
 *
 * Self-contained ({ instanceId } only) — reads header/notifications from
 * the shared instance store instead of props from the page's own
 * server-rendered data (docs/decisions.md, 2026-07-24, "instance store").
 * `emailAlertsEnabled`/`browserAlertsEnabled` are read straight from the
 * store rather than mirrored into local state — both toggles write back
 * into the store optimistically, at the click itself, so the store already
 * *is* the "local, editable copy" every other card's own `useState` used to
 * be, just one that survives this card unmounting when its tab isn't
 * active.
 */
export function NotificationsCard({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.notifications");
  const tStatus = useTranslations("instanceStatus");

  const header = useInstanceStore((s) => s.header);
  const { notifications, setNotifications, formAction } = useNotifications(instanceId);
  const botName = header.bot?.name ?? header.instance.catalogBotSlug;
  const initialStatus = header.instance.status;

  const emailFormRef = useRef<HTMLFormElement>(null);

  const permission = useSyncExternalStore(
    subscribeNever,
    getPermissionSnapshot,
    getServerPermissionSnapshot,
  );
  const [, forceRefresh] = useReducer((n: number) => n + 1, 0);
  const lastStatus = useRef(initialStatus);

  useEffect(() => {
    if (permission !== "granted" || !notifications.browserAlertsEnabled) return;

    const interval = setInterval(async () => {
      const next = await getInstanceStatus(instanceId);
      if (!next || next.status === lastStatus.current) return;
      lastStatus.current = next.status;
      if (!ALERT_STATUSES.has(next.status)) return;

      new Notification(t("pushTitle", { bot: botName }), {
        body: next.errorKind
          ? `${tStatus(`status.${next.status}`)} — ${tStatus(`errorKind.${next.errorKind}`)}`
          : tStatus(`status.${next.status}`),
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [permission, notifications.browserAlertsEnabled, instanceId, t, tStatus, botName]);

  async function handleEnableBrowser() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    const enabled = result === "granted";
    setNotifications({ ...notifications, browserAlertsEnabled: enabled });
    forceRefresh(); // re-reads Notification.permission even if `enabled` didn't change browserAlertsEnabled's value (e.g. denied while already false)
    await setBrowserAlertsEnabled(instanceId, enabled);
  }

  async function handleToggleBrowser(checked: boolean) {
    setNotifications({ ...notifications, browserAlertsEnabled: checked });
    await setBrowserAlertsEnabled(instanceId, checked);
  }

  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-xl text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <form
          ref={emailFormRef}
          action={formAction}
          className="flex items-start gap-3"
        >
          <input
            type="hidden"
            name="enabled"
            value={notifications.emailAlertsEnabled ? "on" : "off"}
          />
          <Checkbox
            id="notifications-email"
            checked={notifications.emailAlertsEnabled}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setNotifications({ ...notifications, emailAlertsEnabled: next });
              // React hasn't flushed the hidden input's new value yet at
              // this point, so submit next tick rather than reading stale
              // FormData off the just-clicked event.
              queueMicrotask(() => emailFormRef.current?.requestSubmit());
            }}
            className="mt-0.5 border-paper/30 data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
          />
          <div className="grid gap-0.5">
            <Label
              htmlFor="notifications-email"
              className="flex items-center gap-1.5 font-normal text-paper"
            >
              <Mail aria-hidden className="size-3.5 text-dust" />
              {t("emailLabel")}
            </Label>
            <p className="text-xs text-dust">{t("emailHint")}</p>
          </div>
        </form>

        <div className="flex items-start gap-3">
          {permission === "granted" ? (
            <>
              <Checkbox
                id="notifications-browser"
                checked={notifications.browserAlertsEnabled}
                onCheckedChange={(checked) =>
                  handleToggleBrowser(checked === true)
                }
                className="mt-0.5 border-paper/30 data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
              />
              <div className="grid gap-0.5">
                <Label
                  htmlFor="notifications-browser"
                  className="flex items-center gap-1.5 font-normal text-paper"
                >
                  <Bell aria-hidden className="size-3.5 text-dust" />
                  {t("browserLabel")}
                </Label>
                <p className="text-xs text-dust">{t("browserHintGranted")}</p>
              </div>
            </>
          ) : permission === "denied" ? (
            <div className="grid gap-0.5">
              <p className="flex items-center gap-1.5 text-sm text-paper">
                <Bell aria-hidden className="size-3.5 text-dust" />
                {t("browserLabel")}
              </p>
              <p className="text-xs text-dust">{t("browserHintDenied")}</p>
            </div>
          ) : permission === "unsupported" ? (
            <div className="grid gap-0.5">
              <p className="flex items-center gap-1.5 text-sm text-paper">
                <Bell aria-hidden className="size-3.5 text-dust" />
                {t("browserLabel")}
              </p>
              <p className="text-xs text-dust">{t("browserHintUnsupported")}</p>
            </div>
          ) : permission === "default" ? (
            <div className="grid gap-2">
              <div className="grid gap-0.5">
                <p className="flex items-center gap-1.5 text-sm text-paper">
                  <Bell aria-hidden className="size-3.5 text-dust" />
                  {t("browserLabel")}
                </p>
                <p className="text-xs text-dust">{t("browserHintDefault")}</p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleEnableBrowser}
                className="w-fit border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
                variant="outline"
              >
                {t("enableBrowser")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
