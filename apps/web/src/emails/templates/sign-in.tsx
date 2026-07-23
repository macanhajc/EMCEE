import "server-only";
import { EmailButton, EmailLayout, EmailLinkFallback } from "../components/layout";
import { getEmailTranslator } from "../translator";
import type { AppLocale } from "@/i18n/routing";

interface SignInEmailProps {
  url: string;
  locale: AppLocale;
}

export async function SignInEmail({ url, locale }: SignInEmailProps) {
  const t = await getEmailTranslator(locale);
  return (
    <EmailLayout preview={t("signIn.preview")} footer={t("footer")}>
      <p style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>{t("signIn.heading")}</p>
      <p style={{ margin: "0 0 8px" }}>{t("signIn.body")}</p>
      <EmailButton href={url}>{t("signIn.button")}</EmailButton>
      <p style={{ margin: "24px 0 0", fontSize: 13 }}>{t("signIn.linkFallback")}</p>
      <EmailLinkFallback url={url} />
    </EmailLayout>
  );
}

export async function signInEmailSubject(locale: AppLocale): Promise<string> {
  const t = await getEmailTranslator(locale);
  return t("signIn.subject");
}
