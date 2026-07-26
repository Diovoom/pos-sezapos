import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { isDisposableEmail } from "@/lib/security/disposable-email";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact SEZA POS" },
      {
        name: "description",
        content: "Tell SEZA about your store, hardware needs, pricing questions, or demo request.",
      },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/contact" }],
  }),
  component: ContactPage,
});

type ConsultationForm = {
  name: string;
  email: string;
  business: string;
  phone: string;
  message: string;
};

function ContactPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ConsultationForm, string>>>({});
  const [form, setForm] = useState<ConsultationForm>({
    name: "",
    email: "",
    business: "",
    phone: "",
    message: "",
  });

  useEffect(() => {
    if (window.location.hash !== "#message-us") return;
    window.requestAnimationFrame(() => {
      document.getElementById("message-us")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, []);

  const validateStep = (currentStep: number) => {
    const nextErrors: Partial<Record<keyof ConsultationForm, string>> = {};
    if (currentStep === 1) {
      if (form.name.trim().length < 2) nextErrors.name = "Enter your full name.";
      const email = form.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        nextErrors.email = "Enter a valid business email.";
      } else if (isDisposableEmail(email)) {
        nextErrors.email = "Temporary email addresses are not accepted.";
      }
    }
    if (currentStep === 2) {
      if (form.business.trim().length < 2) nextErrors.business = "Enter your business name.";
      const digits = form.phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        nextErrors.phone = "Enter a complete phone number with area code.";
      }
    }
    if (currentStep === 3 && form.message.trim().length < 10) {
      nextErrors.message = "Add a little more detail so we can prepare the right answer.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(3, current + 1));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateStep(3)) return;

    setBusy(true);
    try {
      const response = await fetch("/api/public/live-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          name: form.name,
          phone: form.phone,
          website: "",
          message: [
            "Consultation request",
            `Email: ${form.email}`,
            `Business: ${form.business}`,
            "",
            form.message,
          ].join("\n"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Unable to send your request.");
      setSent(true);
      toast.success("Your request was sent to SEZA.");
    } catch {
      toast.error("We could not send that right now. Please call SEZA or try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketingShell>
      <section id="message-us" className="scroll-mt-24 px-5 py-10 sm:py-16">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              SEZA Sales
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Tell us about your store
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-muted-foreground">
              A few quick details help us recommend the right setup, hardware, and plan.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-[28px] border bg-card shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)]">
            <div className="border-b px-6 py-5">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <span>Step {sent ? 3 : step} of 3</span>
                <span>
                  {sent
                    ? "Complete"
                    : step === 1
                      ? "About you"
                      : step === 2
                        ? "Your business"
                        : "Your request"}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                  style={{ width: `${sent ? 100 : (step / 3) * 100}%` }}
                />
              </div>
            </div>

            {sent ? (
              <div className="px-6 py-12 text-center">
                <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-black">We received your request</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  A SEZA specialist will review your store details and follow up using the contact
                  information you provided.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="p-6">
                {step === 1 && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
                      <Input
                        id="name"
                        autoComplete="name"
                        value={form.name}
                        onChange={(event) => {
                          setForm({ ...form, name: event.target.value });
                          setErrors((current) => ({ ...current, name: undefined }));
                        }}
                      />
                      {errors.name && (
                        <p className="text-xs font-medium text-destructive">{errors.name}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={(event) => {
                          setForm({ ...form, email: event.target.value });
                          setErrors((current) => ({ ...current, email: undefined }));
                        }}
                      />
                      {errors.email && (
                        <p className="text-xs font-medium text-destructive">{errors.email}</p>
                      )}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="business">Business name</Label>
                      <Input
                        id="business"
                        autoComplete="organization"
                        value={form.business}
                        onChange={(event) => {
                          setForm({ ...form, business: event.target.value });
                          setErrors((current) => ({ ...current, business: undefined }));
                        }}
                      />
                      {errors.business && (
                        <p className="text-xs font-medium text-destructive">{errors.business}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        value={form.phone}
                        onChange={(event) => {
                          setForm({ ...form, phone: formatPhone(event.target.value) });
                          setErrors((current) => ({ ...current, phone: undefined }));
                        }}
                      />
                      {errors.phone && (
                        <p className="text-xs font-medium text-destructive">{errors.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-2">
                    <Label htmlFor="message">How can we help?</Label>
                    <Textarea
                      id="message"
                      rows={6}
                      placeholder="Tell us what you sell, how many registers you need, and any questions about hardware, pricing, or switching from another POS."
                      value={form.message}
                      onChange={(event) => {
                        setForm({ ...form, message: event.target.value });
                        setErrors((current) => ({ ...current, message: undefined }));
                      }}
                    />
                    {errors.message && (
                      <p className="text-xs font-medium text-destructive">{errors.message}</p>
                    )}
                  </div>
                )}

                <div className="mt-7 flex items-center gap-3">
                  {step > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-14 rounded-2xl px-0"
                      onClick={() => setStep((current) => current - 1)}
                      aria-label="Previous step"
                    >
                      <ArrowLeft className="size-5" />
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button
                      type="button"
                      className="h-12 flex-1 rounded-2xl text-base font-bold"
                      onClick={next}
                    >
                      Continue <ArrowRight className="ml-2 size-5" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="h-12 flex-1 rounded-2xl text-base font-bold"
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <>
                          Send request <ArrowRight className="ml-2 size-5" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </form>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t bg-slate-50 px-5 py-3 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5" /> Call 9am to 5pm ET
              </span>
              <a
                href={`tel:${LEGAL_CONFIG.phone}`}
                className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:underline dark:text-blue-300"
              >
                <Phone className="size-3.5" /> {LEGAL_CONFIG.phoneDisplay}
              </a>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
