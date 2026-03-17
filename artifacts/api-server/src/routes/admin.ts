import { Router, type IRouter } from 'express';
import { storage } from '../storage';

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  if (!(req.user as any).isAdmin) return res.status(403).json({ error: 'Forbidden: admin only' });
  next();
}

router.get('/admin/stats', requireAdmin, async (_req, res) => {
  const stats = await storage.getStats();
  res.json(stats);
});

router.get('/admin/users', requireAdmin, async (req, res) => {
  const limit = Number((req.query as any).limit ?? 100);
  const users = await storage.getAllUsers(limit);
  res.json({ users });
});

router.get('/admin/transactions', requireAdmin, async (_req, res) => {
  const transactions = await storage.getAllTransactions(200);
  res.json({ transactions });
});

router.post('/admin/users/:id/credits', requireAdmin, async (req, res) => {
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

router.post('/admin/users/:id/toggle-admin', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await storage.getUser(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const updated = await storage.updateUser(id, { isAdmin: !user.isAdmin });
  res.json({ isAdmin: updated!.isAdmin });
});

export default router;
