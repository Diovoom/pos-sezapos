import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { watchAdminSession } from "@/lib/web/admin-session";

export function AdminSessionBoundary({ userId, children }: { userId: string; children: ReactNode }) {
  const [expired, setExpired] = useState(false);
  const queries = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => watchAdminSession(supabaseAdminAuth.auth, userId, () => {
    setExpired(true);
    void queries.cancelQueries();
    queries.clear();
    void navigate({ to: "/admin/auth", replace: true });
  }), [userId, queries, navigate]);
  return expired ? <p role="status" className="p-6">Your admin session changed. Please sign in again.</p> : children;
}
