import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set. Set it in environment secrets before running this script.");
  process.exit(1);
}

export const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
