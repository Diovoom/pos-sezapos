import type { LegalDocument } from "@/lib/legal/types";
import { LEGAL_CONFIG as C } from "@/lib/legal/config";

const P = (s: string) => <p>{s}</p>;

export const cookiePolicy: LegalDocument = {
  slug: "cookies",
  shortTitle: "Cookie Policy",
  title: "Cookie Policy",
  category: "Privacy",
  summary:
    "How and why we use cookies, pixels, local storage, and similar technologies on our website and in the SEZA POS application.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "what",
      title: "What Are Cookies",
      body: P(
        `Cookies are small text files placed on your device by a website. Similar technologies include local storage, session storage, pixels, and SDKs. This Policy uses the term "cookies" to refer to all of them.`
      ),
    },
    {
      id: "categories",
      title: "Categories of Cookies and Similar Storage",
      body: (
        <ul>
          <li>
            <strong>Strictly necessary</strong> — required for the Service to function, such as
            authentication, load balancing, and CSRF protection. These cannot be disabled.
          </li>
          <li>
            <strong>Preferences</strong> — remember your language, currency, and interface settings.
          </li>
          <li>
            <strong>Analytics</strong> — may be used, with permission where required, to understand aggregate usage and improve the Service.
          </li>
          <li>
            <strong>Marketing</strong> — may be used only where you have opted in, to measure campaigns or provide relevant advertising.
          </li>
        </ul>
      ),
    },
    {
      id: "current-defaults",
      title: "Current Website Defaults",
      body: (
        <>
          <p>
            The public SEZA website stores your cookie preference in local browser storage under <code>seza.cookie-consent.v1</code>. Strictly necessary storage is active by default. Optional analytics and marketing choices default to off unless you select them.
          </p>
          <p>
            Selecting an optional category records your preference, but a third-party tool will only receive data if SEZA has actually enabled that tool on the relevant page. Changing a preference does not retroactively delete information already processed by a third party; use the provider's controls or contact us for help where applicable.
          </p>
        </>
      ),
    },
    {
      id: "first-third",
      title: "First-Party vs Third-Party Cookies",
      body: P(
        `First-party cookies are set by our domains and used to operate the Service. Third-party cookies may be set by providers we use for analytics, error monitoring, or content delivery. We select vendors that offer reasonable privacy and security commitments.`
      ),
    },
    {
      id: "manage",
      title: "Managing Cookies",
      body: P(
        `You can control non-essential cookies through the in-product cookie banner or your browser settings. Disabling cookies may cause parts of the Service to malfunction. Some browsers offer a "Do Not Track" signal; we treat opt-out preferences expressed through recognized signals such as Global Privacy Control as valid opt-outs where required by law.`
      ),
    },
    {
      id: "changes",
      title: "Changes",
      body: P(
        `We may update this Cookie Policy from time to time. The "Last updated" date reflects the most recent revision.`
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>
          Questions? Email <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a>.
        </p>
      ),
    },
  ],
};

export const refundPolicy: LegalDocument = {
  slug: "refund",
  shortTitle: "Refund & Cancellation",
  title: "Refund & Cancellation Policy",
  category: "Policies",
  summary:
    "The terms that apply when you cancel a subscription or request a refund from SEZA POS.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "scope",
      title: "Scope",
      body: P(
        `This Policy applies to SEZA POS Subscription fees sold by ${C.companyName} and securely processed through ${C.billingProcessor}. It does not apply to third-party charges (for example, payment-processing fees charged under a Merchant's own processor agreement, SMS carrier fees, or hardware purchases governed by separate sale terms) or to sales a Merchant makes to its own customers.`
      ),
    },
    {
      id: "trial",
      title: "Free Trials",
      body: P(
        `You will not be charged during the current 14-day free trial because no payment card is required and the trial does not automatically convert to a paid Subscription. To continue paid access after the trial, an authorized Owner must select a plan and complete Stripe checkout.`
      ),
    },
    {
      id: "monthly",
      title: "Monthly Subscriptions",
      body: P(
        `Monthly Subscription fees are generally non-refundable. Cancelling a monthly Subscription stops future renewals; you retain access until the end of the current billing period.`
      ),
    },
    {
      id: "billing-errors",
      title: "Duplicate Charges and Billing Errors",
      body: P(
        `If you believe you were charged twice, charged after a confirmed cancellation, or billed an amount different from the checkout total, contact ${C.supportEmail} within 30 days of the charge. We will investigate verified billing errors and, when appropriate, correct or refund the affected amount to the original payment method.`
      ),
    },
    {
      id: "annual",
      title: "Annual Subscriptions",
      body: P(
        `Annual Subscriptions may be cancelled at any time. Cancellation stops the next renewal but does not entitle you to a refund of fees already paid, except where required by applicable consumer protection law or where we, in our discretion, offer a pro-rata refund.`
      ),
    },
    {
      id: "how-to-cancel",
      title: "How to Cancel",
      body: P(
        `You may cancel your Subscription at any time in the Billing section of Settings, or by emailing ${C.supportEmail} from the Owner email address. Cancellations take effect at the end of the current billing period.`
      ),
    },
    {
      id: "chargebacks",
      title: "Chargebacks",
      body: P(
        `Please contact us before initiating a chargeback. Chargebacks initiated without first contacting us may result in suspension of the affected Account pending resolution.`
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>Refund questions: <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a>.</p>
      ),
    },
  ],
};

