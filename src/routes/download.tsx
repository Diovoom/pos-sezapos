import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Download, MonitorSmartphone, RefreshCw, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { dashboardUrl } from "@/lib/host";

const DOWNLOAD_TITLE = "Download SEZA POS for Android | SEZA POS";
const DOWNLOAD_DESCRIPTION =
  "Download the official SEZA POS Android app for a new, replacement, or factory-reset register.";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: DOWNLOAD_TITLE },
      { name: "description", content: DOWNLOAD_DESCRIPTION },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { name: "googlebot", content: "noindex, nofollow, noarchive, nosnippet" },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  return (
    <MarketingShell>
      <section className="border-b border-slate-200 bg-white px-5 py-16 dark:border-white/10 dark:bg-slate-950 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              Official Android app
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              Download SEZA POS
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
              Use this page when setting up a new register, replacing a device, or reinstalling SEZA
              POS after it was removed. The same official app is used for every merchant and is paired
              to the correct store after installation.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base font-bold">
                <a href="/api/public/pos/apk" download>
                  <Download className="mr-2 size-5" />
                  Download Android APK
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
                <a href={dashboardUrl("/devices")}>Open Owner Dashboard</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Official download: sezapos.com/download
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl divide-y border-y">
          {[
            { icon: MonitorSmartphone, title: "Install on the register", body: "Open this page from the Android POS browser and download the official SEZA POS APK." },
            { icon: ShieldCheck, title: "Pair it securely", body: "After installation, use the Owner Dashboard to generate a pairing code for the correct business and register." },
            { icon: RefreshCw, title: "Use the latest build", body: "This link always points to the current production APK published by SEZA." },
          ].map((item) => (
            <div key={item.title} className="flex gap-4 py-5">
              <item.icon className="mt-0.5 size-5 shrink-0 text-blue-700" />
              <div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-bold">Factory-installed SEZA does not need to be downloaded again.</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                This page is the recovery and replacement option if SEZA POS is ever uninstalled or a
                merchant receives a replacement Android register.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
