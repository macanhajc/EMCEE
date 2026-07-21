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
    tokenFingerprint: text("token_fingerprint"), // peppered HMAC — trial dedupe, never reversible

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
    index("bot_instances_fingerprint_idx").on(t.tokenFingerprint),
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

// Trial-abuse dedupe (specs/06-auth.md): keyed on room + token fingerprint,
// deliberately no user FK — must survive account deletion, holds no PII.
export const trialRegistry = pgTable(
  "trial_registry",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    roomId: text("room_id").notNull(),
    tokenFingerprint: text("token_fingerprint").notNull(),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
  },
  (t) => [
    index("trial_registry_room_idx").on(t.roomId),
    index("trial_registry_fingerprint_idx").on(t.tokenFingerprint),
  ],
);

// ---------------------------------------------------------------------------
// Activity log — append-only, feeds dashboard + chargeback evidence packs.
// Retained 90 days then aggregated (specs/05-security.md).
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
  (t) => [index("instance_events_instance_time_idx").on(t.botInstanceId, t.createdAt.desc())],
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
