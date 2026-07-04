import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { LEGAL_CONFIG } from "@/lib/legal/config";

const PRIMARY_NAV = [
  { to: "/features", label: "Features" },
  { to: "/industries", label: "Industries" },
  { to: "/pricing", label: "Pricing" },
  { to: "/hardware", label: "Hardware" },
  { to: "/integrations", label: "Integrations" },
  { to: "/security", label: "Security" },
  { to: "/about", label: "Company" },
] as const;

export function MarketingShell({ children }: { children: ReactNode }) {
  const { session } = useSession();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="font-bold text-lg shrink-0">SEZA POS</Link>
          <nav className="hidden lg:flex items-center gap-5 text-sm">
            {PRIMARY_NAV.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="max-w-6xl mx-auto px-6 py-12 grid gap-10 md:grid-cols-2 lg:grid-cols-5 text-sm">
          <div className="lg:col-span-1">
            <div className="font-bold">SEZA POS</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Modern cloud point of sale for convenience, liquor, and specialty retail.
            </p>
          </div>
          <div>
            <div className="font-semibold mb-2">Product</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground">Features</Link></li>
              <li><Link to="/industries" className="hover:text-foreground">Industries</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><Link to="/hardware" className="hover:text-foreground">Hardware</Link></li>
              <li><Link to="/integrations" className="hover:text-foreground">Integrations</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2">Company</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/about" className="hover:text-foreground">About</Link></li>
              <li><Link to="/blog" className="hover:text-foreground">Blog</Link></li>
              <li><Link to="/careers" className="hover:text-foreground">Careers</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2">Trust & Support</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/trust" className="hover:text-foreground">Trust Center</Link></li>
              <li><Link to="/security" className="hover:text-foreground">Security</Link></li>
              <li><Link to="/status" className="hover:text-foreground">System Status</Link></li>
              <li><Link to="/support" className="hover:text-foreground">Support</Link></li>
              <li><Link to="/faq" className="hover:text-foreground">FAQ</Link></li>
              <li><a href={`mailto:${LEGAL_CONFIG.supportEmail}`} className="hover:text-foreground">{LEGAL_CONFIG.supportEmail}</a></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2">Legal</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/legal" className="hover:text-foreground font-medium text-foreground">Legal Center</Link></li>
              <li><Link to="/legal/$slug" params={{ slug: "terms" }} className="hover:text-foreground">Terms</Link></li>
              <li><Link to="/legal/$slug" params={{ slug: "privacy" }} className="hover:text-foreground">Privacy</Link></li>
              <li><Link to="/legal/$slug" params={{ slug: "cookies" }} className="hover:text-foreground">Cookies</Link></li>
              <li><Link to="/legal/$slug" params={{ slug: "refund" }} className="hover:text-foreground">Refunds</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t">
          <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-muted-foreground flex flex-wrap justify-between gap-3">
            <span>© {new Date().getFullYear()} {LEGAL_CONFIG.companyName}. All rights reserved.</span>
            <span>Payments processed by {LEGAL_CONFIG.merchantOfRecord}.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
