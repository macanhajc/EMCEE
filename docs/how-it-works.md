# How it works: bot creation → running → cancellation

A plain-language walkthrough of the core loop. For the authoritative spec, see
`specs/04-bot-runtime.md` (runtime) and `specs/03-billing.md` (billing). This
file just connects the two in order. If something in this loop looks broken,
check `docs/troubleshooting.md` first — most "the bot isn't working" reports
so far have traced back to a piece of this chain being silently down rather
than a bug in bot logic.

## 1. Creating a bot is just a database row

When a customer fills out the "new instance" form, `createInstance`
(`apps/web/src/app/[locale]/instances/new/actions.ts`) seals their Highrise
token (encrypted, write-only) and inserts one row into Postgres'
`bot_instances` table: config JSON, room ID, catalog bot slug (`"emcee"`),
encrypted token.

Nothing runs yet. The row starts with:
- `desired_state = 'stopped'`
- `status = 'created'`

## 2. Two independent switches turn it on

Nothing writes `desired_state` directly — it's always the AND of two things
(`apps/web/src/lib/billing-state.ts`):

1. **Billing entitlement** — does the subscription allow the bot to run?
   Derived from the Stripe subscription status (`trialing`/`active`/`past_due`
   → yes).
2. **The customer's own Start/Stop switch** — `user_enabled` on the row,
   flipped by the dashboard button (`setBotRunning` in
   `apps/web/src/app/[locale]/instances/[id]/actions.ts`).

A fresh subscription does **not** auto-start the bot — the customer has to
press Start even right after paying. Either side changing recomputes
`resolveDesiredState(entitlement, userEnabled)` and writes it to
`bot_instances.desired_state`. That column is the single source of truth the
runtime reads — the web app never talks to a running bot process directly.

## 3. The supervisor makes reality match `desired_state`

`workers/runtime/supervisor.py` is a separate, always-on Python process
(started independently of the web app — one per shard, not one per bot).
Every 10 seconds it:

- **Claims** any instance with `desired_state = 'running'` that isn't
  currently owned by a live supervisor (an atomic SQL claim with a lease:
  `supervisor_id` + `lease_expires_at`, TTL 60s). If a supervisor dies, its
  leases just expire and another supervisor can pick the instance back up —
  no ops action needed.
- **Spawns** each claimed instance as an `asyncio` task inside itself — one
  bot ↔ one WebSocket to its Highrise room. A single supervisor process runs
  many bots concurrently (default capacity 200), not one process per bot.
- **Renews leases** for everything it's still running, in one batched query
  per tick.
- **Stops** anything whose lease renewal comes back empty — i.e.
  `desired_state` flipped away underneath it.

Config edits, avatar-position changes, and moderation actions from the
dashboard reach already-running bots fast via Postgres `LISTEN`/`NOTIFY`, with
the reconcile loop's periodic re-read as a fallback if a notification is ever
dropped.

If a bot's connection drops, the supervisor retries with exponential backoff
(5s up to a 5-minute cap). After 5 fast consecutive failures it marks the
instance `degraded` and alerts, instead of retry-storming Highrise.

## 4. Cancelling a subscription

1. **Stripe notifies the app.** A `customer.subscription.deleted` (or
   `.updated` with status `canceled`) webhook hits
   `apps/web/src/app/api/webhooks/stripe/route.ts`.
2. **Entitlement flips to `stopped`.** `resolveDesiredState()` returns
   `"stopped"` regardless of the customer's own Start switch — cancellation
   always wins. This is written straight to `bot_instances.desired_state`.
   The webhook never touches `status`; that column is supervisor-owned only.
3. **The supervisor notices within ~10s** and shuts the instance down:
   cancels its task (disconnects from the Highrise room), releases the lease,
   sets `status = 'stopped'`, logs a `stopped` event.

Notes:
- If the customer cancels "at period end" (Stripe's default), the bot keeps
  running until the paid period actually ends, then stops automatically.
- Nothing deletes the row. Config and the encrypted token stay in
  `bot_instances`, so resubscribing later brings the bot back with the same
  setup once Start is pressed again.
- The schema has a `suspended_at` column commented as "reaped 30d after,
  config retained" — but nothing in the code currently writes or sweeps it.
  That's a planned-but-not-yet-built piece, not live behavior today.
