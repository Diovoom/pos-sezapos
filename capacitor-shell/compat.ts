// Compatibility shims for older Android POS WebViews (PrimeOS / vendor ROMs).
// Keep this file dependency-free and load it before the Android shell mounts.

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function") {
  try {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: fallbackUuid,
      configurable: true,
      writable: true,
    });
  } catch {
    // Some OEM WebViews expose a non-extensible Crypto object. Call sites that
    // already have local fallbacks will continue to work.
  }
}

if (typeof String.prototype.replaceAll !== "function") {
  Object.defineProperty(String.prototype, "replaceAll", {
    value(this: string, search: string | RegExp, replacement: string): string {
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError("replaceAll RegExp must use the global flag");
        return this.replace(search, replacement);
      }
      return this.split(search).join(replacement);
    },
    configurable: true,
    writable: true,
  });
}