export const acceptableUsePolicy: LegalDocument = {
  slug: "acceptable-use",
  shortTitle: "Acceptable Use",
  title: "Acceptable Use Policy",
  category: "Policies",
  summary:
    "Rules that govern how you may use the SEZA POS platform to keep the Service safe, lawful, and reliable for everyone.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "purpose",
      title: "Purpose",
      body: P(
        `This Policy protects our users, our platform, and the general public. It applies to anyone who accesses the Service, including Merchants, Employees, contractors, and integration partners.`
      ),
    },
    {
      id: "prohibited-content",
      title: "Prohibited Content and Activities",
      body: (
        <ul>
          <li>Anything illegal under applicable law, including the sale of prohibited or restricted goods without authorization.</li>
          <li>Fraudulent activity, deceptive business practices, or misrepresentation of goods or services.</li>
          <li>Infringement of intellectual property or publicity rights.</li>
          <li>Harassment, hate speech, sexual exploitation, or content that endangers minors.</li>
          <li>Distribution of malware, phishing content, or spyware.</li>
          <li>Unauthorized data collection, scraping, or bulk transmission of unsolicited messages.</li>
          <li>Efforts to compromise, probe, or overload our infrastructure.</li>
        </ul>
      ),
    },
    {
      id: "restricted-industries",
      title: "Restricted Industries",
      body: P(
        `Certain regulated industries (for example, alcohol, tobacco, cannabis, firearms, adult content, pharmaceuticals) may only use the Service where local law permits and where the Merchant maintains all required licenses. We may require additional verification for restricted-industry Accounts.`
      ),
    },
    {
      id: "messaging",
      title: "Messaging & Marketing",
      body: P(
        `SMS and email features may only be used to send messages that comply with applicable telecom and anti-spam laws. You must have a lawful basis (consent, prior business relationship, or a receipt request) and must honor opt-out requests promptly.`
      ),
    },
    {
      id: "enforcement",
      title: "Enforcement",
      body: P(
        `Violations may result in warnings, feature restrictions, suspension, or termination, at our discretion. Serious violations may be reported to law enforcement. We will use good-faith judgment and, where practicable, provide notice and an opportunity to cure.`
      ),
    },
    {
      id: "report",
      title: "Reporting Abuse",
      body: (
        <p>
          Report abuse to <a href={`mailto:${C.abuseEmail}`}>{C.abuseEmail}</a>.
        </p>
      ),
    },
  ],
};

export const dpa: LegalDocument = {
  slug: "dpa",
  shortTitle: "Data Processing Information",
  title: "Data Processing Information",
  category: "Privacy",
  summary:
    "How SEZA handles merchant-controlled personal data and how to request a signed data-processing addendum when one is required.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "roles",
      title: "Merchant and SEZA Roles",
      body: P(
        `For personal data a Merchant submits about employees or customers, the Merchant generally decides why and how that data is used. SEZA processes that data to provide the Service, subject to the Terms, Privacy Policy, merchant instructions, and applicable law.`
      ),
    },
    {
      id: "processing",
      title: "Processing Activities",
      body: P(
        `Processing may include hosting, organizing, retrieving, transmitting, troubleshooting, securing, backing up, and deleting data as necessary to operate the Service. The categories involved may include account details, employee records, customer contact details, transaction information, and device or diagnostic information.`
      ),
    },
    {
      id: "providers",
      title: "Service Providers",
      body: P(
        `SEZA may use hosting, database, authentication, payment, email, SMS, monitoring, and support providers to operate the Service. Those providers receive only the information reasonably necessary for their role and are subject to their own contractual and legal obligations.`
      ),
    },
    {
      id: "requests",
      title: "Rights Requests and Security Incidents",
      body: P(
        `SEZA will provide reasonable assistance when a Merchant needs to respond to a verified privacy request or investigate a confirmed incident involving Merchant-controlled data, taking into account the nature of the Service and information available to SEZA.`
      ),
    },
    {
      id: "signed-addendum",
      title: "Signed Addendum",
      body: (
        <p>
          This page is informational and is not a signed data-processing agreement. Merchants that require a separate DPA or international-transfer terms should contact <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a> before placing regulated data in the Service.
        </p>
      ),
    },
  ],
};

