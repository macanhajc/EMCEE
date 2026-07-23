"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";

const fieldControlClass =
  "border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30";

/**
 * Manual ban/unban entry (specs/bots/moderation.md's "proposed" section) —
 * the counterpart to Regulars' per-row buttons for someone who's never
 * visited the room at all. Only a username is submitted; `requestModeration`
 * resolves it to a Highrise user id server-side via the public webapi, no
 * bot connection involved. Ban gets the same confirm() the Regulars ban
 * button uses; unban doesn't need one.
 */
export function BanByUsername({
  requestModeration,
}: {
  requestModeration: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("instanceDetail.banByUsername");

  return (
    <div className="rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-base text-paper">{t("title")}</h2>
      <p className="mt-1 text-sm text-dust">{t("subtitle")}</p>

      <form
        action={requestModeration}
        onSubmit={(e) => {
          // FormData built from the form element alone never includes which
          // submit button was clicked (that's only captured by a genuine
          // browser submission, which is what actually carries this to the
          // server action) — read it off the SubmitEvent's `submitter`
          // instead, so the confirm only fires for the Ban button, not Unban.
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (submitter?.value === "ban") {
            const usernameInput = e.currentTarget.elements.namedItem("target_username") as HTMLInputElement | null;
            if (!window.confirm(t("confirmBan", { username: usernameInput?.value ?? "" }))) e.preventDefault();
          }
        }}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="ban-by-username-input" className="text-dust">
            {t("usernameLabel")}
          </Label>
          <Input
            id="ban-by-username-input"
            name="target_username"
            type="text"
            autoComplete="off"
            placeholder={t("usernamePlaceholder")}
            required
            className={`h-10 ${fieldControlClass}`}
          />
        </div>
        <Button
          type="submit"
          name="action"
          value="ban"
          variant="outline"
          className="h-10 cursor-pointer border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 hover:text-red-400"
        >
          {t("banSubmit")}
        </Button>
        <Button
          type="submit"
          name="action"
          value="unban"
          variant="outline"
          className="h-10 cursor-pointer border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
        >
          {t("unbanSubmit")}
        </Button>
      </form>
      <p className="mt-3 text-xs text-dust">{t("note")}</p>
    </div>
  );
}
