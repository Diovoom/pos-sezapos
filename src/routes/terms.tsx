import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — SEZA POS" },
      { name: "description", content: "SEZA TECHNOLOGIES terms of service, including permitted use, intellectual property, and Paddle as Merchant of Record." },
      { property: "og:title", content: "Terms & Conditions — SEZA POS" },
      { property: "og:description", content: "The terms of service that apply when using SEZA POS." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral">
      <p><Link to="/">← Back</Link></p>
      <h1>Terms &amp; Conditions</h1>
      <p><em>Last updated: July 2026</em></p>

      <h2>1. Who we are</h2>
      <p>These Terms are an agreement between you and <strong>SEZA TECHNOLOGIES</strong> ("SEZA POS", "we", "us"), the seller of the SEZA POS point-of-sale software (the "Service"). By creating an account, subscribing to a plan, or otherwise using the Service, you agree to these Terms.</p>

      <h2>2. Eligibility and account</h2>
      <p>You must be of legal age to form a binding contract and, if you sign up on behalf of a business, have authority to bind that business. You are responsible for the accuracy of the information you provide, for keeping your credentials confidential, and for all activity that occurs under your account.</p>

      <h2>3. The Service</h2>
      <p>SEZA POS is a cloud-based point-of-sale platform that lets retail businesses ring sales, manage inventory, track employees, and analyze performance. Available features depend on the plan you choose (Starter, Pro, Business, or a free trial).</p>

      <h2>4. Acceptable use</h2>
      <p>You will not: (a) use the Service for anything unlawful, fraudulent, or infringing on someone else's rights; (b) upload malware or attempt to probe, scan, or breach the security of the Service; (c) scrape, copy, or resell the Service; (d) interfere with other users' use of the Service; (e) reverse-engineer or circumvent technical limits.</p>

      <h2>5. Intellectual property</h2>
      <p>SEZA TECHNOLOGIES owns the Service, including the software, documentation, and branding. We grant you a limited, non-exclusive, non-transferable right to use the Service within your selected plan. You retain ownership of the data you upload; you grant us a limited license to host and process that data solely to provide the Service.</p>

      <h2>6. Payment, subscription and refunds</h2>
      <p>Our order process is conducted by our online reseller <strong>Paddle.com</strong>. <strong>Paddle.com is the Merchant of Record for all our orders.</strong> Paddle provides all customer service inquiries and handles returns. Payment, billing, tax, cancellation, and refund terms are governed by Paddle's Buyer Terms at <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">paddle.com/legal/checkout-buyer-terms</a>. Our Refund Policy is available at <Link to="/refund">/refund</Link>.</p>

      <h2>7. Service availability</h2>
      <p>We work hard to keep the Service running, but we do not guarantee uninterrupted or error-free performance. Scheduled maintenance and outages may occur.</p>

      <h2>8. Suspension and termination</h2>
      <p>We may suspend or terminate your access for material breach of these Terms, non-payment, security or fraud risk, or repeated policy violations. On termination, you may export your data for a reasonable period, after which it may be deleted.</p>

      <h2>9. Warranties and liability</h2>
      <p>To the fullest extent permitted by law, we disclaim all implied warranties (including merchantability and fitness for a particular purpose). Our aggregate liability is capped at fees paid to us in the prior 12 months. We are not liable for indirect, consequential, or special damages (including loss of profits, data, or goodwill), except where such exclusions are not permitted by law.</p>

      <h2>10. Indemnity</h2>
      <p>You will indemnify us against claims arising from your content, unlawful use of the Service, or breach of these Terms.</p>

      <h2>11. Changes</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance.</p>

      <h2>12. Governing law</h2>
      <p>These Terms are governed by the laws of the jurisdiction in which SEZA TECHNOLOGIES is established, without regard to conflict-of-laws principles. Disputes will be resolved in the competent courts of that jurisdiction.</p>

      <h2>13. Contact</h2>
      <p>Questions? Email <a href="mailto:support@sezapos.com">support@sezapos.com</a>.</p>
    </div>
  );
}
