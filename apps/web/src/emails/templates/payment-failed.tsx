import "server-only";
import { EmailButton, EmailLayout } from "../components/layout";
import { getEmailTranslator } from "../translator";
import type { AppLocale } from "@/i18n/routing";

interface PaymentFailedEmailProps {
  userName: string | null;
  roomId: string;
  link: string;
  amountFormatted: string;
  locale: AppLocale;
}

export async function PaymentFailedEmail({ userName, roomId, link, amountFormatted, locale }: PaymentFailedEmailProps) {
  const t = await getEmailTranslator(locale);
  const greeting = userName ? t("paymentFailed.greetingNamed", { name: userName }) : t("paymentFailed.greetingGeneric");
  return (
    <EmailLayout preview={t("paymentFailed.preview")} footer={t("footer")}>
      <p style={{ margin: "0 0 8px" }}>{greeting}</p>
      <p style={{ margin: "0 0 8px" }}>{t("paymentFailed.body", { roomId, amount: amountFormatted })}</p>
      <EmailButton href={link}>{t("paymentFailed.button")}</EmailButton>
    </EmailLayout>
  );
}

export async function paymentFailedEmailSubject(roomId: string, locale: AppLocale): Promise<string> {
  const t = await getEmailTranslator(locale);
  return t("paymentFailed.subject", { roomId });
}
