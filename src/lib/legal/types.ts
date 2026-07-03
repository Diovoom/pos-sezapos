import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
  children?: LegalSection[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  shortTitle: string;
  category: "Terms" | "Privacy" | "Policies" | "Developer" | "Trust";
  summary: string;
  effectiveDate: string;
  lastUpdated: string;
  intro?: ReactNode;
  sections: LegalSection[];
};
