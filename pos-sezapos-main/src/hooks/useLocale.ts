import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LocaleContext } from "@/lib/i18n/formatters";

type CountryProfile = {
  country_code: string;
  default_locale: string;
  currency_code: string;
  currency_symbol: string;
  symbol_position: "before" | "after";
  decimal_precision: number;
  thousands_sep: string;
  decimal_sep: string;
  date_format: string;
  time_format: string;
  paper_size: string;
  rtl: boolean;
  age_defaults: Record<string, number>;
  regions: string[];
};

const FALLBACK: LocaleContext = {
  locale: "en-US",
  currency: "USD",
  currencySymbol: "$",
  symbolPosition: "before",
  decimalPrecision: 2,
  thousandsSep: ",",
  decimalSep: ".",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "h:mm A",
};

export function useLocaleContext(): LocaleContext {
  const { data: store } = useQuery({
    queryKey: ["locale-store"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => (await (supabase.from as any)("stores").select("country_code,currency,locale,time_zone").limit(1).maybeSingle()).data,
    staleTime: 60_000,
  });

  const { data: country } = useQuery<CountryProfile | null>({
    queryKey: ["country-profile", store?.country_code ?? "US"],
    enabled: !!store,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("country_profiles")
        .select("*")
        .eq("country_code", store?.country_code ?? "US")
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60_000,
  });

  if (!country) return { ...FALLBACK, timeZone: store?.time_zone };

  return {
    locale: store?.locale || country.default_locale,
    currency: store?.currency || country.currency_code,
    currencySymbol: country.currency_symbol,
    symbolPosition: country.symbol_position,
    decimalPrecision: country.decimal_precision,
    thousandsSep: country.thousands_sep,
    decimalSep: country.decimal_sep,
    dateFormat: country.date_format,
    timeFormat: country.time_format,
    timeZone: store?.time_zone,
  };
}

export function useCountryProfile(code?: string) {
  return useQuery<CountryProfile | null>({
    queryKey: ["country-profile", code ?? "US"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("country_profiles")
        .select("*")
        .eq("country_code", code ?? "US")
        .maybeSingle();
      return data;
    },
    enabled: !!code,
    staleTime: 5 * 60_000,
  });
}

export function useCountryList() {
  return useQuery<Array<Pick<CountryProfile, "country_code" | "default_locale" | "currency_code" | "regions"> & { country_name: string }>>({
    queryKey: ["country-list"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("country_profiles")
        .select("country_code,country_name,default_locale,currency_code,regions")
        .order("country_name");
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });
}
