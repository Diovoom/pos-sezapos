/**
 * Public legal-contact configuration.
 *
 * Public contact details used across SEZA marketing, support, and legal pages.
 * A physical mailing address is not published until one is formally adopted.
 */
export const LEGAL_CONFIG = {
  companyName: "SEZA Technologies",
  productName: "SEZA POS",
  website: "https://sezapos.com",
  businessAddress: "",
  supportEmail: "support@sezapos.com",
  privacyEmail: "privacy@sezapos.com",
  legalEmail: "legal@sezapos.com",
  securityEmail: "security@sezapos.com",
  dmcaAgentEmail: "dmca@sezapos.com",
  abuseEmail: "abuse@sezapos.com",
  phone: "+18286758348",
  phoneDisplay: "+1 (828) 675-8348",
  governingLaw: "the State of Florida, United States",
  disputeVenue: "the state or federal courts located in Collier County, Florida",
  effectiveDate: "July 22, 2026",
  lastUpdated: "July 22, 2026",
  billingProcessor: "Stripe",
} as const;

export type LegalConfig = typeof LEGAL_CONFIG;
