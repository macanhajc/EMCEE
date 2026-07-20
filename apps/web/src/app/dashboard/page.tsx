import Link from "next/link";
import { auth, signOut } from "@/auth";
import { listInstancesForUser } from "@/db/instances";
import { signOutEverywhere } from "./actions";

export default async function DashboardPage() {
  const session = await auth(); // proxy.ts already guarantees this is set
  const instances = await listInstancesForUser(session!.user.id);

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", display: "grid", gap: 16 }}>
      <h1>Dashboard</h1>
      <p>
        Signed in as {session!.user.email} ({session!.user.role})
      </p>

      {instances.length === 0 ? (
        <p>No bot instances yet.</p>
      ) : (
        <ul>
          {instances.map((instance) => (
            <li key={instance.id}>
              <Link href={`/instances/${instance.id}`}>
                {instance.catalogBotSlug} — {instance.roomId} ({instance.status})
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/instances/new">New bot instance</Link>

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
