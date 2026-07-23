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
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "ht", name: "Kreyòl Ayisyen" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "ar", name: "العربية" },
  { code: "he", name: "עברית" },
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

export async function applyLanguage(lang: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("i18nextLng", lang);
  }
  await i18n.changeLanguage(lang);
  const base = lang.split("-")[0];
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("seza-language-changed", { detail: lang }));
  }
}

export default i18n;
