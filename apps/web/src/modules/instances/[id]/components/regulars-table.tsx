"use client";

import { useFormatter, useTranslations } from "next-intl";

interface Regular {
  userId: string;
  username: string;
  visitCount: number;
  lastSeenAt: Date;
}

/**
 * Ban/unban buttons per row (specs/bots/moderation.md's "proposed" section)
 * — `userId` is already known here (greeter_visits stores it), so these
 * submit straight to `requestModeration` with hidden fields, no username
 * resolution needed. Ban gets a confirm() since it can be a permanent action
 * (a footgun the in-chat `!ban` command was deliberately kept out of reach
 * of, per this module's own spec) — unban has no equivalent risk.
 */
function ModerationButtons({
  userId,
  username,
  requestModeration,
}: {
  userId: string;
  username: string;
  requestModeration: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("instanceDetail.regulars");

  return (
    <div className="flex justify-end gap-2">
      <form
        action={requestModeration}
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
      <form action={requestModeration}>
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

export function RegularsTable({
  regulars,
  requestModeration,
}: {
  regulars: Regular[];
  requestModeration: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("instanceDetail.regulars");
  const format = useFormatter();

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>

      {regulars.length === 0 ? (
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
            {regulars.map((regular) => (
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
                    requestModeration={requestModeration}
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
