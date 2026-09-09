import { useEffect } from "react";
import i18n from "@/i18n";
import { MARKETING_RUNTIME_FALLBACKS } from "@/i18n/marketing-runtime-fallbacks";
import { RUNTIME_FALLBACKS } from "@/i18n/runtime-fallbacks";

const ORIGINAL_TEXT = new WeakMap<Text, string>();
const ORIGINAL_ATTRS = new WeakMap<Element, Map<string, string>>();
const SKIP_SELECTOR = [
  "script",
  "style",
  "code",
  "pre",
  "textarea",
  "[contenteditable='true']",
  "[data-no-translate]",
  "[data-no-translate] *",
].join(",");
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label"] as const;

function flattenPairs(source: unknown, target: unknown, output: Map<string, string>) {
  if (typeof source === "string" && typeof target === "string") {
    if (source.trim() && source !== target) output.set(source, target);
    return;
  }
  if (!source || !target || typeof source !== "object" || typeof target !== "object") return;
  for (const key of Object.keys(source as Record<string, unknown>)) {
    flattenPairs(
      (source as Record<string, unknown>)[key],
      (target as Record<string, unknown>)[key],
      output,
    );
  }
}

function languageCode() {
  const raw = i18n.language || "en-US";
  if (i18n.hasResourceBundle(raw, "common")) return raw;
  const base = raw.split("-")[0];
  return i18n.hasResourceBundle(base, "common") ? base : "en-US";
}

function normalized(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

type RuntimeDictionary = {
  lang: string;
  exact: Map<string, string>;
  normalized: Map<string, string>;
};

function buildDictionary(): RuntimeDictionary {
  const lang = languageCode();
  const exact = new Map<string, string>();
  if (lang === "en-US" || lang === "en") return { lang, exact, normalized: new Map() };

  const english = i18n.getResourceBundle("en-US", "common") as unknown;
  const translated = i18n.getResourceBundle(lang, "common") as unknown;
  flattenPairs(english, translated, exact);

  for (const pack of [RUNTIME_FALLBACKS, MARKETING_RUNTIME_FALLBACKS]) {
    const fallback: Record<string, string> =
      pack[lang] ?? pack[lang.split("-")[0]] ?? {};
    for (const [source, target] of Object.entries(fallback)) exact.set(source, target);
  }

  const normalizedMap = new Map<string, string>();
  for (const [source, target] of exact) normalizedMap.set(normalized(source), target);

  return { lang, exact, normalized: normalizedMap };
}

function preserveCapitalization(original: string, translated: string) {
  if (original.length > 1 && original === original.toUpperCase()) return translated.toUpperCase();
  return translated;
}

const DYNAMIC_UI_TEMPLATES: Record<string, {
  offlineDevices: (count: string) => string;
  offline: (count: string) => string;
  openCases: (count: string) => string;
  unreadSupport: (count: string) => string;
}> = {
  fr: {
    offlineDevices: (count) => `${count} appareil(s) hors ligne`,
    offline: (count) => `${count} hors ligne`,
    openCases: (count) => `${count} dossier(s) ouvert(s)`,
    unreadSupport: (count) => `${count} message(s) d’assistance non lu(s)`,
  },
  es: {
    offlineDevices: (count) => `${count} dispositivo(s) sin conexión`,
    offline: (count) => `${count} sin conexión`,
    openCases: (count) => `${count} caso(s) abierto(s)`,
    unreadSupport: (count) => `${count} mensaje(s) de soporte sin leer`,
  },
  ht: {
    offlineDevices: (count) => `${count} aparèy offline`,
    offline: (count) => `${count} offline`,
    openCases: (count) => `${count} dosye ouvè`,
    unreadSupport: (count) => `${count} mesaj sipò ki poko li`,
  },
  "pt-BR": {
    offlineDevices: (count) => `${count} dispositivo(s) offline`,
    offline: (count) => `${count} offline`,
    openCases: (count) => `${count} caso(s) aberto(s)`,
    unreadSupport: (count) => `${count} mensagem(ns) de suporte não lida(s)`,
  },
  ar: {
    offlineDevices: (count) => `${count} جهاز غير متصل`,
    offline: (count) => `${count} غير متصل`,
    openCases: (count) => `${count} حالة مفتوحة`,
    unreadSupport: (count) => `${count} رسالة دعم غير مقروءة`,
  },
  he: {
    offlineDevices: (count) => `${count} מכשיר(ים) לא מקוון(ים)`,
    offline: (count) => `${count} לא מקוון`,
    openCases: (count) => `${count} פניות פתוחות`,
    unreadSupport: (count) => `${count} הודעות תמיכה שלא נקראו`,
  },
};

function translateDynamicUi(core: string, lang: string): string | null {
  const templates = DYNAMIC_UI_TEMPLATES[lang] ?? DYNAMIC_UI_TEMPLATES[lang.split("-")[0]];
  if (!templates) return null;

  let match = core.match(/^(\d+)\s+offline device\(s\)$/i);
  if (match) return templates.offlineDevices(match[1]);
  match = core.match(/^(\d+)\s+offline devices?$/i);
  if (match) return templates.offlineDevices(match[1]);
  match = core.match(/^(\d+)\s+offline$/i);
  if (match) return templates.offline(match[1]);
  match = core.match(/^(\d+)\s+open case\(s\)$/i);
  if (match) return templates.openCases(match[1]);
  match = core.match(/^(\d+)\s+open cases?$/i);
  if (match) return templates.openCases(match[1]);
  match = core.match(/^(\d+)\s+unread support messages?$/i);
  if (match) return templates.unreadSupport(match[1]);
  return null;
}

function translateValue(value: string, dictionary: RuntimeDictionary) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length);
  if (!core) return value;

  const dynamic = translateDynamicUi(core, dictionary.lang);
  if (dynamic) return `${leading}${dynamic}${trailing}`;

  const direct = dictionary.exact.get(core) ?? dictionary.normalized.get(normalized(core));
  if (direct) return `${leading}${preserveCapitalization(core, direct)}${trailing}`;
  // Never replace substrings inside a larger word or sentence. The previous
  // phrase-replacement fallback could corrupt identifiers and merchant text
  // (for example, translating a short English token inside "Modifier").
  // Unknown content falls back to the complete original English value.
  return value;
}

