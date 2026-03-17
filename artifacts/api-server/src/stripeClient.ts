import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

let _stripeSync: StripeSync | null = null;
let _lastStripeKey: string | undefined;

export async function getUncachableStripeClient(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured. Connect the Stripe integration.');
  return new Stripe(key, { apiVersion: '2025-05-28.basil' });
}

export async function getStripeSync(): Promise<StripeSync> {
  const currentKey = process.env.STRIPE_SECRET_KEY;
  if (_stripeSync && currentKey === _lastStripeKey) return _stripeSync;
  _stripeSync = null;
  const stripe = await getUncachableStripeClient();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  _stripeSync = new StripeSync({ stripe, databaseUrl });
  _lastStripeKey = currentKey;
  return _stripeSync;
}

export function resetStripeClients() {
  _stripeSync = null;
  _lastStripeKey = undefined;
}
