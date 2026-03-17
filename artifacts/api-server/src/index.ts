import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import app from "./app";

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY not set, skipping Stripe init');
    return;
  }
  try {
    await runMigrations({ databaseUrl, schema: 'stripe' });
    const stripeSync = await getStripeSync();
    const domain = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${domain}/api/stripe/webhook`);
    stripeSync.syncBackfill().catch((err: Error) => console.error('Stripe backfill error:', err));
    console.log('Stripe initialized');
  } catch (err) {
    console.error('Stripe init failed (payments may not work):', err);
  }
}

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

await initStripe();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
