// Local, bundled SEZA logo for the Android shell. Vite fingerprints and
// inlines/copies this PNG into android-webdir/ at build time, so the APK
// never depends on a network fetch to render its own branding.
import logoUrl from "./assets/seza-logo.png";

export const SEZA_LOGO_URL: string = logoUrl;
