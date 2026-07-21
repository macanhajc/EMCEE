/**
 * The single place that interprets a raw Stripe subscription status into
 * our own status enum and the *entitlement* a bot_instance has as a result
 * — the concrete implementation of "billing state drives entitlement"
 * (specs/02-architecture.md) and the state machine diagram in
 * specs/03-billing.md.
 *
 * Deliberately does not attempt the spec's "past_due day 0-3" sub-phase:
 * Stripe's own Smart Retries already span days before a subscription
 * leaves `past_due`, so "bot keeps running" falls out naturally from
 * mapping `past_due` -> entitlement "running" for the whole time Stripe
 * considers the subscription past_due. No separate timer needed.
 *
 * Naming note: the `desiredState` this function returns is entitlement —
 * "billing would allow the bot to run" — not the final desired_state
 * column value. See resolveDesiredState() below for the second gate
 * (docs/decisions.md, 2026-07-21: the customer's own start/stop switch).
 */

export type OurSubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type DesiredState = "running" | "stopped";

export function mapSubscriptionStatus(stripeStatus: string): {
  status: OurSubscriptionStatus;
  desiredState: DesiredState;
} {
  switch (stripeStatus) {
    case "trialing":
      return { status: "trialing", desiredState: "running" };
    case "active":
      return { status: "active", desiredState: "running" };
    case "past_due":
      return { status: "past_due", desiredState: "running" };
    case "canceled":
      return { status: "canceled", desiredState: "stopped" };
    case "unpaid":
    case "paused":
      // Retries exhausted (Dashboard-configured) without an explicit
      // cancel. "suspended (bot stopped, config kept)" — recoverable,
      // distinct from a real cancellation.
      return { status: "suspended", desiredState: "stopped" };
    case "incomplete":
    case "incomplete_expired":
      // First-payment authentication never completed (e.g. abandoned
      // 3DS) — the instance was never activated, nothing to stop.
      return { status: "suspended", desiredState: "stopped" };
    default:
      throw new Error(`unrecognized Stripe subscription status: ${stripeStatus}`);
  }
}

/**
 * The final gate on bot_instances.desired_state: billing entitlement
 * (mapSubscriptionStatus's return) AND the customer's own start/stop
 * switch (bot_instances.user_enabled). Neither side can run the bot alone
 * — a lapsed subscription stops it even if the customer left it "on", and
 * a fresh or reactivated subscription doesn't start it back up until the
 * customer presses Start (docs/decisions.md, 2026-07-21).
 */
export function resolveDesiredState(entitlement: DesiredState, userEnabled: boolean): DesiredState {
  return entitlement === "running" && userEnabled ? "running" : "stopped";
}
