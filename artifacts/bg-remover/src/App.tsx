import { useState, useEffect, useCallback } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { LogIn, LogOut, Coins, ShieldCheck, RefreshCw } from "lucide-react";
import Home from "./pages/Home";
import WatermarkRemover from "./pages/WatermarkRemover";
import ImageEnhancer from "./pages/ImageEnhancer";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
function apiUrl(path: string) { return `${BASE}/api${path}`; }

function CreditsButton() {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [open, setOpen] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(apiUrl('/credits/balance'), { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setBalance(d.balance);
        setCanClaim(d.canClaimDaily);
      }
    } catch {}
  }, [isAuthenticated]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const claim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setClaiming(true);
    try {
      const res = await fetch(apiUrl('/credits/claim-daily'), { method: 'POST', credentials: 'include' });
      if (res.ok) { await fetch_(); }
    } catch {}
    setClaiming(false);
    setOpen(false);
  };

  if (!isAuthenticated || balance === null) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors">
        <Coins className="w-3.5 h-3.5" />
        {balance}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 bg-background border border-border rounded-xl shadow-xl p-4 w-56 space-y-3">
            <p className="text-sm font-semibold">Credits: <span className="text-primary">{balance}</span></p>
            {canClaim && (
              <button onClick={claim} disabled={claiming}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg px-3 py-2 hover:opacity-90 transition-opacity">
                {claiming ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
                Claim 2 Free Credits
              </button>
            )}
            <Link href="/pricing" onClick={() => setOpen(false)}
              className="block text-center text-xs text-primary hover:underline">
              Buy more credits
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Nav() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  const tabs = [
    { href: "/", label: "BG Remover" },
    { href: "/watermark", label: "Watermark" },
    { href: "/enhance", label: "Enhance" },
    { href: "/pricing", label: "Pricing" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 h-14">
        <span className="font-bold text-foreground mr-3 text-sm tracking-tight shrink-0">Image Tools</span>
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-1">
          {tabs.map((t) => {
            const active = t.href === "/" ? location === "/" : location.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}>
                {t.label}
              </Link>
            );
          })}
          <Link href="/admin"
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
              location.startsWith('/admin') ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>
            <ShieldCheck className="w-3.5 h-3.5" /> Admin
          </Link>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <CreditsButton />
          {!isLoading && (
            isAuthenticated ? (
              <button onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {user?.firstName ?? user?.email?.split('@')[0] ?? 'Account'}
                </span>
              </button>
            ) : (
              <button onClick={login}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                <LogIn className="w-3.5 h-3.5" /> Log In
              </button>
            )
          )}
        </div>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <>
      <Nav />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/watermark" component={WatermarkRemover} />
        <Route path="/enhance" component={ImageEnhancer} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
