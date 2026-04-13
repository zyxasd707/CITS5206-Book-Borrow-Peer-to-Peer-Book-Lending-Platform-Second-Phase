import { loadStripe } from "@stripe/stripe-js";

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PK || "";

export const stripePromise = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null);

export const hasStripePublishableKey = Boolean(STRIPE_PUBLISHABLE_KEY);
