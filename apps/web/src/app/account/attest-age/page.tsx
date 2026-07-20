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
    <main style={{ maxWidth: 420, margin: "4rem auto" }}>
      <h1>One more thing</h1>
      <p>Buying a subscription and running a bot requires you to be an adult.</p>
      {error && <p role="alert">Please confirm to continue.</p>}
      <form action={attestAge} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="next" value={next} />
        <label>
          <input type="checkbox" name="confirm" /> I am 18 or older (or the age of majority
          where I live).
        </label>
        <button type="submit">Confirm</button>
      </form>
    </main>
  );
}
