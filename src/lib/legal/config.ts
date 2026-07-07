// Central placeholders for the Legal Center. Update these values to reflect
// the actual registered business information.

export const LEGAL_CONFIG = {
  companyName: "SEZA TECHNOLOGIES",
  productName: "SEZA POS",
  website: "https://sezapos.com",
  businessAddress: "[Business Address — Street, City, State/Region, Postal Code, Country]",
  supportEmail: "support@sezapos.com",
  privacyEmail: "privacy@sezapos.com",
  legalEmail: "legal@sezapos.com",
  securityEmail: "security@sezapos.com",
  dmcaAgentEmail: "dmca@sezapos.com",
  abuseEmail: "abuse@sezapos.com",
  phone: "[+1 (000) 000-0000]",
  governingLaw: "the State of Delaware, United States",
  arbitrationVenue: "the American Arbitration Association (AAA), Wilmington, Delaware",
  effectiveDate: "July 1, 2026",
  lastUpdated: "July 3, 2026",
  merchantOfRecord: "SEZA TECHNOLOGIES",
} as const;

export type LegalConfig = typeof LEGAL_CONFIG;
