import { termsOfService } from "./docs/terms";
import { privacyPolicy } from "./docs/privacy";
import {
  cookiePolicy,
  refundPolicy,
  acceptableUsePolicy,
  dpa,
  securityPolicy,
  sla,
  copyrightPolicy,
  trademarkPolicy,
  dmcaPolicy,
  apiTerms,
  compliance,
  securityCenter,
} from "./docs/policies";
import type { LegalDocument } from "./types";

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  termsOfService,
  privacyPolicy,
  cookiePolicy,
  refundPolicy,
  acceptableUsePolicy,
  dpa,
  securityPolicy,
  sla,
  copyrightPolicy,
  trademarkPolicy,
  dmcaPolicy,
  apiTerms,
  compliance,
  securityCenter,
];

export function getLegalDoc(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

export const LEGAL_CATEGORIES: Array<{ id: LegalDocument["category"]; label: string; description: string }> = [
  { id: "Terms", label: "Terms & Contracts", description: "Agreements that govern use of the platform." },
  { id: "Privacy", label: "Privacy & Data", description: "How we handle personal data and privacy." },
  { id: "Policies", label: "Policies", description: "Rules and policies that keep the platform safe." },
  { id: "Trust", label: "Trust & Security", description: "Our security, availability, and compliance posture." },
  { id: "Developer", label: "Developer", description: "Terms for developer and API access." },
];
