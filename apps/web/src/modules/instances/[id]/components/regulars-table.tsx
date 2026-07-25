"use client";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRegulars } from "../hooks/use-regulars";

/**
 * Ban/unban buttons per row (specs/bots/moderation.md's "proposed" section)
 * — `userId` is already known here (greeter_visits stores it), so these
 * submit straight to the table's shared `requestModeration` dispatcher with
 * hidden fields, no username resolution needed. Ban gets a confirm() since
 * it can be a permanent action (a footgun the in-chat `!ban` command was
 * deliberately kept out of reach of, per this module's own spec) — unban has
 * no equivalent risk.
 */
function ModerationButtons({
  userId,
  username,
  formAction,
}: {
  userId: string;
  username: string;
  formAction: (formData: FormData) => void;
}) {
  const t = useTranslations("instanceDetail.regulars");

  return (
    <div className="flex justify-end gap-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm(t("actions.confirmBan", { username }))) e.preventDefault();
        }}
      >
        <input type="hidden" name="target_user_id" value={userId} />
        <input type="hidden" name="target_username" value={username} />
        <button
          type="submit"
          name="action"
          value="ban"
          className="rounded-full border border-red-500/30 px-2.5 py-1 font-ui-mono text-[11px] text-red-400 uppercase tracking-wide hover:bg-red-500/10"
        >
          {t("actions.ban")}
        </button>
      </form>
      <form action={formAction}>
        <input type="hidden" name="target_user_id" value={userId} />
        <input type="hidden" name="target_username" value={username} />
        <button
          type="submit"
          name="action"
          value="unban"
          className="rounded-full border border-paper/15 px-2.5 py-1 font-ui-mono text-[11px] text-dust uppercase tracking-wide hover:bg-paper/10 hover:text-paper"
        >
          {t("actions.unban")}
        </button>
      </form>
    </div>
  );
}

/**
 * Activity → Regulars table card — the whole card, chrome included. Fully
 * self-contained: fetches its own current regulars list via useRegulars and
 * owns the shared `requestModeration` dispatcher every row's ban/unban
 * buttons submit to, rather than being handed `regulars`/`requestModeration`
 * down from the page's own server-rendered props. Rendered directly in
 * instance-config.tsx's Activity tab, same self-contained shape every other
 * tab's cards already use (docs/decisions.md, 2026-07-24).
 */
export function RegularsTable({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.regulars");
  const tInstance = useTranslations("instanceDetail");
  const format = useFormatter();
  const { data, state, formAction } = useRegulars(instanceId);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      // Not `savedMessage` — see ban-by-username.tsx's comment: a queued
      // moderation_requests row isn't a confirmed Highrise action yet.
      toast.success(tInstance("moderationQueuedMessage"));
    } else {
      toast.error(tInstance.has(`errors.${state.error}`) ? tInstance(`errors.${state.error}`) : state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-paper/10 bg-panel p-6">
        <h2 className="font-display text-base text-paper">{t("title")}</h2>
        <p className="mt-4 text-sm text-dust">{tInstance("loading")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>

      {data.length === 0 ? (
        <p className="mt-4 text-sm text-dust">{t("empty")}</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-paper/10 text-dust">
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase">
                {t("table.username")}
              </th>
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase">
                {t("table.visits")}
              </th>
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase">
                {t("table.lastSeen")}
              </th>
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase" />
            </tr>
          </thead>
          <tbody>
            {data.map((regular) => (
              <tr key={regular.userId} className="border-b border-paper/5 last:border-0">
                <td className="py-2 text-paper">{regular.username}</td>
                <td className="py-2 text-paper">{regular.visitCount}</td>
                <td className="py-2 text-dust">
                  {format.dateTime(regular.lastSeenAt, { month: "short", day: "numeric" })}
                </td>
                <td className="py-2">
                  <ModerationButtons
                    userId={regular.userId}
                    username={regular.username}
                    formAction={formAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
