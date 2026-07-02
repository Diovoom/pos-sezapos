import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — SEZA POS" },
      { name: "description", content: "How SEZA TECHNOLOGIES collects, uses, shares, and protects your personal data. Paddle is our Merchant of Record and processes payments." },
      { property: "og:title", content: "Privacy Notice — SEZA POS" },
      { property: "og:description", content: "How we handle your personal data." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral">
      <p><Link to="/">← Back</Link></p>
      <h1>Privacy Notice</h1>
      <p><em>Last updated: July 2026</em></p>

      <h2>1. Who we are</h2>
      <p><strong>SEZA TECHNOLOGIES</strong> ("SEZA POS", "we", "us") is the data controller for personal data collected through the SEZA POS software.</p>

      <h2>2. Personal data we collect</h2>
      <ul>
        <li><strong>Account data</strong> — name, email, password hash, phone (optional).</li>
        <li><strong>Business data</strong> — store name, address, tax IDs, business type.</li>
        <li><strong>Employee data</strong> — names, roles, employee IDs, shift records that you enter.</li>
        <li><strong>Operational data</strong> — sales, inventory, refunds, customer records that you enter.</li>
        <li><strong>Support messages</strong> — content of emails or chats you send us.</li>
        <li><strong>Usage &amp; device data</strong> — IP address, browser type, log data, feature usage.</li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To create and operate your account (contract performance).</li>
        <li>To provide the Service, including sales, inventory, and reporting features (contract).</li>
        <li>To keep the Service secure and prevent fraud (legitimate interest).</li>
        <li>To improve the product and understand usage (legitimate interest).</li>
        <li>To respond to support requests (contract / legitimate interest).</li>
        <li>To send transactional emails (contract) and marketing emails where permitted (consent, opt-out any time).</li>
      </ul>

      <h2>4. Who we share it with</h2>
      <ul>
        <li><strong>Paddle</strong> — our Merchant of Record for sale of the product, subscription management, payment processing, tax compliance, and invoicing.</li>
        <li><strong>Service providers</strong> — hosting, database, email delivery, analytics, and support tooling.</li>
        <li><strong>Professional advisors</strong> — legal, accounting, insurance.</li>
        <li><strong>Authorities</strong> — where required by law, subpoena, or to protect our rights.</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>5. Retention</h2>
      <p>We keep account and business data for as long as your account is active and for a reasonable period afterward to comply with legal, tax, and accounting obligations. When no longer needed, data is deleted or anonymized.</p>

      <h2>6. Your rights</h2>
      <p>Depending on where you live, you may have the right to access, correct, delete, export, restrict, or object to processing of your data, and to withdraw consent for marketing. You may also complain to a supervisory authority. To exercise these rights, email <a href="mailto:privacy@sezapos.com">privacy@sezapos.com</a>. We will respond within a reasonable time, typically within one month.</p>

      <h2>7. International transfers</h2>
      <p>Personal data may be processed in countries other than your own. Where required, we rely on appropriate safeguards such as Standard Contractual Clauses or adequacy decisions.</p>

      <h2>8. Security</h2>
      <p>We use appropriate technical and organizational measures — including encryption in transit, access controls, and regular backups — to protect personal data. No system is 100% secure; we work continuously to strengthen safeguards.</p>

      <h2>9. Cookies</h2>
      <p>We use strictly necessary cookies to keep you signed in and to remember preferences. Optional analytics cookies help us improve the product; you can manage cookies in your browser settings.</p>

      <h2>10. Contact</h2>
      <p>Privacy questions: <a href="mailto:privacy@sezapos.com">privacy@sezapos.com</a>. General support: <a href="mailto:support@sezapos.com">support@sezapos.com</a>.</p>
    </div>
  );
}
