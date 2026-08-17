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
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Integrations</p>
        <h1 className="mt-4 text-balance text-4xl font-black tracking-[-0.04em] sm:text-6xl">Your counter should work together.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">SEZA connects the everyday tools around checkout while keeping the register simple for the person using it.</p>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-2">
        {integrations.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-3xl border border-slate-200 bg-white p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
            <h2 className="mt-4 text-lg font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
          </article>
        ))}
      </section>
      <section className="border-y bg-blue-50/60 py-14">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-black">Need to confirm your setup?</h2>
          <p className="mt-3 text-muted-foreground">Tell us which hardware or service you use and we’ll help you check compatibility.</p>
          <Button asChild className="mt-6 rounded-full"><Link to="/contact">Contact SEZA <ArrowRight className="ml-2 size-4" /></Link></Button>
        </div>
      </section>
    </MarketingShell>
  );
}
