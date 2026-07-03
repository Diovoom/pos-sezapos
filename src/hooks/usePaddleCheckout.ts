import { useState } from "react";
import { toast } from "sonner";
import { initializePaddle, getPaddlePriceId, getPaddleEnvironment } from "@/lib/paddle";
import { supabase } from "@/integrations/supabase/client";

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (
    priceId: "starter_monthly" | "pro_monthly" | "business_monthly",
    opts?: { successUrl?: string },
  ) => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        toast.error("Please sign in first");
        return;
      }
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: user.email ? { email: user.email } : undefined,
        customData: { userId: user.id, environment: getPaddleEnvironment() },
        settings: {
          displayMode: "overlay",
          successUrl: opts?.successUrl ?? `${window.location.origin}/settings?checkout=success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to open checkout");
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
