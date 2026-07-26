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
        `We collect information you provide directly, information collected automatically when you use the Service, and information from third parties (for example, payment providers and identity verification vendors).`,
      ),
      children: [
        {
          id: "personal-info",
          title: "Personal Information",
          body: P(
            `Contact details such as name, email address, phone number, and mailing address; login credentials; profile settings; and any information you choose to provide when contacting support.`,
          ),
        },
        {
          id: "business-info",
          title: "Business Information",
          body: P(
            `Legal business name, trade name, business address, tax identifiers, industry, and information requested by Stripe or another connected payment provider for billing, fraud prevention, sanctions screening, identity verification, or financial compliance.`,
          ),
        },
        {
          id: "store-info",
          title: "Store Information",
          body: P(
            `Store configuration, products, categories, pricing, tax rules, promotions, receipt templates, hardware settings, and other data you enter to operate your Store.`,
          ),
        },
        {
          id: "employee-data",
          title: "Employee Data",
          body: P(
            `For Employee Accounts, the Merchant provides a name, email address, role, and permissions. We may collect login logs and activity metadata for security and audit purposes.`,
          ),
        },
        {
          id: "customer-data",
          title: "Customer Data",
          body: P(
            `When Merchants collect information about their own customers through the Service (for example, name, phone number, email for a receipt, loyalty enrollment, purchase history), that information is processed by us on the Merchant's behalf.`,
          ),
        },
        {
          id: "transaction-data",
          title: "Transaction Data",
          body: P(
            `Records of sales, refunds, tax, tender types, tips, discounts, timestamps, register, and employee that processed the transaction. Full payment card numbers are not stored on our servers.`,
          ),
        },
        {
          id: "device-info",
          title: "Device Information",
          body: P(
            `Device identifiers, hardware model, operating system version, browser type, IP address, timezone, and language preference. This information helps us secure the Service and diagnose issues.`,
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
            `If optional analytics are enabled, we may use usage and diagnostic information to understand performance and improve features. Optional analytics cookies are disabled by default on the public website unless the visitor consents.`,
          ),
        },
        {
          id: "location",
          title: "Location Data",
          body: P(
            `We may collect approximate location derived from IP address for fraud prevention, tax calculation, and localization. Precise location is only collected if you explicitly enable a feature that requires it (for example, delivery routing).`,
          ),
        },
        {
          id: "camera",
          title: "Camera Usage",
          body: P(
            `The Service may request access to your device's camera to scan barcodes or capture product images. Camera streams are processed on the device and are not stored or transmitted unless you explicitly save a captured image.`,
          ),
        },
        {
          id: "scanning-permissions",
          title: "Barcode Scanning Permissions",
          body: P(
            `Barcode scanning may use camera or dedicated hardware permissions on your device. Scanned barcode values are stored as part of the associated product or transaction record.`,
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
          <li>Process Subscriptions, invoices, and billing through Stripe.</li>
          <li>Provide customer and technical support.</li>
          <li>Send transactional messages such as receipts, alerts, and service notices.</li>
          <li>
            Send product updates and marketing communications (only where permitted; opt-out
            available).
          </li>
          <li>Detect, investigate, and prevent fraud, abuse, and security incidents.</li>
          <li>
            Comply with legal obligations, including tax, accounting, and lawful requests from
            authorities.
          </li>
          <li>Improve and develop the Service, including diagnostics and aggregate analytics.</li>
        </ul>
      ),
    },
    {
      id: "legal-basis",
      title: "Legal Basis for Processing",
      body: (
        <ul>
          <li>
            <strong>Performance of a contract</strong> - to provide the Service you signed up for.
          </li>
          <li>
            <strong>Legitimate interests</strong> - to secure, maintain, and improve the Service,
            prevent fraud, and communicate with customers about their accounts.
          </li>
          <li>
            <strong>Compliance with a legal obligation</strong> - for tax, accounting, and lawful
            requests.
          </li>
          <li>
            <strong>Consent</strong> - for optional cookies, marketing, and certain data types where
            required.
          </li>
        </ul>
      ),
    },
    {
      id: "sharing",
      title: "Data Sharing",
      body: P(
        `We do not sell personal information. We share information only with the categories of recipients described below, and only to the extent necessary for the stated purpose.`,
      ),
      children: [
        {
          id: "payment-providers",
          title: "Payment Providers",
          body: P(
            `Stripe receives the account, billing, device, and payment information needed to process SEZA Subscription payments, prevent fraud, and comply with its legal obligations. Stripe handles full payment-card details; SEZA receives tokens, identifiers, status, and limited billing details needed to operate the Subscription.`,
          ),
        },
        {
          id: "sms-providers",
          title: "SMS Providers",
          body: P(
            `If SMS receipts or notifications are enabled, phone numbers and message content are shared with the SMS gateway to deliver messages.`,
          ),
        },
        {
          id: "cloud-providers",
          title: "Cloud Providers",
          body: P(
            `We use cloud hosting, database, authentication, and operational service providers to run the Service. Data is processed in the locations used by those providers and the deployed SEZA environment.`,
          ),
        },
        {
          id: "auth-lawful",
          title: "Legal, Compliance & Successors",
          body: P(
            `We may disclose information to comply with law, respond to lawful requests, protect our rights and users, or in connection with a merger, acquisition, or asset transfer.`,
          ),
        },
      ],
    },
    {
      id: "retention",
      title: "Data Retention",
      body: P(
        `We retain personal information for as long as reasonably necessary to provide the Service, protect accounts, resolve disputes, and meet legal, tax, accounting, or contractual requirements. Retention periods vary by record type, merchant instructions, backup cycles, and applicable law. Data may be deleted, aggregated, or de-identified when it is no longer required.`,
      ),
    },
    {
      id: "security",
      title: "Security Measures",
      body: (
        <p>
          We implement administrative, technical, and physical safeguards designed to protect
          personal information, including encryption, access control, and continuous monitoring. See
          our <a href="/legal/security-policy">Security Policy</a> for detail.
        </p>
      ),
    },
    {
      id: "encryption",
      title: "Encryption",
      body: P(
        `SEZA uses protected network connections and managed-service security features intended to safeguard stored information. Authentication credentials are handled through the configured authentication provider. No method of storage or transmission is completely secure.`,
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
            To exercise your rights, email <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a>
            .
          </p>
        </>
      ),
    },
    {
      id: "deletion",
      title: "Data Deletion Requests",
      body: P(
        `You may request deletion of eligible Account data. After verifying the request and confirming authority over the Account, we will take reasonable steps to delete or de-identify information that is not required for legal, tax, security, dispute-resolution, backup, or fraud-prevention purposes.`,
      ),
    },
    {
      id: "international",
      title: "International Transfers",
      body: P(
        `Your information may be processed in a country other than the one where you live. Where a cross-border transfer requires a specific legal safeguard, SEZA and the relevant service provider will use an available lawful mechanism as applicable to that transfer.`,
      ),
    },
    {
      id: "children",
      title: "Children's Privacy",
      body: P(
        `The Service is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided personal information, contact ${C.privacyEmail} and we will delete it.`,
      ),
    },
    {
      id: "changes",
      title: "Changes to Privacy Policy",
      body: P(
        `We may update this Privacy Policy as the Service, providers, or legal requirements change. When required, we will provide notice through the Service, email, or the website. The "Last updated" date at the top identifies the current version.`,
      ),
    },
    {
      id: "contact",
      title: "Contact Information",
      body: (
        <>
          <p>{C.companyName}</p>
          <p>Privacy requests and legal privacy notices are accepted electronically.</p>
          <p>
            Privacy: <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a>
          </p>
          <p>
            General: <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a>
          </p>
        </>
      ),
    },
  ],
};
