import type { LegalDocument } from "../types";
import { LEGAL_CONFIG as C } from "../config";

const P = (text: string) => <p>{text}</p>;

export const merchantAgreement: LegalDocument = {
  slug: "merchant-agreement",
  shortTitle: "Merchant Agreement",
  title: "SEZA POS Merchant Agreement",
  category: "Terms",
  summary:
    "The agreement governing a merchant's use of SEZA POS software, subscriptions, connected devices, support, and related services.",
  effectiveDate: "July 31, 2026",
  lastUpdated: "July 31, 2026",
  intro: (
    <p>
      This Merchant Agreement is a binding agreement between {C.companyName} ("SEZA," "we," or
      "us") and the business or other legal entity accepting it ("Merchant," "you," or "your").
      It applies when an authorized representative creates a merchant account, accepts an order or
      subscription, clicks to agree, or uses SEZA POS software or services on behalf of a business.
    </p>
  ),
  sections: [
    {
      id: "agreement-structure",
      title: "1. Agreement Structure",
      body: (
        <>
          <p>
            This Merchant Agreement, any order form or plan selection, the Terms of Service,
            Privacy Policy, Acceptable Use Policy, Data Processing Addendum, applicable pricing,
            and any service-specific terms presented to you together form the agreement between
            SEZA and Merchant (collectively, the "Agreement"). If an order form expressly conflicts
            with this Merchant Agreement, the order form controls only for that conflict.
          </p>
          <p>
            Third-party services, including payment processing, banking, telecommunications, app
            stores, hardware manufacturers, and connected integrations, are governed by their own
            agreements. Accepting this Agreement does not replace those third-party terms.
          </p>
        </>
      ),
    },
    {
      id: "authority",
      title: "2. Authority and Merchant Information",
      body: P(
        "The person accepting this Agreement represents that they are at least 18 years old, have authority to bind Merchant, and have provided accurate legal, contact, billing, tax, and business information. Merchant must keep that information current and promptly notify SEZA of changes that could affect account ownership, service eligibility, security, or billing.",
      ),
    },
    {
      id: "services",
      title: "3. SEZA Services",
      body: (
        <>
          <p>
            SEZA provides point-of-sale, inventory, employee, reporting, customer, receipt,
            device-management, support, and related business-management tools. Available features
            depend on the selected plan, supported devices, enabled integrations, and jurisdiction.
          </p>
          <p>
            SEZA may improve, replace, add, or retire features. We will use commercially reasonable
            efforts to provide advance notice when a material change removes a paid core feature,
            except where immediate action is required for security, legal, provider, or reliability
            reasons.
          </p>
        </>
      ),
    },
    {
      id: "merchant-responsibilities",
      title: "4. Merchant Responsibilities",
      body: (
        <ul>
          <li>Operate the business and sell goods or services lawfully.</li>
          <li>Obtain and maintain required licenses, permits, registrations, and age-verification procedures.</li>
          <li>Configure accurate prices, taxes, inventory, discounts, receipts, and refund rules.</li>
          <li>Train and supervise employees and promptly disable access for former or unauthorized personnel.</li>
          <li>Protect account passwords, employee PINs, passkeys, devices, and physical registers.</li>
          <li>Maintain reliable power, internet access, supported hardware, paper, and consumables.</li>
          <li>Review transactions, payouts, reports, and offline synchronization for accuracy.</li>
          <li>Provide legally required customer notices and honor privacy, refund, and consumer rights.</li>
        </ul>
      ),
    },
    {
      id: "accounts-security",
      title: "5. Accounts, Employees, and Security",
      body: P(
        "Merchant is responsible for all activity under its owner, manager, cashier, device, and integration credentials, except to the extent caused by SEZA's breach of this Agreement. Merchant must use role-based access, unique employee identities, manager approvals, and available security features. Merchant must notify SEZA promptly of suspected unauthorized access, lost devices, compromised credentials, or fraudulent activity.",
      ),
    },
    {
      id: "subscription-billing",
      title: "6. Subscription, Fees, and Billing",
      body: (
        <>
          <p>
            Merchant will pay the subscription, hardware, add-on, usage, support, tax, and other
            charges shown at checkout, on an order form, or in the billing portal. Unless stated
            otherwise, recurring subscriptions are billed in advance and renew automatically until
            cancelled before the next renewal date.
          </p>
          <p>
            Merchant authorizes SEZA and its billing provider to charge the payment method on file.
            Failed or overdue payments may result in retry attempts, late notices, restricted
            features, read-only access, suspension, or termination. Except where law requires
            otherwise, fees are non-refundable and partial billing periods are not refunded.
          </p>
        </>
      ),
    },
    {
      id: "payment-processing",
      title: "7. Payment Processing and Financial Services",
      body: (
        <>
          <p>
            SEZA is not a bank, card network, or payment processor unless a separate written
            agreement expressly states otherwise. Card acceptance, settlement, chargebacks,
            reserves, identity verification, prohibited businesses, and payment-method rules are
            provided by and subject to the merchant's selected payment provider.
          </p>
          <p>
            When Merchant connects a provider such as Stripe, Merchant may enter a direct agreement
            with that provider and must complete its onboarding. Merchant is responsible for
            disputes, refunds, negative balances, fines, taxes, card-network compliance, and the
            legality of transactions processed through its account.
          </p>
        </>
      ),
    },
    {
      id: "hardware",
      title: "8. Hardware and Connected Devices",
      body: P(
        "Merchant is responsible for selecting compatible devices and following setup, safety, network, and manufacturer instructions. Unless SEZA sells hardware under a separate warranty, third-party manufacturer warranties apply. SEZA does not guarantee that every printer, scanner, cash drawer, customer display, card terminal, operating system, or legacy device will be compatible. Merchant must test critical hardware and maintain a reasonable backup process before relying on it in production.",
      ),
    },
    {
      id: "offline-sync",
      title: "9. Offline Operation and Synchronization",
      body: P(
        "Some SEZA features may continue locally during an internet interruption. Offline functionality is limited and may not support card processing, remote updates, real-time inventory, email receipts, or immediate reporting. Merchant is responsible for monitoring pending synchronization and resolving failed or duplicate records. SEZA may use local transaction identifiers before a final server receipt number is assigned.",
      ),
    },
    {
      id: "merchant-data",
      title: "10. Merchant Data and Customer Data",
      body: (
        <>
          <p>
            As between the parties, Merchant retains its rights in product, employee, transaction,
            customer, and business data submitted to the Service ("Merchant Data"). Merchant grants
            SEZA a limited license to host, process, transmit, display, back up, and otherwise use
            Merchant Data to provide, secure, support, improve, and comply with law regarding the
            Service.
          </p>
          <p>
            Merchant is responsible for having a lawful basis to collect and use personal
            information and for providing required notices and choices. The Data Processing
            Addendum applies where SEZA processes personal information on Merchant's behalf.
          </p>
        </>
      ),
    },
    {
      id: "support",
      title: "11. Support and Service Availability",
      body: P(
        "SEZA will provide support according to the selected plan and published support channels. Response targets are goals, not guaranteed resolution times, unless a signed service-level agreement states otherwise. Maintenance, internet providers, third-party systems, force majeure events, device limitations, and emergency security work may affect availability.",
      ),
    },
    {
      id: "restrictions",
      title: "12. Acceptable Use and Restrictions",
      body: P(
        "Merchant may not use the Service for unlawful activity; prohibited products or payment activity; unauthorized surveillance; malware; harassment; infringement; credential sharing; attempts to bypass security, billing, limits, or access controls; reverse engineering except where law permits; or activity that harms SEZA, providers, merchants, customers, or the public. SEZA may investigate, restrict, or suspend activity presenting legal, security, fraud, or operational risk.",
      ),
    },
    {
      id: "intellectual-property",
      title: "13. Intellectual Property and License",
      body: P(
        "SEZA and its licensors own the Service, software, documentation, branding, interfaces, and related intellectual property. During the active subscription, SEZA grants Merchant a limited, revocable, non-exclusive, non-transferable, non-sublicensable license to use the Service for Merchant's internal business operations. No source code, ownership, or implied license is transferred.",
      ),
    },
    {
      id: "confidentiality",
      title: "14. Confidentiality",
      body: P(
        "Each party may receive non-public business, technical, security, pricing, or operational information from the other. The receiving party will use reasonable care to protect it, use it only for the Agreement, and disclose it only to personnel and providers with a need to know and confidentiality obligations. These duties do not apply to information that is public without breach, independently developed, rightfully received from another source, or required to be disclosed by law.",
      ),
    },
    {
      id: "warranties",
      title: "15. Warranties and Disclaimers",
      body: P(
        "Each party warrants that it has authority to enter the Agreement. Except for express commitments in the Agreement, and to the maximum extent permitted by law, the Service is provided on an 'as is' and 'as available' basis. SEZA disclaims implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement. SEZA does not warrant uninterrupted operation, error-free data, guaranteed sales results, universal hardware compatibility, or that the Service alone satisfies Merchant's legal obligations.",
      ),
    },
    {
      id: "liability",
      title: "16. Limitation of Liability",
      body: P(
        "To the maximum extent permitted by law, neither party will be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, goodwill, opportunities, or data, arising from the Agreement. Except for amounts Merchant owes, misuse of intellectual property, confidentiality breaches, fraud, willful misconduct, or liabilities that cannot legally be limited, each party's aggregate liability arising from the Service will not exceed the fees Merchant paid to SEZA for the affected Service during the twelve months before the event giving rise to the claim.",
      ),
    },
    {
      id: "indemnity",
      title: "17. Merchant Indemnity",
      body: P(
        "Merchant will defend and indemnify SEZA and its affiliates, personnel, and providers from third-party claims, losses, penalties, and reasonable costs arising from Merchant's products or services, unlawful business activity, tax or licensing obligations, customer disputes, employee conduct, Merchant Data, violation of payment-provider rules, or breach of the Agreement, except to the extent caused by SEZA's breach, gross negligence, or willful misconduct.",
      ),
    },
    {
      id: "term-termination",
      title: "18. Term, Suspension, and Termination",
      body: P(
        "The Agreement begins when accepted and continues until all subscriptions and services end. Merchant may cancel future renewals through the billing portal. SEZA may suspend or terminate access for nonpayment, material breach, security risk, fraud, unlawful conduct, provider requirement, or discontinued service. Where practical and appropriate, SEZA will provide notice and an opportunity to cure. Sections intended by their nature to survive will remain effective after termination.",
      ),
    },
    {
      id: "data-export",
      title: "19. Data Export and Account Closure",
      body: P(
        "Merchant should export records it is legally or operationally required to retain before account closure. Subject to law, security, backup cycles, disputes, and the Privacy Policy, SEZA may delete or de-identify Merchant Data after the account is closed. Account cancellation does not cancel separate agreements with payment processors, banks, hardware lessors, or other providers.",
      ),
    },
    {
      id: "disputes",
      title: "20. Governing Law and Disputes",
      body: P(
        `The Agreement is governed by ${C.governingLaw}, without regard to conflict-of-law rules. Before filing a claim, the parties will attempt in good faith for at least 30 days to resolve it through written notice to ${C.legalEmail}. Unless applicable law requires otherwise or the parties agree to arbitration in a separate signed agreement, exclusive venue lies in ${C.disputeVenue}. Either party may seek urgent injunctive relief for misuse of intellectual property, confidential information, or security systems.`,
      ),
    },
    {
      id: "changes",
      title: "21. Changes to this Agreement",
      body: P(
        "SEZA may update this Agreement to reflect product, provider, legal, security, or business changes. Material changes will be communicated through the Service, email, or another reasonable method before they take effect when required. Continued use after the effective date constitutes acceptance, unless applicable law requires a different form of consent.",
      ),
    },
    {
      id: "general",
      title: "22. General Terms",
      body: P(
        "Merchant may not assign the Agreement without SEZA's written consent, except in connection with a bona fide merger or sale of substantially all assets if the successor accepts the Agreement. SEZA may assign the Agreement as part of a corporate transaction or to an affiliate. Neither party is liable for delay caused by events beyond reasonable control. Failure to enforce a provision is not a waiver. If a provision is unenforceable, it will be limited to the minimum extent necessary and the remainder remains effective. The Agreement is the complete agreement regarding its subject matter and may be accepted electronically.",
      ),
    },
    {
      id: "contact",
      title: "23. Contact",
      body: (
        <p>
          Questions about this Merchant Agreement may be sent to <a href={`mailto:${C.legalEmail}`}>{C.legalEmail}</a>.
          Support requests should be sent to <a href={`mailto:${C.supportEmail}`}>{C.supportEmail}</a> or by calling {C.phoneDisplay}.
        </p>
      ),
    },
  ],
};