export const securityPolicy: LegalDocument = {
  slug: "security-policy",
  shortTitle: "Security Policy",
  title: "Security Policy",
  category: "Trust",
  summary:
    "A practical description of the safeguards SEZA uses and the responsibilities shared with merchants.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "connections",
      title: "Protected Connections",
      body: P(
        `SEZA production services are intended to use HTTPS/TLS for data moving between supported devices, browsers, payment services, and SEZA infrastructure. Merchants should use supported software, trusted networks, and current operating-system security updates.`
      ),
    },
    {
      id: "access",
      title: "Authentication and Access Control",
      body: P(
        `SEZA uses account authentication, store-scoped authorization, employee roles, manager approvals, and separate platform-admin access. Merchants are responsible for protecting passwords and PINs, removing former employees, and assigning only the permissions each person needs.`
      ),
    },
    {
      id: "payments",
      title: "Payment Information",
      body: P(
        `SEZA subscription card details are entered into Stripe-hosted payment experiences. SEZA is designed to receive tokens, identifiers, and payment status instead of full subscription card numbers. Merchant card acceptance depends on the connected payment provider and supported hardware.`
      ),
    },
    {
      id: "audit",
      title: "Audit and Operational Records",
      body: P(
        `The Service includes audit-oriented records for sensitive workflows such as refunds, voids, cash movements, permission changes, device changes, and administrative actions. Coverage depends on the feature, configuration, and successful delivery of the event.`
      ),
    },
    {
      id: "availability",
      title: "Availability and Recovery",
      body: P(
        `SEZA uses managed service providers and application safeguards intended to reduce data-loss and outage risk. No internet service or software platform is completely secure or continuously available, and merchants should retain appropriate business records and contingency procedures.`
      ),
    },
    {
      id: "incident",
      title: "Incident Response",
      body: P(
        `SEZA investigates credible security reports, works to contain confirmed incidents, restores safe operation, and provides notices when required by applicable law or contract. The timing and content of any notice depend on the facts available during the investigation.`
      ),
    },
    {
      id: "report",
      title: "Report a Security Issue",
      body: (
        <p>
          Send suspected vulnerabilities to <a href={`mailto:${C.securityEmail}`}>{C.securityEmail}</a>. Do not disrupt live stores, use social engineering, access unrelated data, or publicly disclose sensitive details before SEZA has a reasonable opportunity to investigate.
        </p>
      ),
    },
  ],
};

export const sla: LegalDocument = {
  slug: "sla",
  shortTitle: "Service Availability",
  title: "Service Availability Notice",
  category: "Trust",
  summary:
    "Important information about availability, maintenance, third-party dependencies, and continuity planning.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "no-public-sla",
      title: "No Public Uptime Guarantee",
      body: P(
        `Unless SEZA and a Merchant sign a separate written service-level agreement, the Service is provided under the availability terms in the Terms of Service and does not include a guaranteed uptime percentage or automatic service credits.`
      ),
    },
    {
      id: "maintenance",
      title: "Maintenance and Changes",
      body: P(
        `SEZA may perform maintenance or deploy changes that temporarily affect access. When practical, material planned interruptions will be communicated through the Service, email, or an available status channel.`
      ),
    },
    {
      id: "dependencies",
      title: "Third-Party Dependencies",
      body: P(
        `Availability can be affected by internet providers, cloud platforms, payment processors, messaging providers, device manufacturers, app stores, and merchant hardware that SEZA does not control.`
      ),
    },
    {
      id: "offline",
      title: "Offline Operations",
      body: P(
        `Supported Android configurations may record eligible cash sales while offline and synchronize later. Offline mode has limits, requires prior setup, and does not make card payments or cloud-only functions available without connectivity.`
      ),
    },
    {
      id: "continuity",
      title: "Merchant Continuity Planning",
      body: P(
        `Merchants should maintain working internet or backup connectivity where appropriate, keep required tax and accounting records, train staff on outage procedures, and verify that devices have synchronized before closing a shift or uninstalling the application.`
      ),
    },
  ],
};

