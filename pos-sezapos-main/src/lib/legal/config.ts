/**
 * Public legal-contact configuration.
 *
 * SEZA does not publish an unverified physical address or phone number. Legal,
 * privacy, security and support notices are accepted through the dedicated
 * email addresses below until a public mailing address is formally adopted.
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
  phone: "",
  governingLaw: "the State of Florida, United States",
  disputeVenue: "the state or federal courts located in Collier County, Florida",
  effectiveDate: "July 22, 2026",
  lastUpdated: "July 22, 2026",
  billingProcessor: "Stripe",
} as const;

export type LegalConfig = typeof LEGAL_CONFIG;
