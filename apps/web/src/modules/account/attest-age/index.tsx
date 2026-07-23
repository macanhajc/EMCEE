import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/Elements/auth-shell";
import { Alert, AlertDescription } from "@/components/UI/alert";
import { Button } from "@/components/UI/button";
import { Checkbox } from "@/components/UI/checkbox";
import { Label } from "@/components/UI/label";

export function AttestAgeTemplate({
  next,
  showError,
  attestAge,
}: {
  next: string;
  showError: boolean;
  attestAge: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("attestAge");

  return (
    <AuthShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {showError && (
        <Alert className="mb-5 border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">{t("error")}</AlertDescription>
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
            {t("checkboxLabel")}
          </Label>
        </div>
        <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
          {t("submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
