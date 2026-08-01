import type { LegalDocument } from "../types";
import { LEGAL_CONFIG as C } from "../config";

const P = (text: string) => <p>{text}</p>;

export const privacyChoices: LegalDocument = {
  slug: "privacy-choices",
  shortTitle: "Your Privacy Choices",
  title: "Your Privacy Choices",
  category: "Privacy",
  summary:
    "Control certain optional data uses, marketing communications, analytics, and privacy requests associated with SEZA.",
  effectiveDate: "August 1, 2026",
  lastUpdated: "August 1, 2026",
  intro: (
    <p>
      This page explains the privacy choices available to account holders, website visitors, and
      other individuals. It is different from the Privacy Policy, which describes SEZA's overall
      data practices. Available rights depend on your location and relationship with SEZA.
    </p>
  ),
  sections: [
    {
      id: "required-data",
      title: "Information Required to Provide SEZA",
      body: P(
        "SEZA must process certain account, security, transaction, device, billing, and support information to provide the Service, prevent fraud, maintain records, and comply with law. These necessary uses cannot be disabled while the related account or service remains active.",
      ),
    },
    {
      id: "analytics",
      title: "Optional Analytics and Product Improvement",
      body: P(
        "Where required, you may choose whether SEZA uses optional analytics technologies to understand feature usage, diagnose performance, and improve the owner dashboard and website. Disabling optional analytics does not disable essential security, authentication, transaction, or reliability measurements.",
      ),
    },
    {
      id: "marketing",
      title: "Marketing Communications",
      body: P(
        "You may unsubscribe from promotional email by using the unsubscribe link in the message. Operational messages such as receipts, security notices, billing notices, account changes, and support replies may still be sent because they are necessary to provide the Service.",
      ),
    },
    {
      id: "sale-sharing",
      title: "Sale or Sharing of Personal Information",
      body: P(
        "SEZA does not treat ordinary disclosures to service providers used to operate the Service as a sale of personal information. Where applicable law provides a right to opt out of a covered sale or sharing for cross-context behavioral advertising, you may submit that request through the privacy contact below. SEZA will verify and process eligible requests as required by law.",
      ),
    },
    {
      id: "sensitive-data",
      title: "Sensitive Personal Information",
      body: P(
        "SEZA uses sensitive information only for permitted purposes such as authentication, account security, fraud prevention, payment onboarding, legal compliance, and providing requested services. Where applicable law provides a right to limit additional uses, you may submit a request to the privacy contact below.",
      ),
    },
    {
      id: "rights-requests",
      title: "Access, Correction, Deletion, and Portability",
      body: P(
        "Depending on your location, you may request access to personal information, correction of inaccurate information, deletion, or a portable copy. Some information may be retained where necessary for transactions, taxes, security, disputes, legal obligations, or other permitted purposes. SEZA may verify identity and authority before completing a request.",
      ),
    },
    {
      id: "authorized-agent",
      title: "Authorized Agents and Appeals",
      body: P(
        "Where permitted, an authorized agent may submit a request for you. SEZA may require proof of authorization and direct identity verification. If local law provides an appeal right and a request is denied, the response will explain how to appeal.",
      ),
    },
    {
      id: "non-discrimination",
      title: "No Unlawful Discrimination",
      body: P(
        "SEZA will not unlawfully discriminate against an individual for exercising an applicable privacy right. Certain features may be unavailable when the information needed to provide them is deleted or cannot lawfully be processed.",
      ),
    },
    {
      id: "submit",
      title: "Submit a Privacy Request",
      body: (
        <p>
          Email <a href={`mailto:${C.privacyEmail}`}>{C.privacyEmail}</a> with the subject
          "Privacy Request." Include your name, account email, state or country, the right you wish
          to exercise, and enough information for us to locate and verify the relevant records. Do
          not send passwords, full payment-card numbers, or employee PINs.
        </p>
      ),
    },
  ],
};
