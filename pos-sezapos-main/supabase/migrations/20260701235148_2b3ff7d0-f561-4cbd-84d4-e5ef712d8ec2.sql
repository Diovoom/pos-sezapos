
-- Phase G1: Country Profiles & Localization Foundation

CREATE TABLE IF NOT EXISTS public.country_profiles (
  country_code text PRIMARY KEY,
  country_name text NOT NULL,
  default_language text NOT NULL DEFAULT 'en',
  default_locale text NOT NULL DEFAULT 'en-US',
  currency_code text NOT NULL,
  currency_symbol text NOT NULL,
  symbol_position text NOT NULL DEFAULT 'before', -- 'before' | 'after'
  decimal_precision int NOT NULL DEFAULT 2,
  thousands_sep text NOT NULL DEFAULT ',',
  decimal_sep text NOT NULL DEFAULT '.',
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY',
  time_format text NOT NULL DEFAULT 'h:mm A',
  address_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_format text,
  postal_regex text,
  paper_size text NOT NULL DEFAULT 'letter', -- 'letter' | 'a4'
  default_tax_rate numeric NOT NULL DEFAULT 0,
  tax_inclusive_default boolean NOT NULL DEFAULT false,
  receipt_format jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_reg_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rtl boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.country_profiles TO anon, authenticated;
GRANT ALL ON public.country_profiles TO service_role;
ALTER TABLE public.country_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "country_profiles readable by all" ON public.country_profiles FOR SELECT USING (true);

-- Extend stores with country/locale metadata
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.country_profiles(country_code),
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS paper_size text,
  ADD COLUMN IF NOT EXISTS address_format_override jsonb,
  ADD COLUMN IF NOT EXISTS phone_format_override text;

-- Extend profiles with user language preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text,
  ADD COLUMN IF NOT EXISTS preferred_locale text;

-- Seed country profiles
INSERT INTO public.country_profiles
  (country_code, country_name, default_language, default_locale, currency_code, currency_symbol, symbol_position, decimal_precision, thousands_sep, decimal_sep, date_format, time_format, paper_size, default_tax_rate, tax_inclusive_default, rtl, age_defaults, regions)
VALUES
  ('US','United States','en','en-US','USD','$','before',2,',','.','MM/DD/YYYY','h:mm A','letter',0.0825,false,false,'{"alcohol":21,"tobacco":21,"vape":21,"lottery":18,"cannabis":21}','["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]'),
  ('CA','Canada','en','en-CA','CAD','$','before',2,',','.','YYYY-MM-DD','h:mm A','letter',0.13,false,false,'{"alcohol":19,"tobacco":19,"vape":19,"cannabis":19}','["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]'),
  ('GB','United Kingdom','en','en-GB','GBP','£','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18,"vape":18,"lottery":18}','[]'),
  ('HT','Haiti','ht','ht-HT','HTG','G','before',2,',','.','DD/MM/YYYY','HH:mm','letter',0.10,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('MX','Mexico','es','es-MX','MXN','$','before',2,',','.','DD/MM/YYYY','HH:mm','letter',0.16,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('BR','Brazil','pt-BR','pt-BR','BRL','R$','before',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.17,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('FR','France','fr','fr-FR','EUR','€','after',2,' ',',','DD/MM/YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('DE','Germany','de','de-DE','EUR','€','after',2,'.',',','DD.MM.YYYY','HH:mm','a4',0.19,true,false,'{"alcohol":16,"tobacco":18}','[]'),
  ('ES','Spain','es','es-ES','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.21,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('IT','Italy','it','it-IT','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.22,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('NL','Netherlands','nl','nl-NL','EUR','€','before',2,'.',',','DD-MM-YYYY','HH:mm','a4',0.21,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('PL','Poland','pl','pl-PL','PLN','zł','after',2,' ',',','DD.MM.YYYY','HH:mm','a4',0.23,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('PT','Portugal','pt','pt-PT','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.23,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('RO','Romania','ro','ro-RO','RON','lei','after',2,'.',',','DD.MM.YYYY','HH:mm','a4',0.19,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('TR','Turkey','tr','tr-TR','TRY','₺','before',2,'.',',','DD.MM.YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('GR','Greece','el','el-GR','EUR','€','after',2,'.',',','DD/MM/YYYY','HH:mm','a4',0.24,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('RU','Russia','ru','ru-RU','RUB','₽','after',2,' ',',','DD.MM.YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('UA','Ukraine','uk','uk-UA','UAH','₴','after',2,' ',',','DD.MM.YYYY','HH:mm','a4',0.20,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('SA','Saudi Arabia','ar','ar-SA','SAR','﷼','after',2,',','.','DD/MM/YYYY','HH:mm','a4',0.15,true,true,'{}','[]'),
  ('IL','Israel','he','he-IL','ILS','₪','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.17,true,true,'{"alcohol":18,"tobacco":18}','[]'),
  ('IN','India','hi','hi-IN','INR','₹','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.18,true,false,'{"alcohol":21,"tobacco":18}','[]'),
  ('CN','China','zh-CN','zh-CN','CNY','¥','before',2,',','.','YYYY-MM-DD','HH:mm','a4',0.13,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('TW','Taiwan','zh-TW','zh-TW','TWD','NT$','before',0,',','.','YYYY/MM/DD','HH:mm','a4',0.05,true,false,'{"alcohol":18,"tobacco":20}','[]'),
  ('JP','Japan','ja','ja-JP','JPY','¥','before',0,',','.','YYYY/MM/DD','HH:mm','a4',0.10,true,false,'{"alcohol":20,"tobacco":20}','[]'),
  ('KR','Korea','ko','ko-KR','KRW','₩','before',0,',','.','YYYY-MM-DD','HH:mm','a4',0.10,true,false,'{"alcohol":19,"tobacco":19}','[]'),
  ('TH','Thailand','th','th-TH','THB','฿','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.07,true,false,'{"alcohol":20,"tobacco":20}','[]'),
  ('VN','Vietnam','vi','vi-VN','VND','₫','after',0,'.',',','DD/MM/YYYY','HH:mm','a4',0.10,true,false,'{"alcohol":18,"tobacco":18}','[]'),
  ('ID','Indonesia','id','id-ID','IDR','Rp','before',0,'.',',','DD/MM/YYYY','HH:mm','a4',0.11,true,false,'{"alcohol":21,"tobacco":18}','[]'),
  ('MY','Malaysia','ms','ms-MY','MYR','RM','before',2,',','.','DD/MM/YYYY','HH:mm','a4',0.06,true,false,'{"alcohol":21,"tobacco":18}','[]'),
  ('AU','Australia','en','en-AU','AUD','$','before',2,',','.','DD/MM/YYYY','h:mm A','a4',0.10,true,false,'{"alcohol":18,"tobacco":18}','["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"]')
ON CONFLICT (country_code) DO NOTHING;

-- Default existing stores to US when unset
UPDATE public.stores SET country_code = 'US' WHERE country_code IS NULL;
