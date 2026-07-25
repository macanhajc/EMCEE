"use client";

import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { Button } from "@/components/UI/button";
import { useBotTokenUpdate } from "../hooks/use-bot-token-update";

const fieldControlClass =
  "border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30";

/**
 * Status → Bot token card — the whole card, chrome included. Fully
 * self-contained: fetches its own current token-last-4/room id via
 * useBotTokenUpdate and owns its own two save actions, rather than being
 * handed `instance.tokenLast4`/`instance.roomId`/bound `replaceToken`/
 * `replaceRoomId` actions down from the page's own server-rendered props.
 * Rendered directly in instance-config.tsx's Status tab, same self-contained
 * shape every module's cards already use (docs/decisions.md, 2026-07-24).
 *
 * Both forms report success/error inline via `useActionState`/toast now,
 * not the redirect-with-query-param banner they used before — a redirect
 * remounts the whole page, which reset whichever module tab the owner had
 * open, the exact bug every other dedicated card action already avoids this
 * way (see `replaceToken`'s own comment, actions.ts). The token/room inputs
 * are deliberately left uncontrolled: React 19 resets an uncontrolled field
 * back to its (empty) `defaultValue` once its form's action resolves
 * successfully — undesirable everywhere else in this codebase, but exactly
 * what's wanted here, clearing a write-only credential field after a
 * successful save instead of leaving it sitting in the DOM.
 */
export function BotTokenUpdate({ instanceId }: { instanceId: string }) {
  const t = useTranslations("instanceDetail.tokenUpdate");
  const tInstance = useTranslations("instanceDetail");
  const { data, tokenState, tokenFormAction, roomState, roomFormAction } = useBotTokenUpdate(instanceId);

  useEffect(() => {
    if (!tokenState) return;
    if (tokenState.ok) {
      toast.success(tInstance("savedMessage"));
    } else {
      toast.error(tInstance.has(`errors.${tokenState.error}`) ? tInstance(`errors.${tokenState.error}`) : tokenState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenState]);

  useEffect(() => {
    if (!roomState) return;
    if (roomState.ok) {
      toast.success(tInstance("savedMessage"));
    } else {
      toast.error(tInstance.has(`errors.${roomState.error}`) ? tInstance(`errors.${roomState.error}`) : roomState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-paper/10 bg-panel p-6">
        <h2 className="font-display text-base text-paper">{t("title")}</h2>
        <p className="mt-5 text-xs text-dust">{tInstance("loading")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 font-ui-mono text-xs text-dust">
        {t("currentlyEnding", { last4: data.tokenLast4 || "----" })}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-dust">{t("body")}</p>
      <details className="mt-4 group/details">
        <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-marquee uppercase select-none">
          {t("replaceSummary")}
        </summary>
        <form action={tokenFormAction} className="mt-4 grid gap-3">
          <Label htmlFor="token" className="text-dust">
            {t("newTokenLabel")}
          </Label>
          <Input
            id="token"
            name="token"
            type="password"
            autoComplete="off"
            className={`h-11 ${fieldControlClass}`}
          />
          <p className="flex items-start gap-2 text-xs leading-relaxed text-dust">
            <Lock
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-marquee"
            />
            {t("encryptedNote")}
          </p>
          <Button
            type="submit"
            variant="outline"
            className="mt-1 justify-self-start border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
          >
            {t("replaceSubmit")}
          </Button>
        </form>
      </details>

      <div className="mt-4 border-t border-paper/10 pt-4">
        <p className="font-ui-mono text-xs text-dust">
          {t.rich("roomLabel", {
            roomId: data.roomId,
            paper: (chunks) => <span className="text-paper">{chunks}</span>,
          })}
        </p>
        <details className="mt-3 group/details">
          <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-marquee uppercase select-none">
            {t("changeRoomSummary")}
          </summary>
          <form action={roomFormAction} className="mt-4 grid gap-3">
            <Label htmlFor="room_id" className="text-dust">
              {t("newRoomLabel")}
            </Label>
            <Input
              id="room_id"
              name="room_id"
              type="text"
              autoComplete="off"
              placeholder={data.roomId}
              className={`h-11 ${fieldControlClass}`}
            />
            <p className="text-xs leading-relaxed text-dust">{t("changeRoomNote")}</p>
            <Button
              type="submit"
              variant="outline"
              className="mt-1 justify-self-start border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("changeRoomSubmit")}
            </Button>
          </form>
        </details>
      </div>
    </div>
  );
}
