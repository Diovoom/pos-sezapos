import { useEffect, useRef } from "react";

const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? "";

export const authCaptchaEnabled = siteKey.length > 0;

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "auto";
      size: "normal";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __sezaTurnstileLoader?: Promise<TurnstileApi>;
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (window.__sezaTurnstileLoader) return window.__sezaTurnstileLoader;

  window.__sezaTurnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-seza-turnstile="true"]',
    );
    const script = existing ?? document.createElement("script");
    const finish = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize"));
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
      once: true,
    });

    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.sezaTurnstile = "true";
      document.head.appendChild(script);
    }
  });

  return window.__sezaTurnstileLoader;
}

export function AuthTurnstile({
  onTokenChange,
  resetKey = 0,
}: {
  onTokenChange: (token: string | undefined) => void;
  resetKey?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const callbackRef = useRef(onTokenChange);
  callbackRef.current = onTokenChange;

  useEffect(() => {
    if (!authCaptchaEnabled || !hostRef.current) return;
    let cancelled = false;

    void loadTurnstile()
      .then((api) => {
        if (cancelled || !hostRef.current) return;
        widgetRef.current = api.render(hostRef.current, {
          sitekey: siteKey,
          callback: (token) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(undefined),
          "error-callback": () => callbackRef.current(undefined),
          theme: "auto",
          size: "normal",
        });
      })
      .catch(() => callbackRef.current(undefined));

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
      }
      widgetRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetRef.current && window.turnstile) {
      window.turnstile.reset(widgetRef.current);
      callbackRef.current(undefined);
    }
  }, [resetKey]);

  if (!authCaptchaEnabled) return null;

  return (
    <div className="min-h-16 rounded-md border border-border/70 bg-background/50 p-2">
      <div ref={hostRef} />
    </div>
  );
}
