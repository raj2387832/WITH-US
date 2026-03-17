import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error('Payload must be a Buffer. Ensure webhook route is before express.json().');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(
      payload, signature, webhookSecret,
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      if (session.payment_status === 'paid' && session.metadata?.userId && session.metadata?.credits) {
        const userId = session.metadata.userId;
        const credits = Number(session.metadata.credits);
        const sessionId = session.id;

        const existing = await storage.getTransactionByStripeSession(sessionId);
        if (!existing && credits > 0) {
          await storage.addCredits(userId, credits, 'purchase', `Purchased ${credits} credits`, sessionId);
          console.log(`Fulfilled ${credits} credits for user ${userId} (session ${sessionId})`);
        }
      }
    }

    try {
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (syncErr: any) {
      console.warn('Stripe sync processing failed (non-critical):', syncErr.message);
    }
  }
}
