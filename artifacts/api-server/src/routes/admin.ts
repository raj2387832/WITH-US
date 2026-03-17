import { Router, type IRouter } from 'express';
import { storage } from '../storage';
import { isAdminTokenValid, isDemoAdmin, getAdminRole } from './admin-auth';

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const hasReplitAdmin = req.isAuthenticated?.() && (req.user as any)?.isAdmin;
  const hasCookieAdmin = isAdminTokenValid(req);
  if (!hasReplitAdmin && !hasCookieAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireFullAdmin(req: any, res: any, next: any) {
  if (isDemoAdmin(req)) {
    return res.status(403).json({ error: 'Demo admin cannot perform write operations' });
  }
  next();
}

// ─── Dashboard ────────────────────────────────────────────
router.get('/admin/dashboard', requireAdmin, async (_req, res) => {
  try {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/trends', requireAdmin, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 14), 1), 90);
  try {
    const trends = await storage.getDailyTrends(days);
    res.json({ trends });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats (legacy) ──────────────────────────────────────
router.get('/admin/stats', requireAdmin, async (_req, res) => {
  const stats = await storage.getStats();
  res.json(stats);
});

// ─── Users ───────────────────────────────────────────────
router.get('/admin/users', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
  const q = req.query.q as string | undefined;
  try {
    const users = q ? await storage.searchUsers(q, limit) : await storage.getAllUsers(limit);
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await storage.getUserWithTransactions(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/users/:id/credits', requireAdmin, requireFullAdmin, async (req, res) => {
  const { id } = req.params;
  const { amount, description } = req.body as { amount: number; description?: string };
  if (typeof amount !== 'number') return res.status(400).json({ error: 'amount must be a number' });
  try {
    if (amount >= 0) {
      await storage.addCredits(id, amount, 'admin_grant', description ?? 'Admin credit grant');
    } else {
      await storage.deductCredits(id, Math.abs(amount), description ?? 'Admin deduction');
    }
    const user = await storage.getUser(id);
    res.json({ balance: user?.creditsBalance ?? 0 });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/users/:id/toggle-admin', requireAdmin, requireFullAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await storage.getUser(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const updated = await storage.updateUser(id, { isAdmin: !user.isAdmin });
  res.json({ isAdmin: updated!.isAdmin });
});

router.post('/admin/users/:id/reset-credits', requireAdmin, requireFullAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await storage.updateUser(id, { creditsBalance: 0 } as any);
    await storage.addCredits(id, 0, 'admin_grant', 'Admin reset credits to 0');
    res.json({ balance: 0 });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/admin/users/:id', requireAdmin, requireFullAdmin, async (req, res) => {
  try {
    await storage.deleteUser(req.params.id);
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Transactions ────────────────────────────────────────
router.get('/admin/transactions', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 1000);
  const type = req.query.type as string | undefined;
  try {
    const transactions = await storage.getAllTransactions(limit, type === 'all' ? undefined : type);
    const breakdown = await storage.getTransactionBreakdown();
    res.json({ transactions, breakdown });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Revenue / Stripe ────────────────────────────────────
router.get('/admin/revenue', requireAdmin, async (_req, res) => {
  try {
    const revenue = await storage.getRevenueStats();
    res.json(revenue);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/stripe/status', requireAdmin, async (_req, res) => {
  const hasKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? '';
  const webhookUrl = domain ? `https://${domain}/api/stripe/webhook` : '';
  let products: any[] = [];
  try { products = await storage.getStripeProducts(); } catch {}
  res.json({
    connected: hasKey,
    webhookConfigured: hasWebhookSecret,
    productCount: products.length,
    products,
    webhookUrl,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ? '****' + process.env.STRIPE_PUBLISHABLE_KEY.slice(-8) : null,
  });
});

router.post('/admin/stripe/test-connection', requireAdmin, async (_req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.json({ success: false, error: 'STRIPE_SECRET_KEY not set' });
  }
  try {
    const { getUncachableStripeClient } = await import('../stripeClient');
    const stripe = await getUncachableStripeClient();
    const account = await stripe.accounts.retrieve();
    res.json({
      success: true,
      accountId: account.id,
      businessName: (account as any).business_profile?.name ?? (account as any).settings?.dashboard?.display_name ?? account.id,
      country: account.country,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      livemode: (account as any).livemode ?? false,
    });
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/admin/stripe/sync', requireAdmin, requireFullAdmin, async (_req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe not connected' });
  }
  try {
    const { getStripeSync } = await import('../stripeClient');
    const stripeSync = await getStripeSync();
    await stripeSync.syncBackfill();
    const products = await storage.getStripeProducts();
    res.json({ synced: true, productCount: products.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/stripe/create-product', requireAdmin, requireFullAdmin, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe not connected' });
  }
  const { name, description, credits, priceUSD } = req.body as {
    name: string; description?: string; credits: number; priceUSD: number;
  };
  if (!name || !credits || !priceUSD) {
    return res.status(400).json({ error: 'name, credits, and priceUSD are required' });
  }
  try {
    const { getUncachableStripeClient, getStripeSync } = await import('../stripeClient');
    const stripe = await getUncachableStripeClient();
    const product = await stripe.products.create({
      name,
      description: description ?? undefined,
      metadata: { credits: String(credits) },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(priceUSD * 100),
      currency: 'usd',
    });
    try {
      const stripeSync = await getStripeSync();
      await stripeSync.syncBackfill();
    } catch {}
    res.json({
      productId: product.id,
      priceId: price.id,
      name: product.name,
      credits,
      priceUSD,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/stripe/toggle-product/:productId', requireAdmin, requireFullAdmin, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe not connected' });
  }
  const { productId } = req.params;
  const { active } = req.body as { active: boolean };
  try {
    const { getUncachableStripeClient, getStripeSync } = await import('../stripeClient');
    const stripe = await getUncachableStripeClient();
    const product = await stripe.products.update(productId, { active });
    try {
      const stripeSync = await getStripeSync();
      await stripeSync.syncBackfill();
    } catch {}
    res.json({ id: product.id, active: product.active });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/stripe/seed-products', requireAdmin, requireFullAdmin, async (_req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe not connected' });
  }
  const PACKS = [
    { name: 'Starter Pack', description: 'Perfect for occasional use', credits: 10, amountUSD: 199 },
    { name: 'Pro Pack', description: 'Best value for regular users', credits: 50, amountUSD: 799 },
    { name: 'Power Pack', description: 'For heavy usage and teams', credits: 200, amountUSD: 2499 },
  ];
  try {
    const { getUncachableStripeClient, getStripeSync } = await import('../stripeClient');
    const stripe = await getUncachableStripeClient();
    const created: any[] = [];
    for (const pack of PACKS) {
      const product = await stripe.products.create({
        name: pack.name,
        description: pack.description,
        metadata: { credits: String(pack.credits) },
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: pack.amountUSD,
        currency: 'usd',
      });
      created.push({ productId: product.id, priceId: price.id, name: pack.name, credits: pack.credits, price: pack.amountUSD });
    }
    try {
      const stripeSync = await getStripeSync();
      await stripeSync.syncBackfill();
    } catch {}
    res.json({ created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── System / Settings ──────────────────────────────────
router.get('/admin/system', requireAdmin, async (_req, res) => {
  try {
    const dbCheck = await (await import('@workspace/db')).db.execute(
      (await import('drizzle-orm')).sql`SELECT NOW() as now, version() as version`
    );
    const userCount = await (await import('@workspace/db')).db.execute(
      (await import('drizzle-orm')).sql`SELECT COUNT(*) as c FROM users`
    );
    const txCount = await (await import('@workspace/db')).db.execute(
      (await import('drizzle-orm')).sql`SELECT COUNT(*) as c FROM credit_transactions`
    );

    res.json({
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
      dbConnected: true,
      dbVersion: dbCheck.rows[0]?.version,
      dbTime: dbCheck.rows[0]?.now,
      totalUsers: Number(userCount.rows[0]?.c ?? 0),
      totalTransactions: Number(txCount.rows[0]?.c ?? 0),
      stripeConnected: !!process.env.STRIPE_SECRET_KEY,
      stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
      environment: process.env.NODE_ENV ?? 'development',
      adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, dbConnected: false });
  }
});

router.post('/admin/settings/credentials', requireAdmin, requireFullAdmin, async (req, res) => {
  const { currentPassword, newPassword, newUsername } = req.body as { currentPassword: string; newPassword?: string; newUsername?: string };
  const currentAdminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  if (currentPassword !== currentAdminPassword) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }
  const updated: string[] = [];
  if (newPassword) {
    process.env.ADMIN_PASSWORD = newPassword;
    updated.push('password');
  }
  if (newUsername) {
    process.env.ADMIN_USERNAME = newUsername;
    updated.push('username');
  }
  res.json({ updated, message: 'Credentials updated for this session. Set environment variables for permanence.' });
});

export default router;
