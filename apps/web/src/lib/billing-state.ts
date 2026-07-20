/**
 * The single place that interprets a raw Stripe subscription status into
 * our own status enum and the desired_state a bot_instance should have as
 * a result — the concrete implementation of "Billing events only ever flip
 * desired_state" (specs/02-architecture.md) and the state machine diagram
 * in specs/03-billing.md.
 *
 * Deliberately does not attempt the spec's "past_due day 0-3" sub-phase:
 * Stripe's own Smart Retries already span days before a subscription
 * leaves `past_due`, so "bot keeps running" falls out naturally from
 * mapping `past_due` -> desiredState "running" for the whole time Stripe
 * considers the subscription past_due. No separate timer needed.
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
