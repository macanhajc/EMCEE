/**
 * Postgres schema — source of truth for both planes (specs/02-architecture.md).
 *
 * The Python data plane reads bot_instances/instance_events with its own
 * least-privilege credentials (no billing tables — specs/05-security.md).
 * Billing state drives entitlement, but entitlement alone no longer starts
 * the bot: desired_state is entitled && user_enabled (lib/billing-state.ts
 * resolveDesiredState), so both the Stripe webhook and the dashboard's
 * start/stop action are legitimate writers of desired_state — see
 * docs/decisions.md, 2026-07-21.
 */
import {
  boolean,
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const userRole = pgEnum("user_role", ["customer", "admin"]);
export const catalogLifecycle = pgEnum("catalog_lifecycle", ["beta", "ga", "retired"]);
export const desiredState = pgEnum("desired_state", ["running", "stopped"]);
export const instanceStatus = pgEnum("instance_status", [
  "created",
  "provisioning",
  "running",
  "degraded",
  "stopped",
  "suspended",
]);
export const instanceErrorKind = pgEnum("instance_error_kind", ["token", "permissions", "room"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
]);

// ---------------------------------------------------------------------------
// Auth (specs/06-auth.md) — Auth.js-adapter-compatible shapes.
// users = account model; accounts = AuthIdentity (one user, N identities).
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamptz("email_verified"),
  image: text("image"),
  role: userRole("role").notNull().default("customer"),
  ageAttestedAt: timestamptz("age_attested_at"),
  // Set on first successful checkout.session.completed (specs/03-billing.md)
  // so repeat purchases and the Customer Portal reuse one Stripe Customer.
  stripeCustomerId: text("stripe_customer_id").unique(),
  // Last-seen URL locale (proxy.ts, opportunistic). Null until their first
  // authenticated request lands; async transactional emails (crash alerts,
  // payment-failed) fall back to routing.defaultLocale when null.
  locale: text("locale"),
  // Account-wide notification preferences (instance detail page's
  // notifications card) — not per-instance: the degraded-alert email already
  // targets the account address regardless of which bot triggered it, and
  // browser Notification permission is per-origin, not per-instance, so a
  // second toggle wouldn't reflect anything real. emailAlertsEnabled gates
  // the existing degraded-alert cron send (db/instance-alerts.ts);
  // browserAlertsEnabled records the user's opt-in on top of whatever the
  // browser's own Notification.permission says.
  emailAlertsEnabled: boolean("email_alerts_enabled").notNull().default(true),
  browserAlertsEnabled: boolean("browser_alerts_enabled").notNull().default(false),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(), // google | email
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamptz("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamptz("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const catalogBots = pgTable("catalog_bots", {
  slug: text("slug").primaryKey(), // "emcee"
  name: text("name").notNull(),
  tagline: text("tagline"),
  // Schema version new instances pin; existing instances keep their own pin.
  schemaVersion: integer("schema_version").notNull(),
  lifecycle: catalogLifecycle("lifecycle").notNull().default("beta"),
  stripeMonthlyPriceId: text("stripe_monthly_price_id"),
  stripeAnnualPriceId: text("stripe_annual_price_id"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Instances — the sellable unit
// ---------------------------------------------------------------------------

export const botInstances = pgTable(
  "bot_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // account deletion destroys ciphertext rows
    catalogBotSlug: text("catalog_bot_slug")
      .notNull()
      .references(() => catalogBots.slug),
    roomId: text("room_id").notNull(),

    // Token: write-only lifecycle (specs/05-security.md). Ciphertext only —
    // plaintext exists in memory during encrypt and in the supervisor at spawn.
    // Nullable: an instance exists from checkout, token pasted in provisioning.
    tokenCiphertext: text("token_ciphertext"), // base64 sealed box
    tokenKeyRef: text("token_key_ref"),
    tokenLast4: varchar("token_last4", { length: 4 }), // "token ending …a9f2"

    config: jsonb("config").notNull().default({}),
    schemaVersion: integer("schema_version").notNull(),

    // Customer's own power switch. A fresh subscription never flips this on
    // by itself — the bot stays off until the customer presses Start, even
    // once billing entitles it to run (docs/decisions.md, 2026-07-21).
    userEnabled: boolean("user_enabled").notNull().default(false),
    desiredState: desiredState("desired_state").notNull().default("stopped"), // derived: entitled && userEnabled
    status: instanceStatus("status").notNull().default("created"), // supervisor-observed
    errorKind: instanceErrorKind("error_kind"), // distinct customer-facing failure states
    // Reserved for a future coarse partition (e.g. IP-pool grouping) — not
    // read by the claim query. Actual assignment is lease-based (below),
    // per specs/04-bot-runtime.md's stated lean: "survives supervisor death
    // without ops."
    shard: text("shard"),
    // Lease-based claiming: a supervisor claims unclaimed-or-expired running
    // instances and renews the lease while it runs them. A crashed
    // supervisor's leases simply expire — no ops action needed for another
    // supervisor to pick the instance back up.
    supervisorId: text("supervisor_id"),
    leaseExpiresAt: timestamptz("lease_expires_at"),
    suspendedAt: timestamptz("suspended_at"), // reaped 30d after, config retained

    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("bot_instances_user_idx").on(t.userId),
    index("bot_instances_claim_idx").on(t.desiredState, t.leaseExpiresAt), // lease claim query
    index("bot_instances_room_idx").on(t.roomId),
  ],
);

// ---------------------------------------------------------------------------
// Billing (specs/03-billing.md) — mirror of Stripe state, 1:1 with instance.
// Data-plane DB role gets no grants here.
// ---------------------------------------------------------------------------

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    botInstanceId: uuid("bot_instance_id").references(() => botInstances.id, {
      onDelete: "set null", // billing mirror outlives the instance
    }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripePriceId: text("stripe_price_id").notNull(), // monthly | annual SKU
    status: subscriptionStatus("status").notNull(), // our state machine
    stripeStatus: text("stripe_status").notNull(), // raw Stripe status, for fidelity
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    trialEndsAt: timestamptz("trial_ends_at"),
    currentPeriodEnd: timestamptz("current_period_end"),
    canceledAt: timestamptz("canceled_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("subscriptions_instance_idx").on(t.botInstanceId),
    index("subscriptions_user_idx").on(t.userId),
  ],
);

// Raw Stripe event archive; PK on Stripe's event id = idempotency for free.
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // evt_...
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamptz("received_at").notNull().defaultNow(),
  processedAt: timestamptz("processed_at"),
});

// ---------------------------------------------------------------------------
// Activity log — append-only, feeds dashboard + chargeback evidence packs.
// Retained 90 days, then rolled up into instance_event_rollups and deleted
// by the daily /api/cron/retention sweep (specs/05-security.md,
// docs/cost-plan.md R3).
// ---------------------------------------------------------------------------

export const instanceEvents = pgTable(
  "instance_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    botInstanceId: uuid("bot_instance_id")
      .notNull()
      .references(() => botInstances.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // connect | disconnect | error | moderation | config_rejected | ...
    data: jsonb("data").notNull().default({}),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("instance_events_instance_time_idx").on(t.botInstanceId, t.createdAt.desc()),
    // Serves the by-kind scans: the degraded-alert sweep (db/instance-alerts.ts)
    // and the retention cutoff query.
    index("instance_events_kind_time_idx").on(t.kind, t.createdAt.desc()),
  ],
);

// Daily per-kind counts of pruned instance_events: the retention cron folds
// rows older than the retention window into these before deleting, so
// "the bot was live and doing its job" evidence (chargeback packs,
// specs/03-billing.md) survives pruning at negligible storage cost.
export const instanceEventRollups = pgTable(
  "instance_event_rollups",
  {
    botInstanceId: uuid("bot_instance_id")
      .notNull()
      .references(() => botInstances.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    kind: text("kind").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.botInstanceId, t.day, t.kind] })],
);

