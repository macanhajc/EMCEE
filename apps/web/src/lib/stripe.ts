import "server-only";
import Stripe from "stripe";

const globalForStripe = globalThis as unknown as { stripeClient?: Stripe };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// No explicit apiVersion — the installed SDK version pins its own default.
export const stripe = globalForStripe.stripeClient ?? new Stripe(requireEnv("STRIPE_SECRET_KEY"));
if (process.env.NODE_ENV !== "production") globalForStripe.stripeClient = stripe;
