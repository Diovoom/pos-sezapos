import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/hardware", label: "Hardware" },
  { to: "/contact", label: "Contact" },
  { to: "/support", label: "Support" },
] as const;

export function MarketingShell({ children }: { children: ReactNode }) {
  const { session } = useSession();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="font-bold text-lg shrink-0">SEZA POS</Link>
          <nav className="hidden md:flex items-center gap-5 text-sm">
            {NAV_LINKS.filter((l) => l.to !== "/").map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Button asChild size="sm"><Link to="/dashboard">Open Dashboard</Link></Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost"><Link to="/auth">Sign In</Link></Button>
                <Button asChild size="sm"><Link to="/signup">Get Started</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <div className="font-bold">SEZA POS</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Modern cloud point-of-sale for convenience, liquor, and specialty retail.
            </p>
          </div>
          <div>
            <div className="font-semibold mb-2">Product</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><Link to="/hardware" className="hover:text-foreground">Hardware</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2">Company</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
              <li><Link to="/support" className="hover:text-foreground">Support</Link></li>
              <li><a href="mailto:support@sezapos.com" className="hover:text-foreground">support@sezapos.com</a></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2">Legal</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
              <li><Link to="/refund" className="hover:text-foreground">Refunds</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t">
          <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} SEZA TECHNOLOGIES. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
