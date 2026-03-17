import { db, usersTable, creditTransactionsTable } from '@workspace/db';
import { eq, sql, desc, ilike, or, and, gte, lte, count } from 'drizzle-orm';

export class Storage {
  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user ?? null;
  }

  async getAllUsers(limit = 100) {
    return db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(limit);
  }

  async searchUsers(query: string, limit = 50) {
    const q = `%${query}%`;
    return db
      .select()
      .from(usersTable)
      .where(or(
        ilike(usersTable.email, q),
        ilike(usersTable.firstName, q),
        ilike(usersTable.lastName, q),
        ilike(usersTable.id, q),
      ))
      .orderBy(desc(usersTable.createdAt))
      .limit(limit);
  }

  async getUserWithTransactions(id: string) {
    const user = await this.getUser(id);
    if (!user) return null;
    const transactions = await this.getCreditTransactions(id, 100);
    return { ...user, transactions };
  }

  async upsertUser(data: typeof usersTable.$inferInsert) {
    const [user] = await db
      .insert(usersTable)
      .values(data)
      .onConflictDoUpdate({ target: usersTable.id, set: { ...data, updatedAt: new Date() } })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<typeof usersTable.$inferInsert>) {
    const [user] = await db.update(usersTable).set({ ...data, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
    return user;
  }

  async deleteUser(id: string) {
    await db.transaction(async (tx) => {
      await tx.delete(creditTransactionsTable).where(eq(creditTransactionsTable.userId, id));
      await tx.delete(usersTable).where(eq(usersTable.id, id));
    });
  }

  async addCredits(userId: string, amount: number, type: string, description?: string, stripeSessionId?: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ creditsBalance: sql`${usersTable.creditsBalance} + ${amount}`, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      const [tx_] = await tx
        .insert(creditTransactionsTable)
        .values({ userId, amount, type, description: description ?? null, stripeSessionId: stripeSessionId ?? null })
        .returning();
      return tx_;
    });
  }

  async deductCredits(userId: string, amount: number, description?: string) {
    return db.transaction(async (tx) => {
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!user || user.creditsBalance < amount) throw new Error('Insufficient credits');
      await tx
        .update(usersTable)
        .set({ creditsBalance: sql`${usersTable.creditsBalance} - ${amount}`, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      const [tx_] = await tx
        .insert(creditTransactionsTable)
        .values({ userId, amount: -amount, type: 'use', description: description ?? null })
        .returning();
      return tx_;
    });
  }

  async getTransactionByStripeSession(sessionId: string) {
    const [tx] = await db
      .select()
      .from(creditTransactionsTable)
      .where(eq(creditTransactionsTable.stripeSessionId, sessionId))
      .limit(1);
    return tx ?? null;
  }

  async getCreditTransactions(userId: string, limit = 50) {
    return db
      .select()
      .from(creditTransactionsTable)
      .where(eq(creditTransactionsTable.userId, userId))
      .orderBy(desc(creditTransactionsTable.createdAt))
      .limit(limit);
  }

  async getAllTransactions(limit = 200, type?: string) {
    if (type) {
      return db
        .select()
        .from(creditTransactionsTable)
        .where(eq(creditTransactionsTable.type, type))
        .orderBy(desc(creditTransactionsTable.createdAt))
        .limit(limit);
    }
    return db
      .select()
      .from(creditTransactionsTable)
      .orderBy(desc(creditTransactionsTable.createdAt))
      .limit(limit);
  }

  async getStats() {
    const usersResult = await db.execute(sql`SELECT COUNT(*) as total_users, COALESCE(SUM(credits_balance),0) as total_credits FROM users`);
    const txResult = await db.execute(sql`SELECT COUNT(*) as total_tx, COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) as credits_issued FROM credit_transactions`);
    return {
      totalUsers: Number(usersResult.rows[0]?.total_users ?? 0),
      totalCreditsInCirculation: Number(usersResult.rows[0]?.total_credits ?? 0),
      totalTransactions: Number(txResult.rows[0]?.total_tx ?? 0),
      totalCreditsIssued: Number(txResult.rows[0]?.credits_issued ?? 0),
    };
  }

  async getDashboardStats() {
    const base = await this.getStats();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newUsersToday = await db.execute(sql`SELECT COUNT(*) as c FROM users WHERE created_at >= ${todayStart}`);
    const newUsersWeek = await db.execute(sql`SELECT COUNT(*) as c FROM users WHERE created_at >= ${weekAgo}`);
    const newUsersMonth = await db.execute(sql`SELECT COUNT(*) as c FROM users WHERE created_at >= ${monthAgo}`);
    const txToday = await db.execute(sql`SELECT COUNT(*) as c FROM credit_transactions WHERE created_at >= ${todayStart}`);
    const purchaseTxCount = await db.execute(sql`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM credit_transactions WHERE type = 'purchase'`);
    const dailyClaimCount = await db.execute(sql`SELECT COUNT(*) as c FROM credit_transactions WHERE type = 'daily'`);
    const creditUsageCount = await db.execute(sql`SELECT COUNT(*) as c, COALESCE(SUM(ABS(amount)),0) as total FROM credit_transactions WHERE type = 'use'`);
    const topUsers = await db.execute(sql`SELECT id, first_name, last_name, email, credits_balance FROM users ORDER BY credits_balance DESC LIMIT 5`);
    const recentActivity = await db.execute(sql`
      SELECT ct.*, u.first_name, u.last_name, u.email
      FROM credit_transactions ct
      LEFT JOIN users u ON u.id = ct.user_id
      ORDER BY ct.created_at DESC LIMIT 10
    `);

    return {
      ...base,
      newUsersToday: Number(newUsersToday.rows[0]?.c ?? 0),
      newUsersWeek: Number(newUsersWeek.rows[0]?.c ?? 0),
      newUsersMonth: Number(newUsersMonth.rows[0]?.c ?? 0),
      transactionsToday: Number(txToday.rows[0]?.c ?? 0),
      totalPurchases: Number(purchaseTxCount.rows[0]?.c ?? 0),
      totalPurchaseCredits: Number(purchaseTxCount.rows[0]?.total ?? 0),
      totalDailyClaims: Number(dailyClaimCount.rows[0]?.c ?? 0),
      totalCreditsUsed: Number(creditUsageCount.rows[0]?.total ?? 0),
      totalUsageCount: Number(creditUsageCount.rows[0]?.c ?? 0),
      topUsers: (topUsers.rows ?? []) as any[],
      recentActivity: (recentActivity.rows ?? []) as any[],
    };
  }

  async getDailyTrends(days = 14) {
    const result = await db.execute(sql`
      SELECT
        d::date as date,
        COALESCE(u.cnt, 0) as new_users,
        COALESCE(t.cnt, 0) as transactions,
        COALESCE(t.credits_in, 0) as credits_granted,
        COALESCE(t.credits_out, 0) as credits_used
      FROM generate_series(
        CURRENT_DATE - ${days - 1} * INTERVAL '1 day',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) d
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM users WHERE created_at::date = d::date
      ) u ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) as cnt,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as credits_in,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as credits_out
        FROM credit_transactions WHERE created_at::date = d::date
      ) t ON true
      ORDER BY d ASC
    `);
    return (result.rows ?? []).map((r: any) => ({
      date: r.date,
      newUsers: Number(r.new_users),
      transactions: Number(r.transactions),
      creditsGranted: Number(r.credits_granted),
      creditsUsed: Number(r.credits_used),
    }));
  }

  async getRevenueStats() {
    const purchaseTotal = await db.execute(sql`
      SELECT
        COUNT(*) as total_purchases,
        COALESCE(SUM(amount), 0) as total_credits
      FROM credit_transactions WHERE type = 'purchase'
    `);
    const byPeriod = await db.execute(sql`
      SELECT
        d::date as date,
        COUNT(*) as purchases,
        COALESCE(SUM(amount), 0) as credits
      FROM generate_series(CURRENT_DATE - 29 * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day') d
      LEFT JOIN credit_transactions ct ON ct.created_at::date = d::date AND ct.type = 'purchase'
      GROUP BY d::date
      ORDER BY d ASC
    `);
    return {
      totalPurchases: Number(purchaseTotal.rows[0]?.total_purchases ?? 0),
      totalCredits: Number(purchaseTotal.rows[0]?.total_credits ?? 0),
      daily: (byPeriod.rows ?? []).map((r: any) => ({
        date: r.date,
        purchases: Number(r.purchases),
        credits: Number(r.credits),
      })),
    };
  }

  async getStripeProducts() {
    try {
      const result = await db.execute(sql`
        SELECT p.id, p.name, p.description, p.metadata, p.active,
               pr.id as price_id, pr.unit_amount, pr.currency
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      const map = new Map<string, any>();
      for (const r of result.rows as any[]) {
        if (!map.has(r.id)) {
          map.set(r.id, {
            id: r.id, name: r.name, description: r.description,
            credits: Number(r.metadata?.credits ?? 0), active: r.active, prices: [],
          });
        }
        if (r.price_id) {
          map.get(r.id)!.prices.push({ id: r.price_id, unitAmount: Number(r.unit_amount), currency: r.currency });
        }
      }
      return Array.from(map.values());
    } catch {
      return [];
    }
  }

  async getTransactionBreakdown() {
    const result = await db.execute(sql`
      SELECT type, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total
      FROM credit_transactions
      GROUP BY type
      ORDER BY cnt DESC
    `);
    return (result.rows ?? []).map((r: any) => ({
      type: r.type as string,
      count: Number(r.cnt),
      total: Number(r.total),
    }));
  }
}

export const storage = new Storage();
