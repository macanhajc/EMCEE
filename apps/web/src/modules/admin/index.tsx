import { getTranslations } from "next-intl/server";

// Placeholder — middleware guarantees an admin-role session by the time this renders.
// Mandatory 2FA for admin (specs/05-security.md) is not yet implemented — TODO before
// this surface handles anything sensitive.
export async function AdminTemplate() {
  const t = await getTranslations("admin");
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto" }}>
      <h1>{t("title")}</h1>
      <p>{t("comingSoon")}</p>
    </main>
  );
}