function shouldSkip(element: Element | null) {
  return !element || element.matches(SKIP_SELECTOR) || Boolean(element.closest(SKIP_SELECTOR));
}

function applyToText(text: Text, dictionary: RuntimeDictionary) {
  if (shouldSkip(text.parentElement)) return;
  const current = text.nodeValue ?? "";
  if (!current.trim()) return;
  if (!ORIGINAL_TEXT.has(text)) ORIGINAL_TEXT.set(text, current);
  const original = ORIGINAL_TEXT.get(text) ?? current;
  const next = translateValue(original, dictionary);
  if (current !== next) text.nodeValue = next;
}

function applyToElement(element: Element, dictionary: RuntimeDictionary) {
  if (shouldSkip(element)) return;
  let originals = ORIGINAL_ATTRS.get(element);
  if (!originals) {
    originals = new Map<string, string>();
    ORIGINAL_ATTRS.set(element, originals);
  }
  for (const attr of TRANSLATABLE_ATTRS) {
    const current = element.getAttribute(attr);
    if (!current) continue;
    if (!originals.has(attr)) originals.set(attr, current);
    const original = originals.get(attr) ?? current;
    const next = translateValue(original, dictionary);
    if (current !== next) element.setAttribute(attr, next);
  }
}

function applyTree(root: Node, dictionary: RuntimeDictionary) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyToText(root as Text, dictionary);
    return;
  }
  if (!(root instanceof Element) && root !== document) return;
  if (root instanceof Element) applyToElement(root, dictionary);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) applyToText(node as Text, dictionary);
    else applyToElement(node as Element, dictionary);
    node = walker.nextNode();
  }
}

/** Applies the selected language across legacy and modern mounted screens. */
export function GlobalLanguageRuntime() {
  useEffect(() => {
    let dictionary = buildDictionary();
    let scheduled = 0;
    let applying = false;

    const apply = () => {
      scheduled = 0;
      applying = true;
      applyTree(document.body, dictionary);
      applying = false;
    };
    const schedule = () => {
      if (!scheduled) scheduled = window.requestAnimationFrame(apply);
    };
    const languageChanged = () => {
      dictionary = buildDictionary();
      document.documentElement.lang = languageCode();
      document.documentElement.dir = ["ar", "he"].includes(languageCode()) ? "rtl" : "ltr";
      schedule();
    };

    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      applying = true;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const text = mutation.target as Text;
          const value = text.nodeValue ?? "";
          const known = ORIGINAL_TEXT.get(text);
          if (known && value !== translateValue(known, dictionary)) ORIGINAL_TEXT.set(text, value);
          applyToText(text, dictionary);
        } else if (mutation.type === "attributes") {
          applyToElement(mutation.target as Element, dictionary);
        }
        mutation.addedNodes.forEach((node) => applyTree(node, dictionary));
      }
      applying = false;
    });

    i18n.on("languageChanged", languageChanged);
    window.addEventListener("storage", languageChanged);
    window.addEventListener("seza-language-changed", languageChanged as EventListener);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRS],
    });
    languageChanged();

    return () => {
      i18n.off("languageChanged", languageChanged);
      window.removeEventListener("storage", languageChanged);
      window.removeEventListener("seza-language-changed", languageChanged as EventListener);
      observer.disconnect();
      if (scheduled) window.cancelAnimationFrame(scheduled);
    };
  }, []);

  return null;
}