// ---------------------------------------------------------------------------
// Concierge module state (specs/bots/greeter.md)
// ---------------------------------------------------------------------------

export const greeterVisits = pgTable(
  "greeter_visits",
  {
    botInstanceId: uuid("bot_instance_id")
      .notNull()
      .references(() => botInstances.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // Highrise user id — not one of ours
    username: text("username").notNull(), // last-seen username, for the dashboard "regulars" table
    visitCount: integer("visit_count").notNull().default(1),
    firstSeenAt: timestamptz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.botInstanceId, t.userId] }),
    index("greeter_visits_instance_last_seen_idx").on(t.botInstanceId, t.lastSeenAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// Warden module state (specs/bots/moderation.md)
// ---------------------------------------------------------------------------

export const wardenStrikes = pgTable(
  "warden_strikes",
  {
    botInstanceId: uuid("bot_instance_id")
      .notNull()
      .references(() => botInstances.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // Highrise user id — not one of ours
    username: text("username").notNull(), // last-known username, for the dashboard action log
    strikes: integer("strikes").notNull().default(0),
    lastStrikeAt: timestamptz("last_strike_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.botInstanceId, t.userId] }),
    index("warden_strikes_instance_last_strike_idx").on(t.botInstanceId, t.lastStrikeAt.desc()),
  ],
);

// Dashboard-initiated ban/unban (specs/bots/moderation.md's "proposed"
// section) — a work queue, not a log: instance_events is append-only and
// warden_strikes has decay-counter semantics, neither fits a one-off owner
// action the data plane needs to claim and mark done. The control plane only
// ever inserts a "pending" row and NOTIFYs; the supervisor/WardenEngine own
// every status transition after that, same "control plane never touches a
// Highrise WebSocket" split as everything else (specs/02-architecture.md).
export const moderationAction = pgEnum("moderation_action", ["ban", "unban"]);
export const moderationRequestStatus = pgEnum("moderation_request_status", [
  "pending",
  "processing",
  "applied",
  "denied",
  "failed",
]);

export const moderationRequests = pgTable(
  "moderation_requests",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    botInstanceId: uuid("bot_instance_id")
      .notNull()
      .references(() => botInstances.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id").notNull(), // Highrise user id — resolved before insert
    targetUsername: text("target_username").notNull(), // last-known username, for display/audit
    action: moderationAction("action").notNull(),
    durationS: integer("duration_s"), // ban only; null/0 = permanent
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: moderationRequestStatus("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    resolvedAt: timestamptz("resolved_at"),
  },
  (t) => [
    // Serves the data-plane's pending-work sweep (one batched query per
    // reconcile tick, across every running instance's id, same shape as
    // renew_leases — docs/cost-plan.md R4) and the NOTIFY-triggered handler.
    index("moderation_requests_instance_status_idx").on(t.botInstanceId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Avatar module state (specs/bots/avatar.md) — one saved "anchor" spot per
// instance, restored on every reconnect so the bot doesn't spawn wherever
// the room happens to drop it.
// ---------------------------------------------------------------------------

export const avatarPositions = pgTable("avatar_positions", {
  botInstanceId: uuid("bot_instance_id")
    .primaryKey()
    .references(() => botInstances.id, { onDelete: "cascade" }),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  z: doublePrecision("z").notNull(),
  facing: text("facing").notNull(), // Facing literal from the SDK: FrontRight | FrontLeft | BackRight | BackLeft
  updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Supervisor health / operator alerting (docs/decisions.md, 2026-07-23) —
// a dead-man's-switch, distinct from the per-instance crash-loop alert
// (instance_events "degraded" + db/instance-alerts.ts). That alert can only
// fire from *inside* the supervisor's reconcile loop, so a supervisor that
// crashes at startup (bad env, code error before `Supervisor.run()`) or
// hangs never produces one — every bot_instance just sits wherever it was,
// silently, with nothing in this DB ever recording that anything is wrong.
// workers/runtime/supervisor.py writes a heartbeat row here on every
// reconcile tick (RECONCILE_INTERVAL_S, ~10s); the /api/cron/supervisor-
// health sweep (every minute, deploy/crontab + vercel.json) alerts us —
// not the customer — when the newest heartbeat goes stale.
// ---------------------------------------------------------------------------

export const supervisorHeartbeats = pgTable("supervisor_heartbeats", {
  // One row per supervisor process. Today's single-VPS deploy (R1,
  // docs/cost-plan.md) only ever runs one, so the health check just takes
  // MAX(last_seen_at) across every row — good enough for "is the data plane
  // running at all," not precise enough to catch one shard dying while
  // others live if this ever becomes multi-shard.
  supervisorId: text("supervisor_id").primaryKey(),
  capacity: integer("capacity").notNull(),
  runningCount: integer("running_count").notNull(),
  lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
});

// Generic dedup/cooldown marker for platform-wide (not per-instance) ops
// alerts — same shape as instance_events' "degraded_alert_sent" kind, but
// keyed by alert kind rather than instance id since there's no instance to
// key off here. Row present = an alert is currently active (down, not yet
// recovered); absent = healthy. Only "supervisor_down" exists today.
export const opsAlerts = pgTable("ops_alerts", {
  kind: text("kind").primaryKey(),
  lastSentAt: timestamptz("last_sent_at").notNull().defaultNow(),
});
