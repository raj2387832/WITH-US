import { Router, type IRouter } from 'express';
import { storage } from '../storage';
import { getUncachableStripeClient } from '../stripeClient';

const router: IRouter = Router();

const DAILY_FREE_CREDITS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

router.get('/credits/balance', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const user = await storage.getUser(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const now = new Date();
  const lastClaim = user.lastDailyClaim;
  const canClaimDaily = !lastClaim || (now.getTime() - new Date(lastClaim).getTime()) >= MS_PER_DAY;
  const nextClaimAt = lastClaim ? new Date(new Date(lastClaim).getTime() + MS_PER_DAY).toISOString() : null;

  res.json({
    balance: user.creditsBalance,
    canClaimDaily,
    dailyAmount: DAILY_FREE_CREDITS,
    nextClaimAt,
  });
});

router.post('/credits/claim-daily', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

  const user = await storage.getUser(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const now = new Date();
  const lastClaim = user.lastDailyClaim;
  if (lastClaim && (now.getTime() - new Date(lastClaim).getTime()) < MS_PER_DAY) {
    return res.status(429).json({ error: 'Daily credits already claimed. Come back tomorrow!' });
  }

  await storage.updateUser(req.user.id, { lastDailyClaim: now });
  await storage.addCredits(req.user.id, DAILY_FREE_CREDITS, 'daily', 'Daily free credits');

  const updated = await storage.getUser(req.user.id);
  res.json({ balance: updated!.creditsBalance, claimed: DAILY_FREE_CREDITS });
});

router.get('/credits/transactions', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const transactions = await storage.getCreditTransactions(req.user.id);
  res.json({ transactions });
});

router.get('/credits/products', async (_req, res) => {
  const products = await storage.getStripeProducts();
  res.json({ products });
});

router.post('/credits/checkout', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

  const { priceId, credits } = req.body as { priceId: string; credits: number };
  if (!priceId) return res.status(400).json({ error: 'priceId required' });

  try {
    const user = await storage.getUser(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const stripe = await getUncachableStripeClient();

    let customerId = user.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        metadata: { userId: user.id },
      });
      await storage.updateUser(user.id, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const domain = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${domain}/pricing?success=1&credits=${credits}`,
      cancel_url: `${domain}/pricing?cancelled=1`,
      metadata: { userId: user.id, credits: String(credits) },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/credits/webhook-fulfill', async (req, res) => {
  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Not paid' });

    const userId = session.metadata?.userId;
    const credits = Number(session.metadata?.credits ?? 0);
    if (!userId || !credits) return res.status(400).json({ error: 'Missing metadata' });

    await storage.addCredits(userId, credits, 'purchase', `Purchased ${credits} credits`, sessionId);
    res.json({ success: true, credits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
