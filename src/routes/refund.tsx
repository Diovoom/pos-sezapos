import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — SEZA POS" },
      { name: "description", content: "SEZA POS offers a 30-day money-back guarantee. Refunds are processed by our payment provider, Paddle." },
      { property: "og:title", content: "Refund Policy — SEZA POS" },
      { property: "og:description", content: "30-day money-back guarantee on SEZA POS subscriptions." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sezapos.com/refund" },
    ],
    links: [{ rel: "canonical", href: "https://sezapos.com/refund" }],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral">
      <p><Link to="/">← Back</Link></p>
      <h1>Refund Policy</h1>
      <p><em>Last updated: July 2026</em></p>

      <p>We want you to be happy with SEZA POS. If you are not, we offer a <strong>30-day money-back guarantee</strong>.</p>

      <h2>Eligibility</h2>
      <p>You may request a full refund of a SEZA POS subscription within <strong>30 days</strong> of your order date.</p>

      <h2>How to request a refund</h2>
      <p>Refunds are processed by our payment provider, <strong>Paddle</strong>. To request a refund, visit <a href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a> and locate your order, or contact <a href="mailto:support@sezapos.com">support@sezapos.com</a> and we'll help you.</p>

      <h2>When refunds are processed</h2>
      <p>Once approved, refunds typically return to your original payment method within 5–10 business days, depending on your bank.</p>

      <h2>After the refund window</h2>
      <p>After the 30-day window, you can cancel your subscription at any time from Settings → Billing or via Paddle's customer portal. You will retain access until the end of your current billing period, but the remaining time is not refundable.</p>
    </div>
  );
}
