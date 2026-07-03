import type { LegalDocument } from "@/lib/legal/types";
import { LEGAL_CONFIG as C } from "@/lib/legal/config";

const P = (s: string) => <p>{s}</p>;

export const privacyPolicy: LegalDocument = {
  slug: "privacy",
  shortTitle: "Privacy Policy",
  title: "Privacy Policy",
  category: "Privacy",
  summary:
    "How SEZA POS collects, uses, shares, and protects personal information across our website, applications, and cloud services.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  intro: (
    <p>
      This Privacy Policy explains how <strong>{C.companyName}</strong> ("we", "us") collects, uses,
      discloses, and safeguards personal information when you visit our website, register for an
      account, or use {C.productName} (the "<strong>Service</strong>"). Where a Merchant uses the
      Service to process its own customers' data, the Merchant is the data controller and we act as
      a service provider or processor on the Merchant's behalf.
    </p>
  ),
  sections: [
    {
      id: "info-we-collect",
      title: "Information We Collect",
      body: P(
        `We collect information you provide directly, information collected automatically when you use the Service, and information from third parties (for example, payment providers and identity verification vendors).`
      ),
      children: [
        {
          id: "personal-info",
          title: "Personal Information",
          body: P(
            `Contact details such as name, email address, phone number, and mailing address; login credentials; profile settings; and any information you choose to provide when contacting support.`
          ),
        },
        {
          id: "business-info",
          title: "Business Information",
          body: P(
            `Legal business name, trade name, business address, tax identifiers, industry, and information required by our Merchant of Record for anti-fraud, sanctions screening, and tax collection.`
          ),
        },
        {
          id: "store-info",
          title: "Store Information",
          body: P(
            `Store configuration, products, categories, pricing, tax rules, promotions, receipt templates, hardware settings, and other data you enter to operate your Store.`
          ),
        },
        {
          id: "employee-data",
          title: "Employee Data",
          body: P(
            `For Employee Accounts, the Merchant provides a name, email address, role, and permissions. We may collect login logs and activity metadata for security and audit purposes.`
          ),
        },
        {
          id: "customer-data",
          title: "Customer Data",
          body: P(
            `When Merchants collect information about their own customers through the Service (for example, name, phone number, email for a receipt, loyalty enrollment, purchase history), that information is processed by us on the Merchant's behalf.`
          ),
        },
        {
          id: "transaction-data",
          title: "Transaction Data",
          body: P(
            `Records of sales, refunds, tax, tender types, tips, discounts, timestamps, register, and employee that processed the transaction. Full payment card numbers are not stored on our servers.`
          ),
        },
        {
          id: "device-info",
          title: "Device Information",
          body: P(
            `Device identifiers, hardware model, operating system version, browser type, IP address, timezone, and language preference. This information helps us secure the Service and diagnose issues.`
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              We use cookies and similar technologies as described in our{" "}
              <a href="/legal/cookies">Cookie Policy</a>.
            </p>
          ),
        },
        {
          id: "analytics",
          title: "Analytics",
          body: P(
            `We use privacy-respecting analytics to understand aggregate usage of the Service, measure performance, and improve features. Analytics data is de-identified or pseudonymized where feasible.`
          ),
        },
        {
          id: "location",
          title: "Location Data",
          body: P(
            `We may collect approximate location derived from IP address for fraud prevention, tax calculation, and localization. Precise location is only collected if you explicitly enable a feature that requires it (for example, delivery routing).`
          ),
        },
        {
          id: "camera",
          title: "Camera Usage",
          body: P(
            `The Service may request access to your device's camera to scan barcodes or capture product images. Camera streams are processed on the device and are not stored or transmitted unless you explicitly save a captured image.`
          ),
        },
        {
          id: "scanning-permissions",
          title: "Barcode Scanning Permissions",
          body: P(
            `Barcode scanning may use camera or dedicated hardware permissions on your device. Scanned barcode values are stored as part of the associated product or transaction record.`
          ),
        },
      ],
    },
    {
      id: "use",
      title: "How Information Is Used",
      body: (
        <ul>
          <li>Provide, maintain, and secure the Service.</li>
          <li>Process Subscriptions, billing, and payments via our Merchant of Record.</li>
          <li>Provide customer and technical support.</li>
          <li>Send transactional messages such as receipts, alerts, and service notices.</li>
          <li>Send product updates and marketing communications (only where permitted; opt-out available).</li>
          <li>Detect, investigate, and prevent fraud, abuse, and security incidents.</li>
          <li>Comply with legal obligations, including tax, accounting, and lawful requests from authorities.</li>
          <li>Improve and develop the Service, including diagnostics and aggregate analytics.</li>
        </ul>
      ),
    },
    {
      id: "legal-basis",
      title: "Legal Basis for Processing",
      body: (
        <ul>
          <li><strong>Performance of a contract</strong> — to provide the Service you signed up for.</li>
          <li><strong>Legitimate interests</strong> — to secure, maintain, and improve the Service, prevent fraud, and communicate with customers about their accounts.</li>
          <li><strong>Compliance with a legal obligation</strong> — for tax, accounting, and lawful requests.</li>
          <li><strong>Consent</strong> — for optional cookies, marketing, and certain data types where required.</li>
        </ul>
      ),
    },
    {
      id: "sharing",
      title: "Data Sharing",
      body: P(
        `We do not sell personal information. We share information only with the categories of recipients described below, and only to the extent necessary for the stated purpose.`
      ),
      children: [
        {
          id: "payment-providers",
          title: "Payment Providers",
          body: P(
            `Our Merchant of Record and its payment processors receive information needed to process Subscription payments and comply with financial regulations.`
          ),
        },
        {
          id: "sms-providers",
          title: "SMS Providers",
          body: P(
            `If SMS receipts or notifications are enabled, phone numbers and message content are shared with the SMS gateway to deliver messages.`
          ),
        },
        {
          id: "cloud-providers",
          title: "Cloud Providers",
          body: P(
            `We use reputable cloud infrastructure providers to host and operate the Service. Data may be stored in and processed from multiple regions for resilience.`
          ),
        },
        {
          id: "auth-lawful",
          title: "Legal, Compliance & Successors",
          body: P(
            `We may disclose information to comply with law, respond to lawful requests, protect our rights and users, or in connection with a merger, acquisition, or asset transfer.`
          ),
        },
      ],
    },
    {
      id: "retention",
      title: "Data Retention",
      body: P(
        `We retain personal information for as long as necessary to provide the Service and for legitimate business, legal, tax, and accounting purposes. Transaction and financial records are typically retained for at least seven years. Account and Customer Data are deleted or de-identified within a reasonable period after account termination, subject to legal holds.`
      ),
    },
    {
      id: "security",
      title: "Security Measures",
      body: (
        <p>
          We implement administrative, technical, and physical safeguards designed to protect
          personal information, including encryption, access control, and continuous monitoring.
          See our <a href="/legal/security-policy">Security Policy</a> for detail.
        </p>
      ),
    },
    {
      id: "encryption",
      title: "Encryption",
      body: P(
        `Data is encrypted in transit using industry-standard TLS and at rest using AES-256 or equivalent. Sensitive credentials are stored using strong one-way hashing.`
      ),
    },
    {
      id: "rights",
      title: "User Rights",
      body: (
        <>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li>Access personal information we hold about you.</li>
            <li>Correct inaccurate information.</li>
            <li>Delete personal information, subject to legal retention requirements.</li>
            <li>Restrict or object to certain processing.</li>
            <li>Receive a copy of your data in a portable format.</li>
            <li>Withdraw consent where processing is based on consent.</li>
            <li>Lodge a complaint with your local data protection authority.</li>
          </ul>
          <p>
            To exercise your rights, email <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a>.
          </p>
        </>
      ),
    },
    {
      id: "deletion",
      title: "Data Deletion Requests",
      body: P(
        `You may request deletion of your Account data at any time. We will delete or de-identify Personal Information within 30 days of a verified request unless retention is required by law or a compelling legitimate interest (for example, ongoing fraud investigations).`
      ),
    },
    {
      id: "international",
      title: "International Transfers",
      body: P(
        `Your information may be transferred to, and processed in, countries other than your own. When we transfer personal data across borders we rely on appropriate safeguards, such as the European Commission's Standard Contractual Clauses, adequacy decisions, or comparable mechanisms.`
      ),
    },
    {
      id: "children",
      title: "Children's Privacy",
      body: P(
        `The Service is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided personal information, contact ${C.privacyEmail} and we will delete it.`
      ),
    },
    {
      id: "changes",
      title: "Changes to Privacy Policy",
      body: P(
        `We may update this Privacy Policy from time to time. Material changes will be communicated by email or in-product notice at least 15 days before taking effect. The "Last updated" date at the top reflects the latest revision.`
      ),
    },
    {
      id: "contact",
      title: "Contact Information",
      body: (
        <>
          <p>{C.companyName}</p>
          <p>{C.businessAddress}</p>
          <p>Privacy: <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a></p>
          <p>General: <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a></p>
        </>
      ),
    },
  ],
};
