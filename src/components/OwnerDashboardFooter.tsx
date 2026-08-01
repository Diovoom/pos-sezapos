import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Headphones, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const legalLinks = [
  ["Privacy Policy", "/legal/privacy"],
  ["Terms of Service", "/legal/terms"],
  ["Merchant Agreement", "/legal/merchant-agreement"],
  ["Your Privacy Choices", "/privacy"],
] as const;

const helpLinks = [
  ["Support & Training", "/training"],
  ["System Status", "/status"],
  ["Security Center", "/legal/security-center"],
] as const;

export function OwnerDashboardFooter() {
  return (
    <footer className="mt-8 overflow-hidden rounded-3xl border bg-gradient-to-br from-white via-white to-blue-50 text-slate-950 shadow-sm dark:from-slate-950 dark:via-slate-950 dark:to-blue-950 dark:text-white">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Logo className="size-11 rounded-xl" />
            <div>
              <div className="text-lg font-black tracking-tight">SEZA POS</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Tools to run your business with confidence.</div>
            </div>
          </div>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
            Manage your store, staff, inventory, sales, and support from one secure owner workspace.
          </p>
          <Link
            to="/help"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Headphones className="size-4" /> Contact SEZA Support
          </Link>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-blue-600" /> Legal & privacy</div>
          <div className="grid gap-2">
            {legalLinks.map(([label, to]) => (
              <Link key={label} to={to as any} className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-300">
                <span>{label}</span><ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold">Help & trust</div>
          <div className="grid gap-2">
            {helpLinks.map(([label, to]) => (
              <Link key={label} to={to as any} className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-300">
                <span>{label}</span><ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
              </Link>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-xs leading-5 text-slate-600 dark:border-blue-900 dark:bg-blue-950/50 dark:text-slate-300">
            <div className="font-bold text-slate-900 dark:text-white">SEZA merchant services</div>
            <div>Support: +1 (828) 675-8348</div>
            <div>support@sezapos.com</div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-200 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:text-slate-400">
        <span>© 2026 SEZA Technologies Inc. All rights reserved.</span>
        <span>Owner Dashboard · Secure merchant access</span>
      </div>
    </footer>
  );
}
