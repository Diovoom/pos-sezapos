import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer, ScanLine, CreditCard, Monitor, DollarSign, Tablet, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const Route = createFileRoute("/hardware")({
  head: () => ({
    meta: [
      { title: "Compatible Hardware — SEZA POS" },
      { name: "description", content: "SEZA POS works with receipt printers, barcode scanners, cash drawers, card terminals, and customer displays. Use your existing hardware or start fresh." },
      { property: "og:title", content: "Compatible Hardware — SEZA POS" },
      { property: "og:description", content: "Printers, scanners, cash drawers, card terminals, customer displays." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/hardware" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/hardware" }],
  }),
  component: HardwarePage,
});

const HARDWARE = [
  {
    icon: Tablet,
    title: "Any modern device",
    body: "SEZA POS runs in any modern browser — iPad, Android tablet, Windows PC, Mac, or Chromebook. No installs, no updates to manage.",
    bullets: ["Touch-first UI", "Works offline for checkout", "Automatic cloud sync"],
  },
  {
    icon: Printer,
    title: "Receipt printers",
    body: "Thermal receipt printers via USB, Ethernet, or Bluetooth. ESC/POS command set supported out of the box.",
    bullets: ["Star Micronics TSP100 / TSP143", "Epson TM-T20 / TM-T88", "Bixolon SRP-350 series"],
  },
  {
    icon: ScanLine,
    title: "Barcode scanners",
    body: "Any USB or Bluetooth HID scanner works — just plug in and start scanning. 1D and 2D codes supported.",
    bullets: ["Honeywell Voyager", "Zebra DS2208 / DS2278", "Generic USB HID scanners"],
  },
  {
    icon: DollarSign,
    title: "Cash drawers",
    body: "Cash drawers connect through the receipt printer's cash drawer port (RJ11/RJ12).",
    bullets: ["APG Vasario / Series 4000", "MMF Val-u Line", "Any 24V printer-driven drawer"],
  },
  {
    icon: CreditCard,
    title: "Card terminals",
    body: "Integrate with your existing payment processor's terminal or use our recommended provider — tap, chip, and swipe supported.",
    bullets: ["EMV chip & PIN", "Contactless (Tap-to-Pay)", "Manual card entry"],
  },
  {
    icon: Monitor,
    title: "Customer displays",
    body: "Optional second-screen display so customers can see items and totals as they're rung up.",
    bullets: ["HDMI or USB displays", "Second browser window", "Line-item + total view"],
  },
];

function HardwarePage() {
  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Bring your own hardware</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          SEZA POS works with the retail hardware you already own — no proprietary lock-in. Or ask us for a recommended bundle.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild><Link to="/contact">Get a hardware bundle quote</Link></Button>
          <Button asChild variant="outline"><Link to="/signup">Start free trial</Link></Button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {HARDWARE.map((h) => (
          <div key={h.title} className="rounded-xl border p-6 flex flex-col">
            <h.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{h.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{h.body}</p>
            <ul className="mt-4 space-y-1.5 text-sm">
              {h.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="border-t bg-muted/30">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Not sure what you need?</h2>
          <p className="mt-3 text-muted-foreground">
            We'll help you pick the right hardware for your store size, volume, and budget — and can ship a plug-and-play bundle to your door.
          </p>
          <div className="mt-6">
            <Button asChild><Link to="/contact">Talk to us</Link></Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
