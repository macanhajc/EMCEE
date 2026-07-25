# Troubleshooting: "the bot isn't working"

A running log of local-dev incidents where the bot *looked* broken but the
cause had nothing to do with bot code or config — something earlier in the
chain (Postgres, the supervisor process) was silently down, and neither the
dashboard nor the `bot_instances` row makes that obvious on its own. Check the
quick checklist below before debugging catalog bot logic.

The recurring trap: `status` and `lease_expires_at` on `bot_instances` are
supervisor-owned (`docs/how-it-works.md`, step 3) and only move while a
supervisor process is alive and ticking. If that process died, those columns
just freeze at whatever they last said — including `status = 'running'` — so
reading the dashboard or the row alone is not proof anything is actually
running. Always corroborate with `supervisor_heartbeats.last_seen_at`.

## Quick diagnostic checklist

0. **Check `/health` first** (`docs/decisions.md`, 2026-07-25). One glance tells you operational/degraded/down without touching SQL or the box — degraded/down here means it's worth working through the rest of this checklist; operational means look elsewhere (bot config, Highrise-side, browser cache) before suspecting infra.

1. **Is Postgres up?**
   ```
   docker ps -a --filter name=postgres
   ```
   If it shows `Exited`, `docker start botmarket-postgres-1`. Every DB call
   fails with `ECONNREFUSED` on `127.0.0.1:5432` until it's back — this
   breaks login, dashboard reads/writes, and the supervisor's reconcile loop
   simultaneously, so symptoms can look unrelated to each other.

2. **Is a supervisor process actually running?**
   ```
   ps aux | grep supervisor.py
   ```
   `docker-compose.yml` in local dev only runs Postgres — there is no
   supervisor service in it. Nothing starts `workers/runtime/supervisor.py`
   automatically. Start it by hand when testing bot behavior:
   ```
   cd workers/runtime && uv run python supervisor.py --supervisor-id local-dev
   ```

3. **Check the instance's real state directly in Postgres**, not just the
   dashboard:
   ```sql
   SELECT id, desired_state, status, error_kind, supervisor_id, lease_expires_at, now()
   FROM bot_instances WHERE id = '<instance-id>';
   ```
   If `lease_expires_at` is in the past, whatever supervisor held that lease
   is gone and `status` is stale, not current.

4. **Check supervisor liveness**, not just instance state:
   ```sql
   SELECT supervisor_id, capacity, running_count, last_seen_at, now()
   FROM supervisor_heartbeats;
   ```
   `last_seen_at` more than a few seconds old (reconcile runs every 10s) means
   that supervisor is dead or stuck, regardless of what any instance row says.

5. **Read the supervisor's own log output** for reconcile exceptions or
   connect failures — see incident 3 below for why a healthy-looking process
   isn't sufficient either.

## Incident log

### 1. Login 500 / `AdapterError` — Postgres container had exited (2026-07-25)

**Symptom:** `/en/login` returns 500; server logs show `AdapterError` /
`SessionTokenError` wrapping `ECONNREFUSED` on `127.0.0.1:5432`.

**Root cause:** `botmarket-postgres-1` had exited (not removed — just
stopped). Auth.js's session/user lookups have no fallback and surface as a
generic adapter error, which reads like an auth bug at first glance.

**Fix:** `docker start botmarket-postgres-1`. No code change needed.

### 2. "Started the bot but it didn't appear in the room" — no supervisor process running (2026-07-25)

**Symptom:** Dashboard Start switch flipped on, `bot_instances.status` even
read `'running'`, but the bot never joined the Highrise room.

**Root cause:** The dashboard's Start/Stop action (`setBotRunning` in
`apps/web/src/app/[locale]/instances/[id]/actions.ts`) only ever writes
`desired_state`/`user_enabled` — see `docs/how-it-works.md` step 2. Actually
connecting to Highrise is the supervisor's job (step 3), and no supervisor
process was running locally at all. The `status = 'running'` visible in the
row was leftover from a previous local supervisor run whose lease
(`lease_expires_at`) had already expired hours earlier — a dead process's
last-known state, not current reality.

**Fix:** start the supervisor (checklist item 2). It reclaims any instance
whose lease has expired regardless of what `status` currently says, so no
manual DB fixup is needed — just get a supervisor alive and ticking.

### 3. A failing reconcile tick can silently kill the whole supervisor loop (fix in progress, 2026-07-25)

**Symptom (as seen in a prior real incident, not this session):** the
supervisor container/process stays "Up" and looks healthy, but no instance
ever gets reclaimed and `supervisor_heartbeats.last_seen_at` stops advancing
entirely — worse than incident 2, because there's no crash or exit code to
notice.

**Root cause:** `Supervisor.run()`'s loop called `reconcile()` and
`write_heartbeat()` with nothing catching exceptions between iterations. One
bad tick — a transient DB hiccup, or a migration not yet applied — raised an
unhandled exception that silently ended `run()`'s `asyncio.Task`. Nothing
else depended on that task's result, so the process kept running (and
Docker's healthcheck, if only checking "is the process up," kept saying
healthy) while doing nothing at all, forever.

**Fix:** `workers/runtime/supervisor.py`'s loop body now wraps
`reconcile()` + `write_heartbeat()` in `try/except Exception`, logging and
retrying on the next tick instead of letting the loop die
(`test_run_survives_a_failing_tick` in `test_supervisor_unit.py` covers it).
As of this writing the fix is written but not yet committed — check
`git log workers/runtime/supervisor.py` before assuming it has shipped.

## When adding a new entry

Keep the same shape: **Symptom** (what you actually saw, verbatim if it's an
error message) → **Root cause** → **Fix**. Prefer pasting the exact SQL or
command you used to confirm the cause, not just a description — that's what
makes the next occurrence a 2-minute diagnosis instead of a re-investigation.
