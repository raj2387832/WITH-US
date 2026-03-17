import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home";
import WatermarkRemover from "./pages/WatermarkRemover";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

function Nav() {
  const [location] = useLocation();
  const tabs = [
    { href: "/", label: "Background Remover" },
    { href: "/watermark", label: "Watermark Remover" },
  ];
  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 h-14">
        <span className="font-bold text-foreground mr-4 text-sm tracking-tight">Image Tools</span>
        {tabs.map((t) => {
          const active = t.href === "/" ? location === "/" : location.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
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
