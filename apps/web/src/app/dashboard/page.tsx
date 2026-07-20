import { auth, signOut } from "@/auth";
import { signOutEverywhere } from "./actions";

export default async function DashboardPage() {
  const session = await auth(); // middleware already guarantees this is set

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", display: "grid", gap: 16 }}>
      <h1>Dashboard</h1>
      <p>
        Signed in as {session!.user.email} ({session!.user.role})
      </p>
      <p>No bot instances yet.</p>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>

      <form action={signOutEverywhere}>
        <button type="submit">Sign out everywhere</button>
      </form>
    </main>
  );
}
