import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShoppingCart, BarChart3, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SEZA POS — Modern Cloud Point of Sale for Retail" },
      { name: "description", content: "SEZA POS is a modern cloud point-of-sale for convenience stores, mini marts, liquor and retail. Fast checkout, inventory, employees, and reports. 14-day free trial." },
      { property: "og:title", content: "SEZA POS — Modern Cloud POS for Retail" },
      { property: "og:description", content: "Fast checkout, inventory, employees, and reports. Start a 14-day free trial." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/" }],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { session } = useSession();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">SEZA POS</Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground hidden sm:inline">Terms</Link>
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground hidden sm:inline">Privacy</Link>
            {session ? (
              <Button asChild size="sm"><Link to="/pos">Open app</Link></Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="ghost"><Link to="/auth">Sign in</Link></Button>
                <Button asChild size="sm"><Link to="/signup">Sign up</Link></Button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            The modern cloud POS for retail
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            SEZA POS gives convenience stores, mini marts, liquor stores and specialty retailers a fast, reliable point of sale — with inventory, employees, and reports built in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg"><Link to="/signup">Start free trial</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">14-day free trial. No credit card required.</p>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-20 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShoppingCart, title: "Fast checkout", body: "Barcode scanning, custom items, discounts, and card + cash." },
            { icon: BarChart3, title: "Real-time reports", body: "Daily and weekly sales, shift summaries, and inventory insights." },
            { icon: Users, title: "Employees & shifts", body: "Roles, PIN sign-in, clock in/out, and payroll-ready reports." },
            { icon: Shield, title: "Secure & cloud-based", body: "Your data is encrypted, backed up, and available on any device." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="border-t bg-muted/30">
          <div className="max-w-6xl mx-auto px-6 py-16 grid gap-8 md:grid-cols-2 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Everything a modern store needs</h2>
              <p className="mt-3 text-muted-foreground">One system for checkout, inventory, employees, and analytics — priced simply, with a free trial to get started.</p>
              <div className="mt-6"><Button asChild><Link to="/pricing">See plans and pricing</Link></Button></div>
            </div>
            <ul className="space-y-2 text-sm">
              {[
                "Cash and card payments via terminal integration",
                "Barcode scanning and quick custom items",
                "Per-item and per-cart discounts",
                "Inventory alerts and variant tracking",
                "Shift tracking and role-based permissions",
                "Cloud backup and multi-device access",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} SEZA TECHNOLOGIES. All rights reserved.</div>
          <nav className="flex flex-wrap gap-5">
            <Link to="/pricing">Pricing</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refund">Refund Policy</Link>
            <Link to="/privacy">Privacy</Link>
            <a href="mailto:support@sezapos.com">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
