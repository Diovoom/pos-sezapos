import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { createStripePayoutSession } from "@/lib/stripe-connect.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CONNECT_JS_URL = "https://connect-js.stripe.com/v1.0/connect.js";

type StripeConnectInstance = {
  create: (component: string) => HTMLElement;
};

type StripeConnectGlobal = {
  init?: (options: {
    publishableKey: string;
    fetchClientSecret: () => Promise<string>;
  }) => StripeConnectInstance;
  onLoad?: () => void;
};

declare global {
  interface Window {
    StripeConnect?: StripeConnectGlobal;
  }
}

let connectLoaderPromise: Promise<Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal> | null = null;

function loadStripeConnect() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Stripe account tools can only load in the browser."));
  }

  if (typeof window.StripeConnect?.init === "function") {
    return Promise.resolve(window.StripeConnect as Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal);
  }

  if (connectLoaderPromise) return connectLoaderPromise;

  connectLoaderPromise = new Promise<Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal>((resolve, reject) => {
    const global = (window.StripeConnect ??= {});
    const previousOnLoad = global.onLoad;
    const finish = () => {
      previousOnLoad?.();
      if (typeof window.StripeConnect?.init !== "function") {
        reject(new Error("Stripe Connect loaded without its initialization API."));
        return;
      }
      resolve(window.StripeConnect as Required<Pick<StripeConnectGlobal, "init">> & StripeConnectGlobal);
    };

    global.onLoad = finish;

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CONNECT_JS_URL}"]`);
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("Could not load Stripe Connect.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CONNECT_JS_URL;
    script.async = true;
    script.addEventListener("error", () => reject(new Error("Could not load Stripe Connect.")), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    connectLoaderPromise = null;
    throw error;
  });

  return connectLoaderPromise;
}

type Bootstrap = {
  publishableKey: string;
  clientSecret: string;
};

export function StripePayoutsManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createPayoutSession = useServerFn(createStripePayoutSession);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const firstClientSecretRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBootstrap(null);
      firstClientSecretRef.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);
    void createPayoutSession({})
      .then((result) => {
        if (cancelled) return;
        firstClientSecretRef.current = result.clientSecret;
        setBootstrap({
          publishableKey: result.publishableKey,
          clientSecret: result.clientSecret,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(userFacingError(error, "Could not open payout management."));
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createPayoutSession, onOpenChange, open]);

  const fetchClientSecret = useCallback(async () => {
    const first = firstClientSecretRef.current;
    if (first) {
      firstClientSecretRef.current = null;
      return first;
    }
    const next = await createPayoutSession({});
    return next.clientSecret;
  }, [createPayoutSession]);

  useEffect(() => {
    const target = mountRef.current;
    if (!open || !target || !bootstrap?.publishableKey) return;

    let cancelled = false;
    let accountManagement: HTMLElement | null = null;

    void loadStripeConnect()
      .then((StripeConnect) => {
        if (cancelled) return;
        const connectInstance = StripeConnect.init({
          publishableKey: bootstrap.publishableKey,
          fetchClientSecret,
        });
        accountManagement = connectInstance.create("account-management");
        target.replaceChildren(accountManagement);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(userFacingError(error, "Could not load payout management."));
        onOpenChange(false);
      });

    return () => {
      cancelled = true;
      accountManagement?.remove();
      target.replaceChildren();
    };
  }, [bootstrap?.publishableKey, fetchClientSecret, onOpenChange, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Manage payout account</DialogTitle>
          <DialogDescription>
            Securely review or change the bank account Stripe uses for this store's deposits.
          </DialogDescription>
        </DialogHeader>

        {loading && !bootstrap ? (
          <div className="flex min-h-72 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Opening secure Stripe account management…
          </div>
        ) : (
          <div ref={mountRef} className="min-h-[560px] bg-background p-4 sm:p-6" />
        )}
      </DialogContent>
    </Dialog>
  );
}
