import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, ArrowLeftRight, CreditCard, Settings, ShieldCheck,
  RefreshCw, LogOut, Search, ChevronRight, ChevronLeft, Coins, TrendingUp,
  TrendingDown, UserPlus, Activity, Clock, Eye, Trash2, RotateCcw,
  Plus, Minus, CheckCircle2, XCircle, Server, Database, Zap, Download,
  ArrowUpRight, ArrowDownRight, Lock, User as UserIcon, DollarSign, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import AdminLogin from './AdminLogin';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
function apiUrl(path: string) { return `${BASE}/api${path}`; }

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(apiUrl(path), { credentials: 'include', ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function formatDateTime(d: string) { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function formatBytes(b: number) { return `${(b / 1024 / 1024).toFixed(1)} MB`; }
function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

type Section = 'dashboard' | 'users' | 'transactions' | 'revenue' | 'settings';

interface StatCard {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  change?: string;
  changeDir?: 'up' | 'down' | 'neutral';
}

export default function Admin() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [section, setSection] = useState<Section>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const data = await api('/admin/session');
      setIsAdmin(data.authenticated === true);
    } catch {}
    setAuthChecked(true);
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const handleLogout = async () => {
    await api('/admin/logout-admin', { method: 'POST' });
    setIsAdmin(false);
  };

  if (!authChecked) return <div className="flex items-center justify-center min-h-screen text-muted-foreground gap-2"><RefreshCw className="w-5 h-5 animate-spin" /> Loading…</div>;
  if (!isAdmin) return <AdminLogin onSuccess={() => setIsAdmin(true)} />;

  const navItems: { id: Section; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'revenue', label: 'Revenue & Stripe', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 64 }}
        className="border-r border-border/50 bg-muted/20 flex flex-col shrink-0 sticky top-0 h-screen z-30"
      >
        <div className="p-4 flex items-center gap-2 border-b border-border/50 h-14">
          <ShieldCheck className="w-6 h-6 text-primary shrink-0" />
          {sidebarOpen && <span className="font-bold text-sm truncate">Admin Panel</span>}
        </div>
        <nav className="flex-1 py-2 space-y-0.5 px-2">
          {navItems.map(n => (
            <button key={n.id} onClick={() => setSection(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                section === n.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}>
              <n.icon className="w-4.5 h-4.5 shrink-0" />
              {sidebarOpen && <span className="truncate">{n.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-border/50 space-y-1">
          <button onClick={() => setSidebarOpen(o => !o)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            {sidebarOpen ? <ChevronLeft className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            {sidebarOpen && 'Collapse'}
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <LogOut className="w-4 h-4 shrink-0" />
            {sidebarOpen && 'Sign Out'}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {section === 'dashboard' && <DashboardSection />}
            {section === 'users' && <UsersSection />}
            {section === 'transactions' && <TransactionsSection />}
            {section === 'revenue' && <RevenueSection />}
            {section === 'settings' && <SettingsSection />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
function DashboardSection() {
  const [data, setData] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([api('/admin/dashboard'), api('/admin/trends?days=14')]);
      setData(d);
      setTrends(t.trends ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingPane />;
  if (!data) return <ErrorPane onRetry={load} />;

  const cards: StatCard[] = [
    { label: 'Total Users', value: data.totalUsers, icon: Users, color: 'text-blue-500', change: `+${data.newUsersToday} today`, changeDir: data.newUsersToday > 0 ? 'up' : 'neutral' },
    { label: 'Credits Circulating', value: data.totalCreditsInCirculation, icon: Coins, color: 'text-yellow-500' },
    { label: 'Total Transactions', value: data.totalTransactions, icon: Activity, color: 'text-green-500', change: `+${data.transactionsToday} today`, changeDir: data.transactionsToday > 0 ? 'up' : 'neutral' },
    { label: 'Credits Issued', value: data.totalCreditsIssued, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Purchases', value: data.totalPurchases, icon: CreditCard, color: 'text-indigo-500' },
    { label: 'Credits Used', value: data.totalCreditsUsed, icon: Zap, color: 'text-orange-500' },
    { label: 'Daily Claims', value: data.totalDailyClaims, icon: Clock, color: 'text-cyan-500' },
    { label: 'New This Month', value: data.newUsersMonth, icon: UserPlus, color: 'text-emerald-500' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <SectionHeader title="Dashboard" subtitle="Platform overview and key metrics" onRefresh={load} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="bg-card border border-border/50 rounded-2xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <p className="text-2xl font-extrabold">{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</p>
            {c.change && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
                c.changeDir === 'up' ? 'text-green-600' : c.changeDir === 'down' ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                {c.changeDir === 'up' ? <ArrowUpRight className="w-3 h-3" /> : c.changeDir === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
                {c.change}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Trends Chart */}
      {trends.length > 0 && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">14-Day Trends</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCredits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }} labelFormatter={formatDate} />
              <Legend />
              <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#6366f1" fill="url(#gradUsers)" strokeWidth={2} />
              <Area type="monotone" dataKey="creditsGranted" name="Credits Granted" stroke="#22c55e" fill="url(#gradCredits)" strokeWidth={2} />
              <Area type="monotone" dataKey="creditsUsed" name="Credits Used" stroke="#f59e0b" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {(data.recentActivity ?? []).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors text-sm">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                  a.type === 'purchase' ? 'bg-indigo-500' : a.type === 'daily' ? 'bg-green-500' : a.type === 'use' ? 'bg-orange-500' : 'bg-gray-500'
                }`}>
                  {a.amount > 0 ? '+' : ''}{a.amount}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.first_name ?? a.email ?? a.user_id?.slice(0, 10)}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.description ?? a.type}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
            {(data.recentActivity ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activity yet</p>}
          </div>
        </div>

        {/* Top Users */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3">Top Users by Credits</h3>
          <div className="space-y-2">
            {(data.topUsers ?? []).map((u: any, i: number) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Anonymous'}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email ?? u.id.slice(0, 16)}</p>
                </div>
                <span className="text-sm font-bold text-primary">{Number(u.credits_balance).toLocaleString()}</span>
              </div>
            ))}
            {(data.topUsers ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No users yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   USERS
   ═══════════════════════════════════════════════════════════ */
function UsersSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [creditModal, setCreditModal] = useState<any>(null);
  const [creditAmt, setCreditAmt] = useState('10');
  const [creditDesc, setCreditDesc] = useState('Admin grant');
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const d = await api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setUsers(d.users ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doSearch = () => { load(search); };

  const loadUser = async (id: string) => {
    try {
      const u = await api(`/admin/users/${id}`);
      setSelectedUser(u);
    } catch {}
  };

  const grantCredits = async () => {
    if (!creditModal) return;
    setActionLoading(true);
    try {
      const d = await api(`/admin/users/${creditModal.id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(creditAmt), description: creditDesc }),
      });
      setMsg(`Credits updated. New balance: ${d.balance}`);
      setCreditModal(null);
      load(search);
      if (selectedUser?.id === creditModal.id) loadUser(creditModal.id);
    } catch (e: any) { setMsg(e.message); }
    setActionLoading(false);
  };

  const toggleAdmin = async (id: string) => {
    setActionLoading(true);
    try {
      await api(`/admin/users/${id}/toggle-admin`, { method: 'POST' });
      setMsg('Admin status toggled');
      load(search);
      if (selectedUser?.id === id) loadUser(id);
    } catch {}
    setActionLoading(false);
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Are you sure? This deletes the user and all their transactions.')) return;
    try {
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      setMsg('User deleted');
      setSelectedUser(null);
      load(search);
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <SectionHeader title="User Management" subtitle={`${users.length} total users`} onRefresh={() => load(search)} />
      {msg && <AlertBar message={msg} onDismiss={() => setMsg(null)} />}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search by name, email, or ID…"
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <Button onClick={doSearch} variant="outline" className="gap-2"><Search className="w-4 h-4" /> Search</Button>
      </div>

      <div className="flex gap-6">
        {/* User Table */}
        <div className={`bg-card border border-border/50 rounded-2xl overflow-hidden ${selectedUser ? 'flex-1' : 'w-full'}`}>
          {loading ? <div className="p-8 text-center text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin inline" /> Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Credits</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Joined</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No users found</td></tr>}
                  {users.map(u => (
                    <tr key={u.id} className={`border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors ${selectedUser?.id === u.id ? 'bg-primary/5' : ''}`}
                      onClick={() => loadUser(u.id)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Anonymous'}</p>
                        <p className="text-xs text-muted-foreground">{u.email ?? u.id.slice(0, 16)}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold">{u.creditsBalance}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.isAdmin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {u.isAdmin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setCreditModal(u); setCreditAmt('10'); setCreditDesc('Admin grant'); }}>
                            <Coins className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleAdmin(u.id)} disabled={actionLoading}>
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteUser(u.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* User Detail Panel */}
        <AnimatePresence>
          {selectedUser && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="w-[360px] shrink-0 bg-card border border-border/50 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-border/50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold">{[selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') || 'Anonymous'}</h3>
                  <p className="text-xs text-muted-foreground">{selectedUser.email ?? selectedUser.id}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedUser(null)}>
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold text-primary">{selectedUser.creditsBalance}</p>
                    <p className="text-xs text-muted-foreground">Credits</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold">{selectedUser.transactions?.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Transactions</p>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-mono text-xs">{selectedUser.id.slice(0, 20)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className={selectedUser.isAdmin ? 'text-primary font-medium' : ''}>{selectedUser.isAdmin ? 'Admin' : 'User'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{formatDate(selectedUser.createdAt)}</span></div>
                  {selectedUser.stripeCustomerId && <div className="flex justify-between"><span className="text-muted-foreground">Stripe</span><span className="font-mono text-xs">{selectedUser.stripeCustomerId.slice(0, 16)}</span></div>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => { setCreditModal(selectedUser); setCreditAmt('10'); setCreditDesc('Admin grant'); }}>
                    <Coins className="w-3 h-3" /> Credits
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => toggleAdmin(selectedUser.id)} disabled={actionLoading}>
                    <ShieldCheck className="w-3 h-3" /> {selectedUser.isAdmin ? 'Demote' : 'Promote'}
                  </Button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Transactions</p>
                  <div className="space-y-1 max-h-[220px] overflow-y-auto">
                    {(selectedUser.transactions ?? []).slice(0, 20).map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/30 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
                          <span className="text-muted-foreground truncate">{tx.description ?? tx.type}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0 ml-2">{formatDate(tx.createdAt)}</span>
                      </div>
                    ))}
                    {(selectedUser.transactions ?? []).length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No transactions</p>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Credit Modal */}
      {creditModal && (
        <Modal onClose={() => setCreditModal(null)} title="Adjust Credits" subtitle={[creditModal.firstName, creditModal.lastName].filter(Boolean).join(' ') || creditModal.email || creditModal.id}>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Amount (negative to deduct)</label>
              <input type="number" value={creditAmt} onChange={e => setCreditAmt(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reason</label>
              <input type="text" value={creditDesc} onChange={e => setCreditDesc(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={() => setCreditModal(null)} variant="outline" className="flex-1">Cancel</Button>
            <Button onClick={grantCredits} disabled={actionLoading} className="flex-1 gap-2">
              {actionLoading && <RefreshCw className="w-4 h-4 animate-spin" />} Apply
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TRANSACTIONS
   ═══════════════════════════════════════════════════════════ */
function TransactionsSection() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (type = 'all') => {
    setLoading(true);
    try {
      const d = await api(`/admin/transactions?limit=500${type !== 'all' ? `&type=${type}` : ''}`);
      setTransactions(d.transactions ?? []);
      setBreakdown(d.breakdown ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(typeFilter); }, [load, typeFilter]);

  const types = ['all', ...breakdown.map(b => b.type)];

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <SectionHeader title="Transactions" subtitle={`${transactions.length} records`} onRefresh={() => load(typeFilter)} />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Breakdown chart */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold mb-3">Breakdown by Type</h3>
          {breakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={breakdown} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={3}>
                    {breakdown.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {breakdown.map((b, i) => (
                  <div key={b.type} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="capitalize">{b.type}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground">{b.count} tx</span>
                      <span className={`font-medium ${b.total >= 0 ? 'text-green-600' : 'text-red-500'}`}>{b.total > 0 ? '+' : ''}{b.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
        </div>

        {/* Transaction table */}
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-border/50 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold">Transaction Log</h3>
            <div className="flex gap-1">
              {types.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    typeFilter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {loading ? <div className="p-8 text-center text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin inline" /></div> : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="bg-muted/30 border-b border-border/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">User</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No transactions</td></tr>}
                  {transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{tx.userId.slice(0, 14)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <TypeBadge type={tx.type} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{tx.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   REVENUE & STRIPE
   ═══════════════════════════════════════════════════════════ */
function RevenueSection() {
  const [revenue, setRevenue] = useState<any>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([api('/admin/revenue'), api('/admin/stripe/status')]);
      setRevenue(r);
      setStripe(s);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingPane />;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <SectionHeader title="Revenue & Stripe" subtitle="Payment analytics and integration status" onRefresh={load} />

      {/* Stripe Status */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatusCard icon={CreditCard} label="Stripe Connected" ok={stripe?.connected} detail={stripe?.connected ? 'API key configured' : 'STRIPE_SECRET_KEY not set'} />
        <StatusCard icon={Activity} label="Webhook Configured" ok={stripe?.webhookConfigured} detail={stripe?.webhookConfigured ? 'Webhook secret set' : 'STRIPE_WEBHOOK_SECRET not set'} />
        <StatusCard icon={BarChart3} label="Products" ok={stripe?.productCount > 0} detail={`${stripe?.productCount ?? 0} active products`} />
      </div>

      {/* Revenue Stats */}
      {revenue && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-green-500" /><span className="text-xs text-muted-foreground font-medium">Total Purchases</span></div>
            <p className="text-3xl font-extrabold">{revenue.totalPurchases}</p>
            <p className="text-sm text-muted-foreground">{revenue.totalCredits.toLocaleString()} credits purchased</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-indigo-500" /><span className="text-xs text-muted-foreground font-medium">Avg Credits per Purchase</span></div>
            <p className="text-3xl font-extrabold">{revenue.totalPurchases > 0 ? Math.round(revenue.totalCredits / revenue.totalPurchases) : 0}</p>
          </div>
        </div>
      )}

      {/* Revenue Chart */}
      {revenue?.daily?.length > 0 && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4">30-Day Purchase Activity</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenue.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)' }} labelFormatter={formatDate} />
              <Bar dataKey="purchases" name="Purchases" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="credits" name="Credits Purchased" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stripe Products */}
      {stripe?.products?.length > 0 && (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-3">Stripe Products</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {stripe.products.map((p: any) => (
              <div key={p.id} className="border border-border/50 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold">{p.name}</h4>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">{p.credits} credits</span>
                  {p.prices?.[0] && <span className="text-sm">${(p.prices[0].unitAmount / 100).toFixed(2)}</span>}
                </div>
                <p className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 24)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!stripe?.connected && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center space-y-2">
          <CreditCard className="w-10 h-10 text-orange-500 mx-auto" />
          <p className="font-semibold text-orange-700">Stripe Not Connected</p>
          <p className="text-sm text-muted-foreground">Add your Stripe integration to enable credit purchases. Set <code className="bg-muted px-1 rounded">STRIPE_SECRET_KEY</code> in environment variables.</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════════════════ */
function SettingsSection() {
  const [system, setSystem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPw, setCurrentPw] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [credMsg, setCredMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSystem(await api('/admin/system')); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw) { setCredMsg('Enter current password'); return; }
    setSaving(true);
    try {
      const d = await api('/admin/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPassword || undefined, newUsername: newUsername || undefined }),
      });
      setCredMsg(d.message);
      setCurrentPw('');
      setNewPassword('');
      setNewUsername('');
    } catch (e: any) { setCredMsg(e.message); }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <SectionHeader title="Settings" subtitle="System configuration and health" onRefresh={load} />

      {/* System Health */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Server className="w-4 h-4" /> System Health</h3>
        {loading ? <div className="text-center text-muted-foreground py-4"><RefreshCw className="w-4 h-4 animate-spin inline" /></div> : system ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <InfoRow label="Environment" value={system.environment} />
            <InfoRow label="Node.js" value={system.nodeVersion} />
            <InfoRow label="Uptime" value={formatUptime(system.uptime)} />
            <InfoRow label="Memory (RSS)" value={formatBytes(system.memoryUsage?.rss ?? 0)} />
            <InfoRow label="Memory (Heap)" value={`${formatBytes(system.memoryUsage?.heapUsed ?? 0)} / ${formatBytes(system.memoryUsage?.heapTotal ?? 0)}`} />
            <InfoRow label="Database" value={system.dbConnected ? 'Connected' : 'Disconnected'} ok={system.dbConnected} />
            <InfoRow label="Stripe" value={system.stripeConnected ? 'Connected' : 'Not Connected'} ok={system.stripeConnected} />
            <InfoRow label="Webhook" value={system.stripeWebhook ? 'Configured' : 'Not Set'} ok={system.stripeWebhook} />
            <InfoRow label="Total Users" value={String(system.totalUsers)} />
            <InfoRow label="Total Transactions" value={String(system.totalTransactions)} />
            <InfoRow label="Admin User" value={system.adminUsername} />
            <InfoRow label="DB Server Time" value={system.dbTime ? new Date(system.dbTime).toLocaleString() : 'N/A'} />
          </div>
        ) : <p className="text-sm text-muted-foreground">Failed to load system info</p>}
      </div>

      {/* Admin Credentials */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Lock className="w-4 h-4" /> Admin Credentials</h3>
        <p className="text-xs text-muted-foreground">Changes apply for the current server session. Update environment variables (<code className="bg-muted px-1 rounded text-[10px]">ADMIN_USERNAME</code>, <code className="bg-muted px-1 rounded text-[10px]">ADMIN_PASSWORD</code>) for permanent changes.</p>
        {credMsg && <AlertBar message={credMsg} onDismiss={() => setCredMsg(null)} />}
        <form onSubmit={updateCreds} className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium mb-1 block">Current Password *</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">New Username (optional)</label>
            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Leave empty to keep current"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">New Password (optional)</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave empty to keep current"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />} Update Credentials
          </Button>
        </form>
      </div>

      {/* Quick Reference */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4" /> Environment Variables</h3>
        <div className="space-y-1.5 text-xs">
          {[
            { key: 'ADMIN_USERNAME', desc: 'Admin login username' },
            { key: 'ADMIN_PASSWORD', desc: 'Admin login password' },
            { key: 'ADMIN_COOKIE_SECRET', desc: 'Cookie signing secret' },
            { key: 'STRIPE_SECRET_KEY', desc: 'Stripe API secret key' },
            { key: 'STRIPE_WEBHOOK_SECRET', desc: 'Stripe webhook signing secret' },
            { key: 'DATABASE_URL', desc: 'PostgreSQL connection string' },
          ].map(v => (
            <div key={v.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <code className="font-mono text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">{v.key}</code>
              <span className="text-muted-foreground">{v.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function SectionHeader({ title, subtitle, onRefresh }: { title: string; subtitle: string; onRefresh: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-extrabold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Button onClick={onRefresh} variant="outline" size="sm" className="gap-2">
        <RefreshCw className="w-3.5 h-3.5" /> Refresh
      </Button>
    </div>
  );
}

function LoadingPane() {
  return <div className="flex items-center justify-center h-[60vh] text-muted-foreground gap-2"><RefreshCw className="w-5 h-5 animate-spin" /> Loading…</div>;
}

function ErrorPane({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
      <XCircle className="w-10 h-10 text-muted-foreground" />
      <p className="text-muted-foreground">Failed to load data</p>
      <Button onClick={onRetry} variant="outline">Retry</Button>
    </div>
  );
}

function AlertBar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const isError = message.toLowerCase().includes('error') || message.toLowerCase().includes('incorrect') || message.toLowerCase().includes('fail');
  return (
    <div className={`rounded-xl px-4 py-2.5 text-sm flex justify-between items-center ${
      isError ? 'bg-destructive/10 border border-destructive/20 text-destructive' : 'bg-green-500/10 border border-green-500/20 text-green-600'
    }`}>
      {message}
      <button onClick={onDismiss} className="ml-3 opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

function Modal({ onClose, title, subtitle, children }: { onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm space-y-3">
        <h3 className="text-lg font-bold">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {children}
      </motion.div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    purchase: 'bg-indigo-500/10 text-indigo-600',
    daily: 'bg-green-500/10 text-green-600',
    use: 'bg-orange-500/10 text-orange-600',
    admin_grant: 'bg-purple-500/10 text-purple-600',
    refund: 'bg-red-500/10 text-red-500',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[type] ?? 'bg-muted text-muted-foreground'}`}>{type.replace('_', ' ')}</span>;
}

function StatusCard({ icon: Icon, label, ok, detail }: { icon: any; label: string; ok: boolean; detail: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ok ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
        <Icon className={`w-5 h-5 ${ok ? 'text-green-500' : 'text-orange-500'}`} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-orange-500" />}
        </div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-muted/20 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${ok === true ? 'text-green-600' : ok === false ? 'text-orange-500' : ''}`}>{value}</span>
    </div>
  );
}
