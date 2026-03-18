import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Coins, Star, Zap, Check, RefreshCw, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@workspace/replit-auth-web';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

interface CreditProduct {
  id: string;
  name: string;
  description: string;
  credits: number;
  prices: { id: string; unitAmount: number; currency: string }[];
}

interface BalanceData {
  balance: number;
  canClaimDaily: boolean;
  dailyAmount: number;
  nextClaimAt: string | null;
}

export default function Pricing() {
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const successParam = searchParams.get('success');
  const creditsParam = searchParams.get('credits');
  const cancelledParam = searchParams.get('cancelled');

  const fetchBalance = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(apiUrl('/credits/balance'), { credentials: 'include' });
      if (res.ok) setBalance(await res.json());
    } catch {}
  }, [isAuthenticated]);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/credits/products'));
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchBalance();
    fetchProducts();
  }, [fetchBalance, fetchProducts]);

  useEffect(() => {
    if (successParam && creditsParam) {
      const sessionId = searchParams.get('session_id');
      if (sessionId && isAuthenticated) {
        fetch(apiUrl('/credits/fulfill'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setMessage(`Payment successful! ${data.credits ?? creditsParam} credits added to your account.`);
            } else {
              setMessage(`Payment successful! ${creditsParam} credits will be added shortly.`);
            }
            fetchBalance();
          })
          .catch(() => {
            setMessage(`Payment successful! ${creditsParam} credits will be added shortly.`);
            fetchBalance();
          });
      } else {
        setMessage(`Payment successful! ${creditsParam} credits added to your account.`);
        fetchBalance();
      }
    } else if (cancelledParam) {
      setMessage('Payment cancelled. No charges were made.');
    }
  }, [successParam, creditsParam, cancelledParam, fetchBalance, isAuthenticated]);

  const claimDaily = async () => {
    if (!balance?.canClaimDaily) return;
    setClaiming(true);
    try {
      const res = await fetch(apiUrl('/credits/claim-daily'), { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Claimed ${data.claimed} free credits! New balance: ${data.balance}`);
        await fetchBalance();
      } else {
        setMessage(data.error ?? 'Could not claim credits');
      }
    } catch {
      setMessage('Network error. Try again.');
    } finally {
      setClaiming(false);
    }
  };

  const startCheckout = async (priceId: string, credits: number) => {
    if (!isAuthenticated) { login(); return; }
    setCheckoutLoading(priceId);
    try {
      const res = await fetch(apiUrl('/credits/checkout'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, credits }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setMessage(data.error ?? 'Failed to start checkout');
        setCheckoutLoading(null);
      }
    } catch {
      setMessage('Network error. Try again.');
      setCheckoutLoading(null);
    }
  };

  const fmtAmount = (unitAmount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(unitAmount / 100);
  };

  const staticPlans = [
    { name: 'Starter', credits: 10, price: '$1.99', icon: '⚡', highlight: false, description: 'Perfect for occasional use' },
    { name: 'Pro', credits: 50, price: '$7.99', icon: '🚀', highlight: true, description: 'Best value for regular users' },
    { name: 'Power', credits: 200, price: '$24.99', icon: '👑', highlight: false, description: 'For heavy usage and teams' },
  ];

  const displayProducts = products.length > 0 ? products : null;

  return (
    <div className="min-h-screen pb-24">
      <header className="pt-16 pb-10 px-6 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-5 ring-1 ring-primary/20">
          <Coins className="w-4 h-4" />
          <span className="text-sm font-semibold uppercase tracking-wide">Credits System</span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-extrabold mb-4">
          Simple, Transparent <span className="text-gradient">Pricing</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="text-muted-foreground text-lg">
          2 free credits every day. Buy more anytime. 1 credit = 1 image processed.
        </motion.p>
      </header>

      <div className="max-w-5xl mx-auto px-4 space-y-8">
        {message && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl px-6 py-4 text-center font-medium ${
              message.includes('success') || message.includes('Claimed')
                ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                : 'bg-orange-500/10 text-orange-600 border border-orange-500/20'
            }`}>
            {message}
          </motion.div>
        )}

        {!authLoading && !isAuthenticated && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-8 text-center space-y-4">
            <LogIn className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Sign in to manage credits</h2>
            <p className="text-muted-foreground">Log in to claim your free daily credits and purchase more.</p>
            <Button onClick={login} size="lg" className="gap-2">
              <LogIn className="w-4 h-4" /> Log In
            </Button>
          </motion.div>
        )}

        {isAuthenticated && balance && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="grid sm:grid-cols-2 gap-4">
            <div className="glass-panel rounded-2xl p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Coins className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Your Balance</p>
                <p className="text-3xl font-extrabold text-foreground">{balance.balance}</p>
                <p className="text-xs text-muted-foreground">credits remaining</p>
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Daily Free Credits</p>
                <p className="text-2xl font-bold">+{balance.dailyAmount} per day</p>
                {!balance.canClaimDaily && balance.nextClaimAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Next claim: {new Date(balance.nextClaimAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
              <Button onClick={claimDaily} disabled={!balance.canClaimDaily || claiming}
                variant={balance.canClaimDaily ? 'default' : 'outline'}
                className="gap-2 shrink-0">
                {claiming ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {balance.canClaimDaily ? 'Claim Free' : 'Claimed'}
              </Button>
            </div>
          </motion.div>
        )}

        <div>
          <h2 className="text-2xl font-bold text-center mb-6">Buy Credits</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {(displayProducts
              ? displayProducts.map((p, i) => ({
                  name: p.name,
                  credits: p.credits,
                  price: p.prices[0] ? fmtAmount(p.prices[0].unitAmount, p.prices[0].currency) : 'N/A',
                  icon: i === 0 ? '⚡' : i === 1 ? '🚀' : '👑',
                  highlight: i === 1,
                  description: p.description ?? '',
                  priceId: p.prices[0]?.id,
                }))
              : staticPlans.map(p => ({ ...p, priceId: null }))
            ).map((plan, i) => (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`glass-panel rounded-2xl p-6 flex flex-col gap-4 relative ${
                  plan.highlight ? 'ring-2 ring-primary' : ''
                }`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" /> Most Popular
                  </div>
                )}
                <div className="text-3xl">{plan.icon}</div>
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <div className="my-2">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                </div>
                <ul className="space-y-2 flex-1">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    <span><strong>{plan.credits}</strong> credits</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Never expires</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    <span>All tools included</span>
                  </li>
                </ul>
                <Button
                  onClick={() => plan.priceId ? startCheckout(plan.priceId, plan.credits) : login()}
                  disabled={checkoutLoading === plan.priceId}
                  variant={plan.highlight ? 'default' : 'outline'}
                  className="w-full gap-2 mt-2">
                  {checkoutLoading === plan.priceId ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  {!isAuthenticated ? 'Log in to Buy' : plan.priceId ? 'Buy Now' : 'Coming Soon'}
                </Button>
              </motion.div>
            ))}
          </div>
          {!displayProducts && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Stripe not configured yet — pricing is illustrative. Connect Stripe to enable purchases.
            </p>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-8">
          <h3 className="text-lg font-bold mb-4 text-center">How credits work</h3>
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            {[
              { icon: '🎁', title: '2 Free Daily', desc: 'Every day you get 2 free credits to use on any tool.' },
              { icon: '🖼️', title: '1 Credit = 1 Image', desc: 'Each image processed (BG remove, watermark, enhance) costs 1 credit.' },
              { icon: '♾️', title: 'Credits Never Expire', desc: 'Purchased credits stay in your account forever.' },
            ].map(item => (
              <div key={item.title} className="space-y-2">
                <div className="text-3xl">{item.icon}</div>
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