export const copyrightPolicy: LegalDocument = {
  slug: "copyright",
  shortTitle: "Copyright Policy",
  title: "Copyright Policy",
  category: "Policies",
  summary:
    "How SEZA POS handles copyright ownership and respects the intellectual property of others.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "ownership",
      title: "Ownership of the Service",
      body: P(
        `The Service, including its source code, object code, design, user interface, documentation, and marketing materials, is protected by copyright and other intellectual property laws and is owned by ${C.companyName} or its licensors.`
      ),
    },
    {
      id: "your-content",
      title: "Your Content",
      body: P(
        `You retain ownership of copyrighted material you upload to the Service (for example, product images, logos, descriptions). You grant us a limited license to host, display, transmit, and process that content solely to operate the Service.`
      ),
    },
    {
      id: "respect",
      title: "Respect for Third-Party Rights",
      body: P(
        `You must not upload, display, or distribute through the Service any content that infringes copyright or other rights of a third party.`
      ),
    },
    {
      id: "dmca",
      title: "Copyright Complaints",
      body: (
        <p>
          To report copyright infringement, follow the procedure in our{" "}
          <a href="/legal/dmca">DMCA Policy</a>.
        </p>
      ),
    },
  ],
};

export const trademarkPolicy: LegalDocument = {
  slug: "trademark",
  shortTitle: "Trademark Policy",
  title: "Trademark Policy",
  category: "Policies",
  summary:
    "Guidelines for using SEZA POS trademarks and how we handle reports of trademark misuse.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "marks",
      title: "Our Marks",
      body: P(
        `"${C.productName}", the ${C.productName} logo, and related word marks and design marks are trademarks or registered trademarks of ${C.companyName}. All rights are reserved.`
      ),
    },
    {
      id: "permitted",
      title: "Permitted Use",
      body: P(
        `You may use our word mark in a strictly nominative sense to refer to the Service (for example, "We accept payments via ${C.productName}"). You may not modify our logos, imply endorsement, or use our marks in a way that could confuse users about the source of goods or services.`
      ),
    },
    {
      id: "prohibited",
      title: "Prohibited Use",
      body: (
        <ul>
          <li>Using our marks in a domain name, app name, or company name without permission.</li>
          <li>Incorporating our marks into your own logo or product identity.</li>
          <li>Using our marks in a way that is misleading, defamatory, or associated with unlawful activity.</li>
        </ul>
      ),
    },
    {
      id: "report",
      title: "Reporting Misuse",
      body: (
        <p>Report suspected misuse to <a href={`mailto:${C.legalEmail}`}>{C.legalEmail}</a>.</p>
      ),
    },
  ],
};

export const dmcaPolicy: LegalDocument = {
  slug: "dmca",
  shortTitle: "DMCA Policy",
  title: "DMCA Policy",
  category: "Policies",
  summary:
    "The procedure for submitting copyright infringement notices and counter-notices under the U.S. Digital Millennium Copyright Act.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "notice",
      title: "Submitting a DMCA Notice",
      body: (
        <>
          <p>
            If you believe content on the Service infringes your copyright, please send a written
            notice to our designated agent that includes:
          </p>
          <ol>
            <li>Your physical or electronic signature.</li>
            <li>Identification of the copyrighted work claimed to have been infringed.</li>
            <li>Identification of the material claimed to be infringing and information reasonably sufficient to permit us to locate it.</li>
            <li>Your contact information (name, address, phone, email).</li>
            <li>A statement that you have a good-faith belief that use of the material is not authorized by the copyright owner, its agent, or the law.</li>
            <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are authorized to act on behalf of the copyright owner.</li>
          </ol>
        </>
      ),
    },
    {
      id: "counter",
      title: "Counter-Notice",
      body: P(
        `If your content was removed and you believe it was removed by mistake or misidentification, you may submit a counter-notice containing your contact information, identification of the removed material, a statement under penalty of perjury of your good-faith belief that removal was in error, and your consent to jurisdiction of the appropriate federal court.`
      ),
    },
    {
      id: "repeat",
      title: "Repeat Infringers",
      body: P(
        `In accordance with the DMCA and other applicable laws, we may terminate the Accounts of repeat infringers in appropriate circumstances.`
      ),
    },
    {
      id: "agent",
      title: "Designated Agent",
      body: (
        <>
          <p>{C.companyName} — Copyright Notice Contact</p>
          <p>Electronic copyright notices may be sent to:</p>
          <p>Email: <a href={`mailto:${C.dmcaAgentEmail}`}>{C.dmcaAgentEmail}</a></p>
          <p>We may request additional information or a physical delivery method when required to process a notice under applicable law.</p>
        </>
      ),
    },
  ],
};

