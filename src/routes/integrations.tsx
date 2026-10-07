import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, Mail, ScanBarcode, Printer, Database, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [
    { title: "Integrations - SEZA POS" },
    { name: "description", content: "Connect SEZA POS with the payment, receipt, hardware and data tools used to run your store." },
  ]}),
  component: IntegrationsPage,
});

const integrations = [
  { icon: CreditCard, title: "Payments", text: "Connect supported payment workflows without turning checkout into a separate system." },
  { icon: Mail, title: "Receipts", text: "Keep printed, email and SMS receipt workflows connected to each sale." },
  { icon: ScanBarcode, title: "Barcode scanners", text: "Use supported USB, Bluetooth HID and device-camera scanning workflows." },
  { icon: Printer, title: "Printers & cash drawers", text: "Connect compatible receipt printers and printer-driven cash drawers at the counter." },
  { icon: Database, title: "Business data", text: "Move supported reports and operational data into the workflows your business already uses." },
];

function IntegrationsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-sm font-semibold text-primary">Integrations</p>
        <h1 className="mt-4 text-balance text-4xl font-black tracking-[-0.04em] sm:text-6xl">Your counter should work together.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">SEZA connects the everyday tools around checkout while keeping the register simple for the person using it.</p>
      </section>
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="divide-y border-y border-slate-200">
          {integrations.map(({ icon: Icon, title, text }) => (
            <article key={title} className="grid gap-3 py-6 sm:grid-cols-[32px_1fr] sm:gap-4">
              <Icon className="size-5 text-primary sm:mt-1" />
              <div>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="border-y bg-blue-50/60 py-14">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-black">Need to confirm your setup?</h2>
          <p className="mt-3 text-muted-foreground">Tell us which hardware or service you use and we’ll help you check compatibility.</p>
          <Button asChild className="mt-6 rounded-lg"><Link to="/contact">Contact SEZA <ArrowRight className="ml-2 size-4" /></Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
