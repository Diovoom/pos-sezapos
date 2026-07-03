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
      title: "Categories of Cookies We Use",
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
            <strong>Analytics</strong> — help us understand aggregate usage and improve the Service.
          </li>
          <li>
            <strong>Marketing</strong> — used only where you have opted in, to measure the
            effectiveness of our marketing campaigns.
          </li>
        </ul>
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
        `This Policy applies to Subscription fees paid to ${C.companyName} through our Merchant of Record, ${C.merchantOfRecord}. It does not apply to third-party charges (for example, payment processing fees, SMS carrier fees, or hardware) or to sales you make to your own customers.`
      ),
    },
    {
      id: "trial",
      title: "Free Trials",
      body: P(
        `You will not be charged during a free trial. You may cancel at any time before the trial ends to avoid being billed. If you continue past the trial, your payment method is charged and normal refund terms apply.`
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
  shortTitle: "Data Processing Agreement",
  title: "Data Processing Agreement",
  category: "Privacy",
  summary:
    "Contractual terms governing the processing of personal data by SEZA POS on behalf of Merchants under GDPR, UK GDPR, and comparable regulations.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "roles",
      title: "Roles and Scope",
      body: P(
        `Where the Merchant acts as a controller of personal data (for example, Customer Data collected through the Store), ${C.companyName} acts as a processor. This DPA forms part of the Terms of Service.`
      ),
    },
    {
      id: "subject-matter",
      title: "Subject Matter, Duration & Purpose",
      body: P(
        `The subject matter is the provision of the Service. The duration matches the term of the Subscription. The purpose of processing is to operate the Service in accordance with Merchant instructions and the Terms.`
      ),
    },
    {
      id: "data-categories",
      title: "Categories of Data & Data Subjects",
      body: P(
        `Personal data processed may include identification and contact details, transaction records, communication preferences, and technical identifiers. Data subjects include Merchant personnel and Merchant's end customers.`
      ),
    },
    {
      id: "processor-obligations",
      title: "Processor Obligations",
      body: (
        <ul>
          <li>Process personal data only on documented instructions from the Merchant.</li>
          <li>Ensure that persons authorized to process personal data are bound by confidentiality obligations.</li>
          <li>Implement appropriate technical and organizational security measures.</li>
          <li>Assist the Merchant in responding to data subject requests and complying with security, breach notification, and impact assessment obligations.</li>
          <li>Delete or return personal data at the end of the Subscription, subject to legal retention.</li>
        </ul>
      ),
    },
    {
      id: "subprocessors",
      title: "Sub-processors",
      body: P(
        `The Merchant provides general authorization for the use of sub-processors, subject to our maintaining a current list available on request. We will impose on each sub-processor data protection obligations that are no less protective than this DPA and remain responsible for their performance.`
      ),
    },
    {
      id: "transfers",
      title: "International Transfers",
      body: P(
        `Where personal data is transferred outside the EEA, UK, or Switzerland, we rely on the European Commission's Standard Contractual Clauses (and the UK IDTA / addendum where relevant) or another lawful transfer mechanism.`
      ),
    },
    {
      id: "breach",
      title: "Personal Data Breach",
      body: P(
        `We will notify the Merchant without undue delay after becoming aware of a personal data breach affecting the Merchant's personal data and provide reasonable information to enable the Merchant to meet its notification obligations.`
      ),
    },
    {
      id: "audit",
      title: "Audits",
      body: P(
        `We make available on reasonable request the information necessary to demonstrate compliance with this DPA. Audits may be conducted through independent third-party attestations (for example, SOC 2 reports, if available) or, where required by law, through on-site inspection subject to reasonable notice and confidentiality.`
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>DPA requests: <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a>.</p>
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
    "Our approach to protecting the confidentiality, integrity, and availability of the SEZA POS platform and the data entrusted to us.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "governance",
      title: "Security Governance",
      body: P(
        `Security is owned at the executive level and operationalized across engineering, IT, and operations. Policies are reviewed at least annually and following material changes to the Service or the threat landscape.`
      ),
    },
    {
      id: "access",
      title: "Access Control",
      body: P(
        `Access to production systems is limited to personnel with a documented business need, granted on the principle of least privilege, and reviewed on a recurring basis. Administrative access requires multi-factor authentication and is logged.`
      ),
    },
    {
      id: "encryption",
      title: "Encryption",
      body: P(
        `Data in transit is protected with TLS 1.2 or higher. Data at rest is protected with AES-256 or equivalent. Cryptographic keys are managed by our cloud provider's key management service and rotated on a defined schedule.`
      ),
    },
    {
      id: "network",
      title: "Network Security",
      body: P(
        `Production infrastructure is segmented and protected by firewalls, security groups, and intrusion detection. Public endpoints are protected by rate limits, WAF rules, and DDoS mitigations provided by our infrastructure partners.`
      ),
    },
    {
      id: "vuln",
      title: "Vulnerability Management",
      body: P(
        `We maintain a vulnerability management program that includes dependency scanning, static analysis, container image scanning, and periodic third-party assessments. Critical vulnerabilities are remediated on an expedited timeline.`
      ),
    },
    {
      id: "logging",
      title: "Logging & Monitoring",
      body: P(
        `Security-relevant events across our infrastructure and application are logged, retained for an appropriate period, and monitored for anomalies. Alerts trigger a documented response process.`
      ),
    },
    {
      id: "personnel",
      title: "Personnel Security",
      body: P(
        `Personnel undergo background checks where permitted by law, sign confidentiality agreements, and complete recurring security awareness training. Access is revoked promptly on role change or departure.`
      ),
    },
    {
      id: "response",
      title: "Incident Response",
      body: P(
        `We maintain a documented incident response plan covering detection, containment, eradication, recovery, and post-incident review. Affected customers are notified without undue delay in accordance with law and contract.`
      ),
    },
    {
      id: "contact",
      title: "Report a Vulnerability",
      body: (
        <p>
          Please report suspected vulnerabilities to <a href={`mailto:${C.securityEmail}`}>{C.securityEmail}</a>.
          See our <a href="/legal/security-center">Security Center</a> for our responsible disclosure program.
        </p>
      ),
    },
  ],
};

