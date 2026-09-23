import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/dahv-yzg-xk")({
  head: () => ({
    meta: [
      { title: "SEZA POS | Isolated Access" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IsolatedPage,
});

function IsolatedPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Background decoration consistent with SEZA branding */}
      <div className="pointer-events-none absolute left-1/2 top-[-250px] -z-10 h-[560px] w-[760px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-1/2 -z-10 size-80 rounded-full bg-cyan-300/10 blur-3xl" />

      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-10 inline-flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white shadow-lg dark:bg-slate-900">
            <Logo className="size-9 rounded-lg" alt="SEZA POS" />
          </span>
          <span className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
            SEZA POS
          </span>
        </div>

        <div className="max-w-2xl">
          <h1 className="text-balance text-4xl font-black tracking-tight text-slate-950 sm:text-6xl dark:text-white">
            Isolated Environment
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-300">
            This page is isolated from the main marketing shell and navigation. 
            It is hidden from search engines and intended for internal use.
          </p>
        </div>
      </main>
    </div>
  );
}
