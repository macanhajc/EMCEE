import { ne } from "drizzle-orm";
import { db, tables } from "@/db";
import { createInstance } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts — try again in a few minutes.",
  missing_room: "Enter a room ID or paste your room's share link.",
  missing_token: "Paste your bot's API token.",
  unknown_bot: "Pick a bot.",
  bad_token: "That token doesn't look right.",
};

export default async function NewInstancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const bots = await db
    .select()
    .from(tables.catalogBots)
    .where(ne(tables.catalogBots.lifecycle, "retired"));

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", display: "grid", gap: 16 }}>
      <h1>New bot instance</h1>
      {error && <p role="alert">{ERROR_MESSAGES[error] ?? "Something went wrong."}</p>}

      {bots.length === 0 ? (
        <p>No bots available right now.</p>
      ) : (
        <form action={createInstance} style={{ display: "grid", gap: 12 }}>
          <fieldset style={{ display: "grid", gap: 4 }}>
            <legend>Bot</legend>
            {bots.map((bot, i) => (
              <label key={bot.slug} style={{ display: "block" }}>
                <input type="radio" name="bot" value={bot.slug} defaultChecked={i === 0} required />{" "}
                {bot.name}
                {bot.tagline && <span style={{ opacity: 0.6 }}> — {bot.tagline}</span>}
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="room_id">Room ID or share link</label>
            <input id="room_id" name="room_id" required style={{ display: "block", width: "100%" }} />
          </div>

          <div>
            <label htmlFor="token">Bot API token</label>
            <input
              id="token"
              name="token"
              type="password"
              autoComplete="off"
              required
              style={{ display: "block", width: "100%" }}
            />
            <p style={{ fontSize: 12, opacity: 0.6 }}>
              From your bot&apos;s page on create.highrise.game. Stored encrypted — we never display
              it again, only the last 4 characters.
            </p>
          </div>

          <button type="submit">Create instance</button>
        </form>
      )}
    </main>
  );
}
