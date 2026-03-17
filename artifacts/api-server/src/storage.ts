import { db, usersTable, creditTransactionsTable } from '@workspace/db';
import { eq, sql, desc } from 'drizzle-orm';

export class Storage {
  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user ?? null;
  }

  async getAllUsers(limit = 100) {
    return db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(limit);
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

  async getCreditTransactions(userId: string, limit = 50) {
    return db
      .select()
      .from(creditTransactionsTable)
      .where(eq(creditTransactionsTable.userId, userId))
      .orderBy(desc(creditTransactionsTable.createdAt))
      .limit(limit);
  }

  async getAllTransactions(limit = 200) {
    return db
      .select()
      .from(creditTransactionsTable)
      .orderBy(desc(creditTransactionsTable.createdAt))
      .limit(limit);
  }

  async getStats() {
    const usersResult = await db.execute(sql`SELECT COUNT(*) as total_users, SUM(credits_balance) as total_credits FROM users`);
    const txResult = await db.execute(sql`SELECT COUNT(*) as total_tx, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as credits_issued FROM credit_transactions`);
    return {
      totalUsers: Number(usersResult.rows[0]?.total_users ?? 0),
      totalCreditsInCirculation: Number(usersResult.rows[0]?.total_credits ?? 0),
      totalTransactions: Number(txResult.rows[0]?.total_tx ?? 0),
      totalCreditsIssued: Number(txResult.rows[0]?.credits_issued ?? 0),
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
            credits: Number(r.metadata?.credits ?? 0), prices: [],
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
}

export const storage = new Storage();
