import type { LegalDocument } from "@/lib/legal/types";
import { LEGAL_CONFIG as C } from "@/lib/legal/config";

const P = (s: string) => <p>{s}</p>;

export const termsOfService: LegalDocument = {
  slug: "terms",
  shortTitle: "Terms of Service",
  title: "Terms of Service",
  category: "Terms",
  summary:
    "The agreement that governs your access to and use of the SEZA POS platform, including subscriptions, billing, permitted use, and legal responsibilities.",
  effectiveDate: C.effectiveDate,
  lastUpdated: C.lastUpdated,
  intro: (
    <>
      <p>
        These Terms of Service ("<strong>Terms</strong>") form a binding agreement between you and{" "}
        <strong>{C.companyName}</strong> ("<strong>{C.productName}</strong>", "we", "us", "our") and
        govern your access to and use of {C.productName} and all related websites, applications,
        APIs, integrations, and documentation (collectively, the "<strong>Service</strong>"). By
        creating an account, subscribing to a plan, clicking "I agree", or otherwise accessing the
        Service, you agree to be bound by these Terms.
      </p>
      <p className="mt-3">
        If you are entering into these Terms on behalf of a company or other legal entity, you
        represent that you have authority to bind that entity, in which case "you" and "your" refer
        to that entity.
      </p>
    </>
  ),
  sections: [
    {
      id: "definitions",
      title: "Definitions",
      body: (
        <ul>
          <li><strong>Account</strong> — a registered user profile used to access the Service.</li>
          <li><strong>Business Account</strong> — an Account controlled by an owner or authorized representative of a merchant that operates one or more Stores.</li>
          <li><strong>Store</strong> — a workspace inside the Service representing a physical or online retail location.</li>
          <li><strong>Merchant</strong> — the business entity that owns a Business Account.</li>
          <li><strong>Employee Account</strong> — a sub-account created by a Merchant for its staff.</li>
          <li><strong>Customer Data</strong> — information about a Merchant's end customers processed through the Service.</li>
          <li><strong>Transaction Data</strong> — sales, refunds, tax, tender, and payment records generated in the Service.</li>
          <li><strong>Subscription</strong> — a paid plan giving access to the Service for a defined billing cycle.</li>
          <li><strong>Billing Processor</strong> — {C.billingProcessor}, which securely processes subscription checkout, invoices, and saved payment methods for SEZA.</li>
        </ul>
      ),
    },
    {
      id: "acceptance",
      title: "Acceptance of Terms",
      body: P(
        `By registering, subscribing, or using the Service in any way, you acknowledge that you have read, understood, and agree to be bound by these Terms and any policies referenced herein, including our Privacy Policy, Acceptable Use Policy, and Data Processing Information. If you do not agree, you must not use the Service.`
      ),
    },
    {
      id: "eligibility",
      title: "Eligibility",
      body: (
        <>
          <p>
            You must be at least 18 years old (or the age of majority in your jurisdiction) and
            legally capable of entering into a binding contract to use the Service. The Service is
            not directed to children under 13 and we do not knowingly collect personal information
            from them.
          </p>
          <p>
            You may not use the Service if you are barred from doing so under applicable law or are
            located in, or ordinarily resident of, a country or region subject to comprehensive
            sanctions administered by the United States, the European Union, or the United Kingdom.
          </p>
        </>
      ),
    },
    {
      id: "account-registration",
      title: "Account Registration",
      body: (
        <>
          <p>
            To use most features of the Service you must register an Account and provide accurate,
            current, and complete information, including a valid email address. You are responsible
            for maintaining the confidentiality of your credentials and for all activities that
            occur under your Account. You agree to notify us immediately at{" "}
            <a href={`mailto:${C.securityEmail}`}>{C.securityEmail}</a> of any unauthorized access.
          </p>
          <p>
            We may refuse registration, suspend, or terminate any Account at our discretion where
            required to protect the Service, other users, or comply with applicable law.
          </p>
        </>
      ),
    },
    {
      id: "business-accounts",
      title: "Business Accounts",
      body: P(
        `A Business Account may be created by a Merchant to operate one or more Stores. The individual who creates the Business Account (the "Owner") is deemed to have authority to bind the Merchant to these Terms, to configure the Store, to grant and revoke Employee Account access, and to designate billing contacts. Ownership disputes are the sole responsibility of the Merchant; we will follow the direction of the recorded Owner until a court order or notarized transfer document is presented.`
      ),
    },
    {
      id: "merchant-responsibilities",
      title: "Merchant Responsibilities",
      body: (
        <>
          <p>
            Merchants are responsible for lawful operation of their business, including obtaining
            all licenses, permits, and registrations needed to sell their products (for example,
            tobacco, alcohol, lottery, firearms, pharmaceutical, or age-restricted goods). Merchants
            are also responsible for the accuracy of product data, pricing, tax configurations,
            promotional rules, and customer receipts generated through the Service.
          </p>
          <p>
            Merchants are the controllers of Customer Data collected through their Stores. They must
            provide their customers with a compliant privacy notice, obtain any consents required
            under applicable law, and honor customer rights requests.
          </p>
        </>
      ),
    },
    {
      id: "employee-accounts",
      title: "Employee Accounts",
      body: P(
        `Merchants may create Employee Accounts to permit staff to operate the Service. The Merchant is responsible for authorizing, training, monitoring, and revoking Employee Accounts, and for all acts and omissions of anyone using an Employee Account. Employees must comply with these Terms as if they were the Merchant.`
      ),
    },
    {
      id: "subscription-plans",
      title: "Subscription Plans",
      body: P(
        `Access to the Service is provided under one or more Subscription plans described on our pricing page. Features, transaction volumes, location counts, and support levels vary by plan. We may add, modify, or discontinue plans from time to time; changes to your current plan will only take effect at renewal unless we notify you otherwise.`
      ),
    },
    {
      id: "billing",
      title: "Billing",
      body: P(
        `Subscriptions are sold by ${C.companyName} and billed in advance on a monthly or annual basis. ${C.billingProcessor} securely processes checkout, invoices, and the payment method you authorize. You authorize us, acting through ${C.billingProcessor}, to charge that payment method for Subscription fees, applicable taxes, add-ons, and disclosed usage charges. If a payment fails, we may retry it, provide a grace period, limit paid features, or suspend the Subscription until the balance is resolved.`
      ),
    },
    {
      id: "automatic-renewal",
      title: "Automatic Renewal",
      body: P(
        `Subscriptions renew automatically for successive periods of the same length at the then-current rates unless cancelled before the renewal date through your billing settings. We will send a renewal reminder for annual plans a reasonable time before the renewal date to the email on file.`
      ),
    },
    {
      id: "payment-processing",
      title: "Payment Processing",
      body: (
        <>
          <p>
            Subscription payments are securely processed by {C.billingProcessor} and are also subject
            to its applicable terms and privacy notice. Payment card details are tokenized and handled
            by the payment provider; SEZA does not store full card numbers on its own servers.
          </p>
          <p>
            For customer-facing card payments made through a connected Stripe Terminal account or another
            supported provider, the Merchant must maintain the required processor account and remains
            responsible for its products, customers, disputes, refunds, taxes, and compliance with card-network rules.
          </p>
        </>
      ),
    },
    {
      id: "taxes",
      title: "Taxes",
      body: P(
        `Subscription fees are exclusive of taxes unless stated otherwise. Applicable taxes may be calculated and shown during Stripe checkout based on the information you provide. ${C.companyName} is responsible for tax obligations on its Subscription sales where required. Merchants are separately responsible for calculating, collecting, reporting, and remitting taxes on the goods or services they sell to their own customers through the Service.`
      ),
    },
    {
      id: "free-trials",
      title: "Free Trials",
      body: P(
        `We currently offer a 14-day free trial without requiring a credit card. The trial begins after the Account is created and any required email verification is completed. The trial does not automatically become a paid Subscription and we will not charge you unless an authorized Owner actively selects a plan and completes Stripe checkout. When the trial ends, paid features may be limited until a plan is selected. Only one free trial is available per Merchant unless we agree otherwise in writing.`
      ),
    },
    {
      id: "upgrades",
      title: "Upgrades",
      body: P(
        `You may upgrade your Subscription at any time. Upgrades take effect immediately and we will prorate the difference for the remainder of the current billing cycle. Upgraded features become available as soon as payment is confirmed.`
      ),
    },
    {
      id: "downgrades",
      title: "Downgrades",
      body: P(
        `Downgrades take effect at the start of the next billing cycle. It is your responsibility to bring your usage within the limits of the downgraded plan (for example, number of Stores, users, or products) before the change takes effect. Data exceeding those limits may become read-only.`
      ),
    },
    {
      id: "refunds",
      title: "Refund Policy",
      body: (
        <>
          <p>
            Except where required by applicable consumer protection law, Subscription fees are
            non-refundable. If we materially fail to deliver the Service and cannot remedy the
            failure within a reasonable time after notice from you, we may, at our discretion,
            issue a pro-rata refund for the affected period.
          </p>
          <p>
            Full details are available in the <a href="/legal/refund">Refund &amp; Cancellation Policy</a>.
          </p>
        </>
      ),
    },
    {
      id: "cancellation",
      title: "Cancellation",
      body: P(
        `You may cancel your Subscription at any time from the Billing section in Settings. Cancellation stops future renewals; you retain access through the end of the paid period. We do not offer partial-month refunds. Deletion of your data after cancellation is described in the Privacy Policy.`
      ),
    },
    {
      id: "suspension",
      title: "Suspension",
      body: P(
        `We may suspend your Account or specific features without notice if we reasonably believe there is a threat to the security or integrity of the Service, if you materially breach these Terms or our Acceptable Use Policy, if your payment method fails, or if required by law. We will restore access as soon as reasonably practicable once the cause is resolved.`
      ),
    },
    {
      id: "termination",
      title: "Termination",
      body: P(
        `Either party may terminate this agreement at any time for convenience with respect to future renewals. We may terminate immediately for cause if you breach these Terms and fail to cure the breach within 15 days of notice, or immediately without notice if the breach is not curable. Upon termination, your right to use the Service ends and we may delete your data as described in the Privacy Policy.`
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable Use",
      body: (
        <>
          <p>
            You must use the Service in accordance with our{" "}
            <a href="/legal/acceptable-use">Acceptable Use Policy</a>. In summary, you must not use
            the Service to violate law, infringe intellectual property, transmit malware, harass
            others, or interfere with the Service's operation.
          </p>
        </>
      ),
    },
    {
      id: "prohibited-activities",
      title: "Prohibited Activities",
      body: (
        <ul>
          <li>Reselling, sublicensing, renting, or timesharing the Service without our written consent.</li>
          <li>Reverse engineering, decompiling, or attempting to extract source code, except as permitted by law.</li>
          <li>Circumventing usage limits, authentication, rate limits, or security controls.</li>
          <li>Uploading unlawful, infringing, defamatory, or malicious content.</li>
          <li>Using the Service to process payments for prohibited categories under applicable card network rules.</li>
          <li>Sending unsolicited SMS or email messages to customers who have not opted in.</li>
        </ul>
      ),
    },
    {
      id: "ip",
      title: "Intellectual Property",
      body: P(
        `The Service, including all software, interfaces, designs, trademarks, logos, and documentation, is owned by ${C.companyName} or its licensors and is protected by intellectual property laws. Nothing in these Terms transfers any ownership rights to you. Feedback you provide about the Service may be used by us without restriction or compensation.`
      ),
    },
    {
      id: "license",
      title: "Software License",
      body: P(
        `Subject to your compliance with these Terms and payment of applicable fees, we grant you a limited, non-exclusive, non-transferable, non-sublicensable right to access and use the Service for the internal business purposes of the Merchant during the term of your Subscription.`
      ),
    },
    {
      id: "pos-usage",
      title: "POS Usage",
      body: P(
        `The Service is a point-of-sale and business-management platform. You are responsible for entering accurate product, price, tax, and inventory information, and for verifying that receipts, refunds, and reports reflect actual transactions. We provide the Service as a tool; you are the legal seller of any goods or services offered through it.`
      ),
    },
    {
      id: "inventory",
      title: "Inventory Responsibility",
      body: P(
        `Inventory quantities in the Service are maintained based on activity you record. We do not independently verify physical stock levels. You are responsible for periodic stock counts, shrinkage tracking, and reconciling the Service with your physical inventory.`
      ),
    },
    {
      id: "customer-data",
      title: "Customer Data",
      body: P(
        `Customer Data collected through the Service (for example, names, phone numbers, email addresses, purchase history, loyalty balances) belongs to the Merchant, who is the data controller. We process Customer Data as a service provider / processor on the Merchant's instructions and in accordance with the Privacy Policy, our Data Processing Information, and any separately signed data-processing addendum.`
      ),
    },
    {
      id: "data-ownership",
      title: "Data Ownership",
      body: P(
        `As between you and us, you retain all rights, title, and interest in your data. You grant us a worldwide, royalty-free license to host, transmit, process, back up, and display your data solely to operate and improve the Service, to provide support, and as otherwise permitted by these Terms.`
      ),
    },
    {
      id: "integrations",
      title: "Third-Party Integrations",
      body: P(
        `The Service may integrate with third-party products (for example, payment processors, SMS providers, accounting platforms, e-commerce platforms). Your use of a third-party integration is governed by the applicable third party's terms and privacy notice. We are not responsible for third-party services and disclaim liability for their acts, omissions, availability, or content.`
      ),
    },
    {
      id: "sms-receipts",
      title: "SMS Receipts",
      body: P(
        `If you enable SMS receipts, you are responsible for obtaining any consents required under applicable telecom and consumer protection laws (including TCPA in the United States, PECR in the United Kingdom, and equivalent regulations elsewhere) before sending SMS to your customers. You must honor opt-out requests promptly. Message and data rates may apply to recipients.`
      ),
    },
    {
      id: "email-receipts",
      title: "Email Receipts",
      body: P(
        `Email receipts are sent from our platform on behalf of the Merchant. You must not use email receipts to send marketing content unless the recipient has opted in and you comply with applicable anti-spam laws (CAN-SPAM, CASL, GDPR/ePrivacy).`
      ),
    },
    {
      id: "offline-mode",
      title: "Offline Mode",
      body: P(
        `Where supported, the Service may allow limited operation while the device is offline. Transactions recorded offline are synchronized when connectivity is restored. You are responsible for keeping devices online often enough to prevent data loss and for reviewing sync results. Certain features (for example, real-time inventory across multiple lanes, SMS receipts) are not available offline.`
      ),
    },
    {
      id: "cloud-sync",
      title: "Cloud Synchronization",
      body: P(
        `The Service synchronizes data across your devices and locations through our cloud infrastructure. Latency, ordering, and conflict resolution behave as described in the Service documentation. We make reasonable efforts to preserve data integrity but do not guarantee that concurrent edits will always be resolved as you might expect; you are responsible for reviewing critical records.`
      ),
    },
    {
      id: "availability",
      title: "Service Availability",
      body: (
        <>
          <p>
            We aim for high availability of the Service as described in our{" "}
            <a href="/legal/sla">Service Level Agreement</a>. The Service is provided on an
            "as available" basis, and no software service is guaranteed to be uninterrupted or
            error-free.
          </p>
        </>
      ),
    },
    {
      id: "maintenance",
      title: "Maintenance",
      body: P(
        `We may perform scheduled and emergency maintenance on the Service. Where reasonably practical we will provide advance notice of scheduled maintenance. Emergency maintenance may be performed without notice to protect the security or integrity of the Service.`
      ),
    },
    {
      id: "security",
      title: "Security",
      body: (
        <>
          <p>
            We implement administrative, technical, and physical safeguards designed to protect the
            Service and your data, as further described in the{" "}
            <a href="/legal/security-policy">Security Policy</a> and{" "}
            <a href="/legal/security-center">Security Center</a>. You are responsible for
            configuring the Service securely (for example, strong passwords, appropriate user
            roles, device security).
          </p>
        </>
      ),
    },
    {
      id: "confidentiality",
      title: "Confidentiality",
      body: P(
        `Each party will protect the other's confidential information using at least the same care it uses for its own confidential information of similar importance, and in no event less than a reasonable standard of care. Confidential information does not include information that is publicly available, independently developed, or lawfully received from a third party without confidentiality obligations.`
      ),
    },
    {
      id: "disclaimer",
      title: "Disclaimer of Warranties",
      body: P(
        `EXCEPT AS EXPRESSLY PROVIDED IN THESE TERMS, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR MEET YOUR REQUIREMENTS.`
      ),
    },
    {
      id: "liability",
      title: "Limitation of Liability",
      body: P(
        `TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE AMOUNTS YOU PAID TO US FOR THE SERVICE IN THE 12 MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.`
      ),
    },
    {
      id: "indemnification",
      title: "Indemnification",
      body: P(
        `You will defend, indemnify, and hold harmless ${C.companyName} and its affiliates, officers, directors, employees, and agents from and against any claims, damages, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to (a) your use of the Service in breach of these Terms, (b) your products, services, or content, (c) your violation of any law or third-party right, or (d) any dispute between you and a customer, employee, or supplier.`
      ),
    },
    {
      id: "governing-law",
      title: "Governing Law",
      body: P(
        `These Terms are governed by the laws of ${C.governingLaw}, without regard to conflict-of-laws principles. The United Nations Convention on Contracts for the International Sale of Goods does not apply.`
      ),
    },
    {
      id: "dispute-resolution",
      title: "Dispute Resolution and Venue",
      body: P(
        `Before filing a formal claim, each party agrees to give the other written notice and at least 30 days to attempt a good-faith resolution. Unless applicable law requires a different venue, any court proceeding arising from these Terms or the Service must be brought in ${C.disputeVenue}, and each party consents to that venue. Either party may seek immediate injunctive relief when necessary to protect data, confidential information, or intellectual property.`
      ),
    },
    {
      id: "force-majeure",
      title: "Force Majeure",
      body: P(
        `Neither party will be liable for any delay or failure to perform (other than payment obligations) caused by circumstances beyond its reasonable control, including acts of God, war, terrorism, civil disturbance, pandemic, labor dispute, government action, or failure of the internet or public utilities.`
      ),
    },
    {
      id: "changes",
      title: "Changes to Terms",
      body: P(
        `We may update these Terms from time to time. If we make a material change, we will provide notice (for example, via email to the Owner or an in-product notice) at least 15 days before the change takes effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.`
      ),
    },
    {
      id: "contact",
      title: "Contact Information",
      body: (
        <>
          <p>{C.companyName}</p>
          <p>Legal notices are accepted electronically at the address below.</p>
          <p>Email: <a href={`mailto:${C.legalEmail}`}>{C.legalEmail}</a></p>
          <p>Website: <a href={C.website}>{C.website}</a></p>
        </>
      ),
    },
  ],
};
