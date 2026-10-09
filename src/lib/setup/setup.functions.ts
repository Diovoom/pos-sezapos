import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authenticatedWriteRateLimit } from "@/lib/security/rate-limit";
import { setupError, type WizardState } from "./model";

type Scope = { actorId: string; storeId: string };
type Write = Scope & { revision: string | null; state: WizardState };
export const getOwnerSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Scope) => data)
  .handler(async ({ context, data }) => {
    const { readSetup } = await import("./setup.server");
    try {
      return await readSetup(context, data);
    } catch (error) {
      throw new Error(setupError(error));
    }
  });
export const saveOwnerSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator((data: Write) => data)
  .handler(async ({ context, data }) => {
    const { saveSetup } = await import("./setup.server");
    try {
      return await saveSetup(context, data);
    } catch (error) {
      throw new Error(setupError(error));
    }
  });
export const finishOwnerSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator((data: Write) => data)
  .handler(async ({ context, data }) => {
    const { finishSetup } = await import("./setup.server");
    try {
      return await finishSetup(context, data);
    } catch (error) {
      throw new Error(setupError(error));
    }
  });
