import { AttestAgeTemplate } from "@/modules/account/attest-age";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { attestAge } from "./actions";

export default async function AttestAgePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeRedirectPath(rawNext);

  return <AttestAgeTemplate next={next} showError={Boolean(error)} attestAge={attestAge} />;
}
