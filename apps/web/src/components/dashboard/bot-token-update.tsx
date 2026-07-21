import { Lock } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

const fieldControlClass =
  "border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30";

export function BotTokenUpdate({
  tokenLast4,
  replaceToken,
}: {
  tokenLast4: string;
  replaceToken: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-xl text-paper">Bot token</h2>
      <p className="mt-1 font-ui-mono text-xs text-dust">
        Currently ending …{tokenLast4 ?? "----"}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-dust">
        Connects this instance to your Highrise bot account. You only need to
        touch this if you know what you&apos;re doing — rotating a token you
        think leaked, or moving to a different bot account. Leave it alone
        otherwise: the bot keeps running fine on the token it already has.
      </p>
      <details className="mt-4 group/details">
        <summary className="cursor-pointer font-ui-mono text-[11px] tracking-widest text-marquee uppercase select-none">
          Replace token
        </summary>
        <form action={replaceToken} className="mt-4 grid gap-3">
          <Label htmlFor="token" className="text-dust">
            New bot API token
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
            Encrypted the moment you submit it. Write-only from here on —
            nobody, us included, can view it again.
          </p>
          <Button
            type="submit"
            variant="outline"
            className="mt-1 justify-self-start border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
          >
            Replace token
          </Button>
        </form>
      </details>
    </div>
  );
}
