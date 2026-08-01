import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Boxes, CreditCard, HelpCircle, MonitorSmartphone, Package, Receipt, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/training")({
  head: () => ({ meta: [{ title: "Support & Training - SEZA POS" }] }),
  component: TrainingPage,
});

const guides = [
  { icon: BookOpen, title: "Owner Dashboard basics", steps: ["Use Home for daily sales and activity", "Use Staff for employees, roles, PINs, shifts, and permissions", "Use More for sales, inventory, customers, reports, billing, stores, and settings"] },
  { icon: Package, title: "Products and inventory", steps: ["Add or scan products with a unique barcode or SKU", "Save edits as drafts while the store is selling", "Review unpublished changes and press Publish to send one safe catalog version to POS devices", "Use publish history to review or roll back a catalog version"] },
  { icon: MonitorSmartphone, title: "Android POS device", steps: ["Pair each register from Stores & Registers", "Open a shift before selling", "Use manager PIN approval for refunds, voids, discounts, and protected actions", "Confirm cloud, printer, scanner, drawer, customer display, and payment-terminal status before opening"] },
  { icon: Receipt, title: "Sales, receipts, and refunds", steps: ["Complete cash or connected-card sales from the Android POS", "Use final receipt numbers for customer lookup", "Review pending synchronization after an outage", "Search the sale before processing a refund and record the reason"] },
  { icon: Users, title: "Staff and permissions", steps: ["Create one employee profile per person", "Assign only the permissions each role needs", "Never share owner passwords or manager PINs", "Disable access immediately when an employee leaves"] },
  { icon: Boxes, title: "Shifts and cash drawer", steps: ["Enter the opening cash amount", "Record paid-ins, paid-outs, safe drops, and no-sale drawer openings", "Count the drawer at close and review expected versus actual cash", "Investigate differences before approving the shift"] },
  { icon: CreditCard, title: "Payments and hardware", steps: ["Connect payment providers in Business Settings", "Run a test print after selecting a printer", "Test scanner, cash drawer, and customer display", "Keep a backup internet and manual receipt process available"] },
  { icon: ShieldCheck, title: "Security and safe operation", steps: ["Use passkeys or strong passwords", "Review account and audit activity", "Do not expose customer, employee, or payment information", "Contact SEZA immediately for a lost register or suspicious access"] },
];

function TrainingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-5 md:p-6">
      <PageHeader title="Support & Training" subtitle="Step-by-step guidance for running the Owner Dashboard and Android POS correctly." />
      <div className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-7">
        <h2 className="text-2xl font-black tracking-tight">Learn SEZA before your store opens</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Follow these guides in order for a new location, then return whenever you add staff, hardware, inventory, or another register.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild><Link to="/onboarding">Open launch checklist</Link></Button>
          <Button asChild variant="outline"><Link to="/help"><HelpCircle className="mr-2 size-4" />Contact support</Link></Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {guides.map(({ icon: Icon, title, steps }, index) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">{index + 1}</span><Icon className="size-5" />{title}</CardTitle>
              <CardDescription>Complete each step and verify the result before moving on.</CardDescription>
            </CardHeader>
            <CardContent><ol className="space-y-3 text-sm">{steps.map((step, i) => <li key={step} className="flex gap-3"><span className="font-semibold text-primary">{i + 1}.</span><span>{step}</span></li>)}</ol></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
