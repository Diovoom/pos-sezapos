import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enUS from "./locales/en-US/common.json";
import es from "./locales/es/common.json";
import fr from "./locales/fr/common.json";
import ht from "./locales/ht/common.json";
import ptBR from "./locales/pt-BR/common.json";
import ar from "./locales/ar/common.json";
import he from "./locales/he/common.json";

export const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

export const SUPPORTED_LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "ht", name: "Kreyòl Ayisyen" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "pt", name: "Português" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "ro", name: "Română" },
  { code: "tr", name: "Türkçe" },
  { code: "el", name: "Ελληνικά" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "ar", name: "العربية" },
  { code: "he", name: "עברית" },
  { code: "hi", name: "हिन्दी" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "th", name: "ไทย" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ms", name: "Bahasa Melayu" },
];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "en-US": { common: enUS },
      en: { common: enUS },
      es: { common: es },
      fr: { common: fr },
      ht: { common: ht },
      "pt-BR": { common: ptBR },
      ar: { common: ar },
      he: { common: he },
    },
    fallbackLng: "en-US",
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

export function applyLanguage(lang: string) {
  void i18n.changeLanguage(lang);
  const base = lang.split("-")[0];
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
  }
}

export default i18n;
