import { supabase } from "@/integrations/supabase/client";
import { isNativeMode } from "@/lib/native";
import type { EmployeeTimeClockAction } from "@/lib/employees.functions";

export type TimeClockRequest = {
  action: EmployeeTimeClockAction;
  occurredAt?: string;
  idempotencyKey?: string;
};

export async function postTimeClockAction(input: TimeClockRequest): Promise<{
  ok: true;
  entry: any | null;
  alreadyApplied?: boolean;
}> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again.");
  const base = isNativeMode() ? "https://sezapos.com" : "";
  const response = await fetch(`${base}/api/public/pos/timeclock`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Time clock failed (${response.status})`);
  return body;
}