export const sla: LegalDocument = {
  slug: "sla",
  shortTitle: "Service Level Agreement",
  title: "Service Level Agreement",
  category: "Trust",
  summary:
    "Our target service availability for the SEZA POS platform and the remedies available when we fall short.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "target",
      title: "Availability Target",
      body: P(
        `We target a monthly uptime percentage of 99.9% for the core Service (checkout, sync, and read APIs), measured as (Total Minutes - Downtime Minutes) / Total Minutes × 100.`
      ),
    },
    {
      id: "exclusions",
      title: "Exclusions",
      body: (
        <ul>
          <li>Scheduled maintenance announced in advance.</li>
          <li>Force majeure events (as defined in the Terms).</li>
          <li>Failures of third-party services outside our control, including internet, payment processors, and SMS carriers.</li>
          <li>Issues caused by customer misuse, misconfiguration, or unsupported hardware.</li>
        </ul>
      ),
    },
    {
      id: "credits",
      title: "Service Credits",
      body: (
        <>
          <p>
            If we fail to meet the availability target in a calendar month, eligible paying
            Merchants may request a service credit against future Subscription fees:
          </p>
          <ul>
            <li>Uptime between 99.0% and 99.9%: 10% of that month's fees.</li>
            <li>Uptime between 95.0% and 99.0%: 25% of that month's fees.</li>
            <li>Uptime below 95.0%: 50% of that month's fees.</li>
          </ul>
          <p>
            Credits are the sole and exclusive remedy for availability failures. Requests must be
            submitted within 30 days of the affected month.
          </p>
        </>
      ),
    },
    {
      id: "support",
      title: "Support Response",
      body: P(
        `We target first-response times based on issue severity: Critical (production outage) within 2 hours, High within 8 business hours, Medium within 1 business day, Low within 3 business days.`
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>Status updates: <a href={C.website}>{C.website}</a> · Support: <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a></p>
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
          <p>{C.companyName} — DMCA Designated Agent</p>
          <p>{C.businessAddress}</p>
          <p>Email: <a href={`mailto:${C.dmcaAgentEmail}`}>{C.dmcaAgentEmail}</a></p>
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

export const compliance: LegalDocument = {
  slug: "compliance",
  shortTitle: "Compliance",
  title: "Compliance",
  category: "Trust",
  summary:
    "Overview of the regulatory frameworks and industry standards our platform aligns with, and how we support customer compliance.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  intro: (
    <p>
      This page summarizes the regulatory frameworks and industry standards that inform how we
      build and operate {C.productName}. It is provided for informational purposes only and does
      not by itself constitute a certification or legal advice.
    </p>
  ),
  sections: [
    {
      id: "pci",
      title: "PCI DSS",
      body: P(
        `We do not store full primary account numbers (PANs) on our servers. Payment card data is captured and tokenized by PCI-DSS certified payment providers. Our platform is designed to help Merchants stay within the applicable SAQ scope for their integration.`
      ),
    },
    {
      id: "gdpr",
      title: "GDPR",
      body: P(
        `We support Merchants subject to the EU General Data Protection Regulation with a Data Processing Agreement, appropriate international transfer mechanisms, sub-processor transparency, and tools to help respond to data subject rights requests.`
      ),
    },
    {
      id: "ccpa",
      title: "CCPA / CPRA",
      body: P(
        `We assist Merchants subject to the California Consumer Privacy Act (as amended by the CPRA) in responding to consumer requests. We do not "sell" or "share" personal information within the meaning of the CCPA.`
      ),
    },
    {
      id: "soc2",
      title: "SOC 2",
      body: P(
        `Our long-term roadmap includes formal SOC 2 attestation covering Security and Availability trust services criteria. Interim status and current control coverage are available on request under NDA.`
      ),
    },
    {
      id: "other",
      title: "Other Frameworks",
      body: (
        <ul>
          <li>Payment card network rules (Visa, Mastercard, American Express, Discover) applicable to integrated payments.</li>
          <li>Anti-money-laundering (AML) and know-your-customer (KYC) obligations handled by our Merchant of Record.</li>
          <li>Consumer protection and telecom regulations applicable to receipts and messaging (TCPA, CAN-SPAM, CASL, ePrivacy).</li>
          <li>Regional accessibility standards (WCAG 2.1 AA) guide our product design.</li>
        </ul>
      ),
    },
    {
      id: "shared",
      title: "Shared Responsibility",
      body: P(
        `Compliance is a shared responsibility. We are responsible for the security and compliance of the platform; Merchants are responsible for the lawful operation of their business, accurate configuration of the Service, and their own compliance programs.`
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>Compliance inquiries: <a href={`mailto:${C.legalEmail}`}>{C.legalEmail}</a>.</p>
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
    "A single place to learn how we protect the SEZA POS platform, our infrastructure, and your data.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  sections: [
    {
      id: "encryption",
      title: "Encryption",
      body: P(
        `Data is encrypted in transit with TLS 1.2 or higher and at rest with AES-256 or equivalent. Encryption keys are managed by our cloud provider's managed key service and rotated on a defined schedule.`
      ),
    },
    {
      id: "auth",
      title: "Secure Authentication",
      body: P(
        `We support strong password requirements and offer multi-factor authentication for account owners. Sessions are protected against CSRF and hijacking, and suspicious sign-in attempts are throttled and monitored.`
      ),
    },
    {
      id: "access",
      title: "Access Controls",
      body: P(
        `Role-based access control lets Merchants grant Employees the minimum permissions needed to do their job. Administrative access to production systems is limited to a small group of authorized personnel, is logged, and requires multi-factor authentication.`
      ),
    },
    {
      id: "backups",
      title: "Data Backups",
      body: P(
        `Production data is backed up automatically to durable storage on a recurring schedule, with point-in-time recovery for the primary database. Backup restoration is tested periodically.`
      ),
    },
    {
      id: "dr",
      title: "Disaster Recovery",
      body: P(
        `Our disaster recovery plan covers loss of a data center, region-wide provider outages, and data corruption. Recovery time and recovery point objectives are documented and reviewed regularly.`
      ),
    },
    {
      id: "ir",
      title: "Incident Response",
      body: P(
        `A documented incident response plan governs how we detect, contain, eradicate, recover from, and communicate about security incidents. Affected customers are notified without undue delay in accordance with law and contract.`
      ),
    },
    {
      id: "infra",
      title: "Infrastructure Security",
      body: P(
        `The platform runs on reputable cloud infrastructure with strong physical, network, and platform security. Environments are isolated between production, staging, and development. Secrets are stored in a managed secrets service and never checked into source code.`
      ),
    },
    {
      id: "vm",
      title: "Vulnerability Management",
      body: P(
        `We continuously scan dependencies, container images, and infrastructure for known vulnerabilities. Findings are triaged based on severity and exploitability. Critical fixes are prioritized on an expedited timeline and independent assessments are conducted periodically.`
      ),
    },
    {
      id: "disclosure",
      title: "Responsible Disclosure",
      body: (
        <>
          <p>
            We appreciate the security research community. If you believe you have discovered a
            vulnerability affecting {C.productName}, please report it to{" "}
            <a href={`mailto:${C.securityEmail}`}>{C.securityEmail}</a>. Please:
          </p>
          <ul>
            <li>Give us a reasonable time to investigate and remediate before public disclosure.</li>
            <li>Avoid privacy violations, service disruption, or data destruction while researching.</li>
            <li>Only test against Accounts you own or have explicit permission to test.</li>
          </ul>
          <p>
            We will not pursue legal action against researchers who follow these guidelines in
            good faith.
          </p>
        </>
      ),
    },
  ],
};