export const apiTerms: LegalDocument = {
  slug: "api-terms",
  shortTitle: "API Terms",
  title: "API Terms",
  category: "Developer",
  summary:
    "Terms that govern access to and use of the SEZA POS APIs, SDKs, and developer tools, in preparation for future developer access.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  intro: (
    <p>
      These API Terms supplement the Terms of Service and apply whenever you access {C.productName}{" "}
      APIs, SDKs, webhooks, or other developer interfaces (the "<strong>APIs</strong>").
    </p>
  ),
  sections: [
    {
      id: "license",
      title: "License",
      body: P(
        `Subject to these API Terms, we grant you a limited, revocable, non-exclusive, non-transferable license to access and use the APIs solely to build, test, and operate integrations that interoperate with the Service on behalf of authorized Merchants.`
      ),
    },
    {
      id: "auth",
      title: "Authentication & Credentials",
      body: P(
        `You must authenticate every API request with credentials issued to you. Credentials are personal to your integration and must not be shared. You are responsible for all activity conducted under your credentials and must promptly rotate any credential you believe has been compromised.`
      ),
    },
    {
      id: "limits",
      title: "Rate Limits & Fair Use",
      body: P(
        `You must respect published rate limits and back-off signals. We may throttle, suspend, or revoke access if your usage threatens the stability, security, or fair use of the Service by others.`
      ),
    },
    {
      id: "changes",
      title: "API Changes",
      body: P(
        `We may add, modify, deprecate, or remove APIs. Where reasonably practical we will provide advance notice of breaking changes and maintain deprecated endpoints for a transition period.`
      ),
    },
    {
      id: "data",
      title: "Data Handling",
      body: P(
        `Data you obtain through the APIs may include personal information about Merchants and their customers. You must only use such data as authorized by the Merchant, secure it with appropriate safeguards, and delete it when no longer needed.`
      ),
    },
    {
      id: "prohibited",
      title: "Prohibited Uses",
      body: (
        <ul>
          <li>Creating a substantially similar or competing product using API-derived data.</li>
          <li>Scraping, bulk exporting, or caching data beyond what is necessary for the integration.</li>
          <li>Circumventing rate limits, authentication, or logging.</li>
          <li>Storing full payment card numbers or authentication credentials outside of PCI-approved systems.</li>
        </ul>
      ),
    },
    {
      id: "support",
      title: "Support & Beta APIs",
      body: P(
        `Certain APIs may be labeled "beta", "preview", or similar. Beta APIs are provided as-is, may change or be withdrawn at any time, and are not covered by the SLA.`
      ),
    },
    {
      id: "termination",
      title: "Termination",
      body: P(
        `We may suspend or terminate API access at any time for breach of these Terms or to protect the Service. On termination, you must promptly cease using the APIs and delete cached data.`
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>Developer relations: <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a>.</p>
      ),
    },
  ],
};

export const accessibilityStatement: LegalDocument = {
  slug: "accessibility",
  shortTitle: "Accessibility",
  title: "Accessibility Statement",
  category: "Trust",
  summary:
    "SEZA Technologies Inc.'s commitment to making the SEZA website and point-of-sale experience usable by people with disabilities.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "commitment",
      title: "Our Commitment",
      body: P(
        `${C.companyName} is committed to providing digital experiences that are usable by people with a wide range of abilities, devices, and assistive technologies. Accessibility is considered in our design, engineering, content, and support processes.`
      ),
    },
    {
      id: "standards",
      title: "Standards We Use",
      body: P(
        `We aim to align the public website and core merchant workflows with the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA where reasonably achievable. This is an ongoing effort and does not mean every page or third-party integration is currently fully conformant.`
      ),
    },
    {
      id: "features",
      title: "Accessibility Practices",
      body: (
        <ul>
          <li>Keyboard-accessible navigation and visible focus states.</li>
          <li>Semantic headings, labels, landmarks, and descriptive link text.</li>
          <li>Color contrast and status indicators that do not rely on color alone.</li>
          <li>Support for browser zoom, responsive layouts, and reduced-motion preferences.</li>
          <li>Alternative text for meaningful images and accessible names for controls.</li>
        </ul>
      ),
    },
    {
      id: "third-party",
      title: "Third-Party Services",
      body: P(
        `Some functions are provided through third parties, including Stripe checkout, device operating systems, browser features, and connected hardware. Those services have their own accessibility practices, but we welcome reports when an integration creates a barrier.`
      ),
    },
    {
      id: "feedback",
      title: "Feedback and Assistance",
      body: (
        <p>
          If you encounter an accessibility barrier or need information in another format, email <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a>. Please include the page or feature, the assistive technology or device you used when relevant, and the problem you experienced. We will make reasonable efforts to respond and provide an accessible alternative.
        </p>
      ),
    },
    {
      id: "updates",
      title: "Ongoing Improvement",
      body: P(
        `We review accessibility as the product changes and prioritize issues that block account access, checkout, merchant administration, support, or legal information. This Statement will be updated as our practices and testing mature.`
      ),
    },
  ],
};

