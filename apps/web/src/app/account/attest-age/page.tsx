import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { attestAge } from "./actions";

export default async function AttestAgePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeRedirectPath(rawNext);

  return (
    <AuthShell
      eyebrow="One more thing"
      title="Confirm your age"
      subtitle="Running a bot and paying for a subscription requires you to be an adult."
    >
      {error && (
        <Alert className="mb-5 border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            Please confirm to continue.
          </AlertDescription>
        </Alert>
      )}

      <form action={attestAge} className="grid gap-6">
        <input type="hidden" name="next" value={next} />
        <div className="flex items-start gap-3">
          <Checkbox
            id="confirm"
            name="confirm"
            className="mt-0.5 border-paper/30 data-checked:border-marquee data-checked:bg-marquee data-checked:text-ink"
          />
          <Label htmlFor="confirm" className="text-sm leading-relaxed font-normal text-paper">
            I am 18 or older (or the age of majority where I live).
          </Label>
        </div>
        <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
          Confirm and continue
        </Button>
      </form>
    </AuthShell>
  );
}
