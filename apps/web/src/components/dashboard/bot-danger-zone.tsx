import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";

export function BotDangerZone({
  isSubscribed,
  openBillingPortal,
  deleteInstance,
  name,
}: {
  isSubscribed: boolean;
  openBillingPortal: () => void;
  deleteInstance: (formData: FormData) => Promise<void>;
  name: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-red-500/20 bg-panel p-6">
      <h2 className="font-display text-xl text-paper">Danger zone</h2>
      <p className="mt-1 text-sm leading-relaxed text-dust">
        Permanently deletes this bot instance — its saved token, config,
        activity log, and room memory (regulars, strikes, saved position). This
        can&apos;t be undone.
      </p>

      {isSubscribed ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-dust">
            This bot has an active subscription. Cancel it first, then come back
            here to delete the bot.
          </p>
          <form action={openBillingPortal}>
            <Button
              type="submit"
              variant="outline"
              className="shrink-0 border-paper/15 bg-transparent cursor-pointer text-paper hover:bg-paper/10 hover:text-paper"
            >
              Manage billing
            </Button>
          </form>
        </div>
      ) : (
        <details className="mt-4 group/details">
          <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-red-400 uppercase select-none">
            Delete this bot
          </summary>
          <form action={deleteInstance} className="mt-4 grid gap-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm-delete"
                name="confirm"
                className="mt-0.5 border-paper/30 data-checked:border-red-500 data-checked:bg-red-500 data-checked:text-ink"
              />
              <label
                htmlFor="confirm-delete"
                className="text-sm leading-relaxed font-normal text-paper"
              >
                I understand this permanently deletes {name} and everything tied
                to it.
              </label>
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="mt-1 justify-self-start cursor-pointer"
            >
              Delete bot
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
