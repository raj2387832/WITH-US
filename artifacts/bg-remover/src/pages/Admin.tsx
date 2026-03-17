import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Activity, Coins, ShieldCheck, RefreshCw, Plus, Minus, TrendingUp, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminLogin from './AdminLogin';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
function apiUrl(path: string) { return `${BASE}/api${path}`; }

interface Stats {
  totalUsers: number;
  totalCreditsInCirculation: number;
  totalTransactions: number;
  totalCreditsIssued: number;
}

interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  creditsBalance: number;
  isAdmin: boolean;
  createdAt: string;
}

interface TxRow {
  id: number;
  userId: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export default function Admin() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [tab, setTab] = useState<'overview' | 'users' | 'transactions'>('overview');
  const [creditModal, setCreditModal] = useState<{ userId: string; name: string } | null>(null);
  const [creditAmount, setCreditAmount] = useState('10');
  const [creditDesc, setCreditDesc] = useState('Admin grant');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/admin/session'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIsAdminAuth(data.authenticated === true);
      }
    } catch {}
    setAuthChecked(true);
  }, []);

  const fetchData = useCallback(async () => {
    const [statsRes, usersRes, txRes] = await Promise.all([
      fetch(apiUrl('/admin/stats'), { credentials: 'include' }),
      fetch(apiUrl('/admin/users'), { credentials: 'include' }),
      fetch(apiUrl('/admin/transactions'), { credentials: 'include' }),
    ]);
    if (statsRes.ok) setStats(await statsRes.json());
    if (usersRes.ok) { const d = await usersRes.json(); setUsers(d.users ?? []); }
    if (txRes.ok) { const d = await txRes.json(); setTransactions(d.transactions ?? []); }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);
  useEffect(() => { if (isAdminAuth) fetchData(); }, [isAdminAuth, fetchData]);

  const handleLogout = async () => {
    await fetch(apiUrl('/admin/logout-admin'), { method: 'POST', credentials: 'include' });
    setIsAdminAuth(false);
    setStats(null);
    setUsers([]);
    setTransactions([]);
  };

  const grantCredits = async () => {
    if (!creditModal) return;
    setLoadingAction(true);
    try {
      const amount = Number(creditAmount);
      const res = await fetch(apiUrl(`/admin/users/${creditModal.userId}/credits`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description: creditDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Done! ${creditModal.name} now has ${data.balance} credits.`);
        setCreditModal(null);
        fetchData();
      } else {
        setActionMsg(data.error ?? 'Error');
      }
    } catch { setActionMsg('Network error'); }
    setLoadingAction(false);
  };

  const toggleAdmin = async (userId: string) => {
    setLoadingAction(true);
    try {
      const res = await fetch(apiUrl(`/admin/users/${userId}/toggle-admin`), {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) { setActionMsg('Admin status updated.'); fetchData(); }
    } catch {}
    setLoadingAction(false);
  };

  // Still checking session
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" /> Checking access…
      </div>
    );
  }

  // Not authenticated — show login form
  if (!isAdminAuth) {
    return <AdminLogin onSuccess={() => { setIsAdminAuth(true); }} />;
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="pt-12 pb-8 px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-primary" /> Admin Panel
            </h1>
            <p className="text-muted-foreground mt-1">Manage users, credits, and platform settings.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchData} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button onClick={handleLogout} variant="ghost" className="gap-2 text-muted-foreground">
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {actionMsg && (
        <div className="max-w-7xl mx-auto px-6 mb-4">
          <div className="rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 px-4 py-3 text-sm flex justify-between">
            {actionMsg}
            <button onClick={() => setActionMsg(null)} className="text-green-700 hover:opacity-70">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 space-y-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500' },
              { label: 'Credits in Circulation', value: stats.totalCreditsInCirculation, icon: Coins, color: 'text-yellow-500' },
              { label: 'Total Transactions', value: stats.totalTransactions, icon: Activity, color: 'text-green-500' },
              { label: 'Credits Issued', value: stats.totalCreditsIssued, icon: TrendingUp, color: 'text-purple-500' },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className="text-3xl font-extrabold">{s.value.toLocaleString()}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="flex gap-2 border-b border-border/50 pb-2">
          {(['overview', 'users', 'transactions'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && stats && (
          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <h3 className="font-semibold text-lg">Platform Overview</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-muted/30 rounded-xl p-4 space-y-1">
                <p className="text-muted-foreground">Average credits per user</p>
                <p className="text-xl font-bold">
                  {stats.totalUsers > 0 ? Math.round(stats.totalCreditsInCirculation / stats.totalUsers) : 0}
                </p>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 space-y-1">
                <p className="text-muted-foreground">Avg transactions per user</p>
                <p className="text-xl font-bold">
                  {stats.totalUsers > 0 ? Math.round(stats.totalTransactions / stats.totalUsers) : 0}
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border/50">
              <h3 className="font-semibold">{users.length} Users</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">User</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Credits</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Admin</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Joined</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users yet</td></tr>
                  )}
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Anonymous'}</p>
                          <p className="text-muted-foreground text-xs">{u.email ?? u.id.slice(0, 12) + '…'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${u.creditsBalance === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {u.creditsBalance}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.isAdmin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {u.isAdmin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                            onClick={() => { setCreditModal({ userId: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id }); setCreditAmount('10'); setCreditDesc('Admin grant'); }}>
                            <Coins className="w-3 h-3" /> Credits
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => toggleAdmin(u.id)} disabled={loadingAction}>
                            {u.isAdmin ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            {u.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border/50">
              <h3 className="font-semibold">{transactions.length} Recent Transactions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">User</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Amount</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Description</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No transactions yet</td></tr>
                  )}
                  {transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{tx.userId.slice(0, 12)}…</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          tx.type === 'purchase' ? 'bg-blue-500/10 text-blue-600' :
                          tx.type === 'daily' ? 'bg-green-500/10 text-green-600' :
                          tx.type === 'use' ? 'bg-orange-500/10 text-orange-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{tx.description ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {creditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold">Adjust Credits</h3>
            <p className="text-sm text-muted-foreground">User: <strong>{creditModal.name}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Amount (negative to deduct)</label>
                <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Reason</label>
                <input type="text" value={creditDesc} onChange={e => setCreditDesc(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setCreditModal(null)} variant="outline" className="flex-1">Cancel</Button>
              <Button onClick={grantCredits} disabled={loadingAction} className="flex-1 gap-2">
                {loadingAction && <RefreshCw className="w-4 h-4 animate-spin" />}
                Apply
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
