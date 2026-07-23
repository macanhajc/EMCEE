"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Bell, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/UI/checkbox";
import { Label } from "@/components/UI/label";
import { Button } from "@/components/UI/button";
import type { botInstances } from "@/db/schema";

type InstanceStatus = (typeof botInstances.$inferSelect)["status"];
type ErrorKind = (typeof botInstances.$inferSelect)["errorKind"];

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
 */
export function NotificationsCard({
  botName,
  initialStatus,
  emailAlertsEnabled,
  browserAlertsEnabled,
  updateEmailAlerts,
  setBrowserAlertsEnabled,
  getInstanceStatus,
}: {
  botName: string;
  initialStatus: InstanceStatus;
  emailAlertsEnabled: boolean;
  browserAlertsEnabled: boolean;
  updateEmailAlerts: (formData: FormData) => Promise<void>;
  setBrowserAlertsEnabled: (enabled: boolean) => Promise<void>;
  getInstanceStatus: () => Promise<{
    status: InstanceStatus;
    errorKind: ErrorKind | null;
  } | null>;
}) {
  const t = useTranslations("instanceDetail.notifications");
  const tStatus = useTranslations("instanceStatus");

  const emailFormRef = useRef<HTMLFormElement>(null);
  // Optimistic only: set from the click, never resynced from the
  // (server-refreshed) prop — the two already agree by construction once
  // updateEmailAlerts's redirect lands, so there's nothing to reconcile.
  const [emailChecked, setEmailChecked] = useState(emailAlertsEnabled);

  const permission = useSyncExternalStore(
    subscribeNever,
    getPermissionSnapshot,
    getServerPermissionSnapshot,
  );
  const [, forceRefresh] = useReducer((n: number) => n + 1, 0);
  const [browserChecked, setBrowserChecked] = useState(browserAlertsEnabled);
  const lastStatus = useRef(initialStatus);

  useEffect(() => {
    if (permission !== "granted" || !browserChecked) return;

    const interval = setInterval(async () => {
      const next = await getInstanceStatus();
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
  }, [permission, browserChecked, getInstanceStatus, t, tStatus, botName]);

  async function handleEnableBrowser() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    const enabled = result === "granted";
    setBrowserChecked(enabled);
    forceRefresh(); // re-reads Notification.permission even if `enabled` didn't change browserChecked's value (e.g. denied while already false)
    await setBrowserAlertsEnabled(enabled);
  }

  async function handleToggleBrowser(checked: boolean) {
    setBrowserChecked(checked);
    await setBrowserAlertsEnabled(checked);
  }

  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-xl text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <form
          ref={emailFormRef}
          action={updateEmailAlerts}
          className="flex items-start gap-3"
        >
          <input
            type="hidden"
            name="enabled"
            value={emailChecked ? "on" : "off"}
          />
          <Checkbox
            id="notifications-email"
            checked={emailChecked}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setEmailChecked(next);
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
                checked={browserChecked}
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
