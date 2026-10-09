// Only server-verified requirements become setup instructions. No raw Stripe fields reach the POS.
export type ReaderSetupStep = "connect_stripe" | "verification" | "bank" | "review" | "address" | "location" | "retry" | "reader";
export type ReaderSetup = { step: ReaderSetupStep; checkedAt: string };
export const READER_SETUP: Record<ReaderSetupStep, { message: string; action: string; section?: "payments" | "general" }> = {
  connect_stripe: { message: "Set up your Stripe account to accept card payments.", action: "Set up Stripe", section: "payments" },
  verification: { message: "Finish verifying your business with Stripe.", action: "Finish verification", section: "payments" },
  bank: { message: "Add your bank account to finish payment setup.", action: "Add bank account", section: "payments" },
  review: { message: "Stripe is reviewing your information. SEZA will check again automatically.", action: "Check again" },
  address: { message: "Add your store address.", action: "Add store address", section: "general" },
  location: { message: "SEZA could not prepare this store’s card reader location. Try again or contact SEZA Support.", action: "Try again" },
  retry: { message: "SEZA could not check payment setup. Check your connection and try again.", action: "Try again" },
  reader: { message: "Connect your M2 reader to get started.", action: "Connect with USB" },
};
export function readerSetupUrl(step: ReaderSetupStep, storeId?: string) {
  const section = READER_SETUP[step].section;
  return section ? `https://dashboard.sezapos.com/settings?section=${section}&readerSetup=${step}${storeId ? `&readerStore=${encodeURIComponent(storeId)}` : ""}` : null;
}
