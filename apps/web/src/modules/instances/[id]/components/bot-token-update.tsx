import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { Button } from "@/components/UI/button";

const fieldControlClass =
  "border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30";

export function BotTokenUpdate({
  tokenLast4,
  replaceToken,
  roomId,
  replaceRoomId,
}: {
  tokenLast4: string;
  replaceToken: (formData: FormData) => Promise<void>;
  roomId: string;
  replaceRoomId: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("instanceDetail.tokenUpdate");

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 font-ui-mono text-xs text-dust">
        {t("currentlyEnding", { last4: tokenLast4 || "----" })}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-dust">{t("body")}</p>
      <details className="mt-4 group/details">
        <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-marquee uppercase select-none">
          {t("replaceSummary")}
        </summary>
        <form action={replaceToken} className="mt-4 grid gap-3">
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
            roomId,
            paper: (chunks) => <span className="text-paper">{chunks}</span>,
          })}
        </p>
        <details className="mt-3 group/details">
          <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-marquee uppercase select-none">
            {t("changeRoomSummary")}
          </summary>
          <form action={replaceRoomId} className="mt-4 grid gap-3">
            <Label htmlFor="room_id" className="text-dust">
              {t("newRoomLabel")}
            </Label>
            <Input
              id="room_id"
              name="room_id"
              type="text"
              autoComplete="off"
              placeholder={roomId}
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
