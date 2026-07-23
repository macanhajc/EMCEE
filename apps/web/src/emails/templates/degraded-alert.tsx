import "server-only";
import { BRAND, EmailButton, EmailLayout } from "../components/layout";
import { getEmailTranslator } from "../translator";
import type { AppLocale } from "@/i18n/routing";

interface DegradedAlertEmailProps {
  userName: string | null;
  roomId: string;
  link: string;
  locale: AppLocale;
}

export async function DegradedAlertEmail({ userName, roomId, link, locale }: DegradedAlertEmailProps) {
  const t = await getEmailTranslator(locale);
  const greeting = userName ? t("degradedAlert.greetingNamed", { name: userName }) : t("degradedAlert.greetingGeneric");
  return (
    <EmailLayout preview={t("degradedAlert.preview")} footer={t("footer")}>
      <p
        style={{
          display: "inline-block",
          margin: "0 0 16px",
          padding: "4px 10px",
          borderRadius: 999,
          backgroundColor: BRAND.spotlight,
          color: "#ffffff",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {roomId}
      </p>
      <p style={{ margin: "0 0 8px" }}>{greeting}</p>
      <p style={{ margin: "0 0 8px" }}>{t("degradedAlert.body", { roomId })}</p>
      <EmailButton href={link}>{t("degradedAlert.button")}</EmailButton>
    </EmailLayout>
  );
}

export async function degradedAlertEmailSubject(roomId: string, locale: AppLocale): Promise<string> {
  const t = await getEmailTranslator(locale);
  return t("degradedAlert.subject", { roomId });
}