export const compliance: LegalDocument = {
  slug: "compliance",
  shortTitle: "Compliance Information",
  title: "Compliance Information",
  category: "Trust",
  summary:
    "A transparent overview of payment handling, merchant obligations, and the limits of SEZA's compliance role.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "merchant-responsibility",
      title: "Merchant Responsibility",
      body: P(
        `Each Merchant is responsible for laws that apply to its business, products, employees, taxes, receipts, refunds, customer communications, privacy notices, age-restricted sales, and required licenses. SEZA provides software tools and does not act as the Merchant's lawyer, accountant, tax adviser, or licensing authority.`
      ),
    },
    {
      id: "billing",
      title: "SEZA Subscription Billing",
      body: P(
        `SEZA uses Stripe to process subscription checkout and billing. Stripe's services, verification requirements, availability, and separate terms apply. SEZA does not claim to be a bank, card network, or payment processor.`
      ),
    },
    {
      id: "card-data",
      title: "Card Data",
      body: P(
        `SEZA is designed so full subscription card details are entered into Stripe-hosted payment fields rather than stored by SEZA. Merchant payment acceptance must use a supported payment provider and integration, and the Merchant remains responsible for its own applicable payment-security obligations.`
      ),
    },
    {
      id: "certifications",
      title: "Certifications and Attestations",
      body: P(
        `SEZA does not represent that it holds a certification, audit report, or regulatory approval unless that status is expressly identified in current written materials from SEZA. Provider certifications do not automatically certify SEZA or any Merchant.`
      ),
    },
    {
      id: "questions",
      title: "Compliance Questions",
      body: (
        <p>
          Contact <a href={`mailto:${C.legalEmail}`}>{C.legalEmail}</a> before relying on SEZA for a regulated workflow or contractual compliance requirement.
        </p>
      ),
    },
  ],
};

export const securityCenter: LegalDocument = {
  slug: "security-center",
  shortTitle: "Security Center",
  title: "Security Center",
  category: "Trust",
  summary:
    "Security contacts, responsible disclosure expectations, and links to SEZA's current public security information.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "overview",
      title: "Current Public Information",
      body: (
        <p>
          Review the <a href="/security">Security page</a>, <a href="/legal/security-policy">Security Policy</a>, <a href="/legal/privacy">Privacy Policy</a>, and <a href="/legal/compliance">Compliance Information</a> for SEZA's current public statements. These pages are not independent certifications or audit reports.
        </p>
      ),
    },
    {
      id: "disclosure",
      title: "Responsible Disclosure",
      body: P(
        `Security research must avoid disrupting live services, changing or deleting data, accessing data beyond what is necessary to demonstrate a finding, social engineering, denial-of-service testing, and public disclosure before SEZA has had a reasonable opportunity to investigate.`
      ),
    },
    {
      id: "report",
      title: "Report a Vulnerability",
      body: (
        <p>
          Email <a href={`mailto:${C.securityEmail}`}>{C.securityEmail}</a> with the affected page or feature, reproduction steps, potential impact, and a safe way to contact you. Please do not include unnecessary personal information or full payment credentials.
        </p>
      ),
    },
    {
      id: "response",
      title: "Response Expectations",
      body: P(
        `SEZA will review good-faith reports and prioritize them based on reproducibility, severity, affected data, and risk to merchants. A submission does not create a contractual right to payment, public credit, or a specific remediation deadline unless SEZA agrees in writing.`
      ),
    },
  ],
};
