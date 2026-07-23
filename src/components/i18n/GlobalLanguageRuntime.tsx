import { useEffect } from "react";
import i18n from "@/i18n";

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

function flattenPairs(
  source: unknown,
  target: unknown,
  output: Map<string, string>,
) {
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

function buildDictionary() {
  const lang = languageCode();
  const english = i18n.getResourceBundle("en-US", "common") as unknown;
  if (lang === "en-US" || lang === "en") return new Map<string, string>();
  const translated = i18n.getResourceBundle(lang, "common") as unknown;
  const dictionary = new Map<string, string>();
  flattenPairs(english, translated, dictionary);
  return dictionary;
}

function translateExact(value: string, dictionary: Map<string, string>) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length);
  const translated = dictionary.get(core);
  return translated ? `${leading}${translated}${trailing}` : value;
}

function shouldSkip(element: Element | null) {
  return !element || element.matches(SKIP_SELECTOR) || Boolean(element.closest(SKIP_SELECTOR));
}

function applyToText(text: Text, dictionary: Map<string, string>) {
  if (shouldSkip(text.parentElement)) return;
  const current = text.nodeValue ?? "";
  if (!current.trim()) return;
  if (!ORIGINAL_TEXT.has(text)) ORIGINAL_TEXT.set(text, current);
  const original = ORIGINAL_TEXT.get(text) ?? current;
  const next = translateExact(original, dictionary);
  if (current !== next) text.nodeValue = next;
}

function applyToElement(element: Element, dictionary: Map<string, string>) {
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
    const next = translateExact(original, dictionary);
    if (current !== next) element.setAttribute(attr, next);
  }
}

function applyTree(root: Node, dictionary: Map<string, string>) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyToText(root as Text, dictionary);
    return;
  }
  if (!(root instanceof Element) && root !== document) return;
  if (root instanceof Element) applyToElement(root, dictionary);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) applyToText(node as Text, dictionary);
    else applyToElement(node as Element, dictionary);
    node = walker.nextNode();
  }
}

/**
 * Makes the chosen language apply across the complete mounted application,
 * including static labels that predate react-i18next. User-entered business,
 * ticket and chat content is protected with data-no-translate.
 */
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
          if (known && value !== translateExact(known, dictionary)) {
            ORIGINAL_TEXT.set(text, value);
          }
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
    schedule();

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
