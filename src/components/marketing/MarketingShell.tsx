import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LEGAL_CONFIG } from "@/lib/legal/config";

type NavItem = { to: string; label: string };

const PRODUCT_ITEMS: NavItem[] = [
  { to: "/features", label: "Features" },
  { to: "/features", label: "Checkout" },
  { to: "/features", label: "Inventory" },
  { to: "/features", label: "Employees & shifts" },
  { to: "/features", label: "Reports" },
];

const INDUSTRY_ITEMS: NavItem[] = [
  { to: "/industries", label: "Convenience stores" },
  { to: "/industries", label: "Liquor stores" },
  { to: "/industries", label: "Mini marts & grocery" },
  { to: "/industries", label: "Specialty retail" },
];

const RESOURCE_ITEMS: NavItem[] = [
  { to: "/hardware", label: "Hardware compatibility" },
  { to: "/faq", label: "FAQ" },
  { to: "/security", label: "Security" },
  { to: "/support", label: "Support" },
];

function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 py-0.5">
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {items.map((it) => (
          <DropdownMenuItem asChild key={it.label}>
            <Link to={it.to} className="cursor-pointer">{it.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  // Marketing header is always public. Do not reflect any auth session here —
  // Merchant Dashboard, POS, and Platform Admin each own their own surface.

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="font-bold text-lg shrink-0">SEZA POS</Link>

          <nav className="hidden lg:flex items-center gap-6 text-sm" aria-label="Primary">
            <NavDropdown label="Product" items={PRODUCT_ITEMS} />
            <NavDropdown label="Industries" items={INDUSTRY_ITEMS} />
            <Link
              to="/pricing"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Pricing
            </Link>
            <NavDropdown label="Resources" items={RESOURCE_ITEMS} />
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Button asChild size="sm" variant="ghost"><Link to="/auth">Sign In</Link></Button>
            <Button asChild size="sm"><Link to="/signup">Create Account</Link></Button>
          </div>

          {/* Mobile */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>SEZA POS</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6 text-sm">
                <div>
                  <div className="font-semibold mb-2">Product</div>
                  <ul className="space-y-1.5 pl-1">
                    {PRODUCT_ITEMS.map((i) => (
                      <li key={i.label}><Link to={i.to} className="text-muted-foreground hover:text-foreground">{i.label}</Link></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-semibold mb-2">Industries</div>
                  <ul className="space-y-1.5 pl-1">
                    {INDUSTRY_ITEMS.map((i) => (
                      <li key={i.label}><Link to={i.to} className="text-muted-foreground hover:text-foreground">{i.label}</Link></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <Link to="/pricing" className="font-semibold hover:text-primary">Pricing</Link>
                </div>
                <div>
                  <div className="font-semibold mb-2">Resources</div>
                  <ul className="space-y-1.5 pl-1">
                    {RESOURCE_ITEMS.map((i) => (
                      <li key={i.label}><Link to={i.to} className="text-muted-foreground hover:text-foreground">{i.label}</Link></li>
                    ))}
                  </ul>
                </div>
                <div className="pt-4 border-t space-y-2">
                  <Button asChild variant="outline" className="w-full"><Link to="/auth">Sign In</Link></Button>
                  <Button asChild className="w-full"><Link to="/signup">Create Account</Link></Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
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
