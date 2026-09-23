export type CardProcessingPricing = {
  enabled: boolean;
  percentRate: number;
  fixedFee: number;
};

export type CardPriceQuote = {
  cashPrice: number;
  cardPrice: number;
  adjustment: number;
  estimatedProcessingFee: number;
  estimatedMerchantNet: number;
};

const MAX_PERCENT_RATE = 0.25;
const MAX_FIXED_FEE = 25;

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Price recovery must never round down below the merchant target.
  return Math.ceil((value - 1e-9) * 100) / 100;
}

export function normalizeCardProcessingPricing(input: {
  recover_card_processing_costs?: unknown;
  card_processing_percent?: unknown;
  card_processing_fixed_fee?: unknown;
} | null | undefined): CardProcessingPricing {
  const rawPercent = Number(input?.card_processing_percent ?? 0);
  const rawFixed = Number(input?.card_processing_fixed_fee ?? 0);

  return {
    enabled: Boolean(input?.recover_card_processing_costs),
    percentRate: Number.isFinite(rawPercent)
      ? Math.min(MAX_PERCENT_RATE, Math.max(0, rawPercent))
      : 0,
    fixedFee: Number.isFinite(rawFixed)
      ? Math.min(MAX_FIXED_FEE, Math.max(0, rawFixed))
      : 0,
  };
}

export function estimatedProcessingFee(
  chargedAmount: number,
  pricing: Pick<CardProcessingPricing, "percentRate" | "fixedFee">,
): number {
  const amount = Math.max(0, roundMoney(chargedAmount));
  if (amount <= 0) return 0;
  return roundMoney(amount * pricing.percentRate + pricing.fixedFee);
}

export function quoteCardPrice(
  merchantTarget: number,
  pricing: CardProcessingPricing,
): CardPriceQuote {
  const cashPrice = Math.max(0, roundMoney(merchantTarget));
  const { percentRate, fixedFee } = pricing;

  if (!pricing.enabled || cashPrice <= 0 || (percentRate <= 0 && fixedFee <= 0)) {
    const fee = estimatedProcessingFee(cashPrice, pricing);
    return {
      cashPrice,
      cardPrice: cashPrice,
      adjustment: 0,
      estimatedProcessingFee: fee,
      estimatedMerchantNet: roundMoney(cashPrice - fee),
    };
  }

  if (percentRate >= 1) {
    return {
      cashPrice,
      cardPrice: cashPrice,
      adjustment: 0,
      estimatedProcessingFee: 0,
      estimatedMerchantNet: cashPrice,
    };
  }

  // Solve: cardPrice - (cardPrice * percentRate + fixedFee) = merchantTarget.
  const rawCardPrice = (cashPrice + fixedFee) / (1 - percentRate);
  const cardPrice = Math.max(cashPrice, roundUpMoney(rawCardPrice));
  const fee = estimatedProcessingFee(cardPrice, pricing);

  return {
    cashPrice,
    cardPrice,
    adjustment: roundMoney(cardPrice - cashPrice),
    estimatedProcessingFee: fee,
    estimatedMerchantNet: roundMoney(cardPrice - fee),
  };
}

export function isCardPaymentMethod(method: string): boolean {
  return ["card", "tap", "apple_pay", "google_pay"].includes(method);
}
