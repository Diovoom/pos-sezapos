import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, applyLanguage } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Globe } from "lucide-react";
import { toast } from "sonner";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const me = useMe();
  const rawLanguage = i18n.language || "en-US";
  const exact = SUPPORTED_LANGUAGES.find((l) => l.code === rawLanguage)?.code;
  const base = rawLanguage.split("-")[0];
  const baseMatch = SUPPORTED_LANGUAGES.find((l) => l.code === base)?.code;
  const current = exact ?? baseMatch ?? "en-US";
  const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;

  const onChange = async (value: string) => {
    await applyLanguage(value);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        // Personal preference is retained for account recovery and future use.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from as any)("profiles")
          .update({ preferred_language: value, preferred_locale: value })
          .eq("id", u.user.id);
      }
      // Owner/manager dashboard selection is store-wide so every online APK
      // changes language without a rebuild.
      if (storeId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from as any)("stores")
          .update({ language: value, locale: value })
          .eq("id", storeId);
        if (error) throw error;
        void qc.invalidateQueries({ queryKey: ["store-language", storeId] });
        void qc.invalidateQueries({ queryKey: ["store"] });
      }
      toast.success("Language updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save language");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {!compact && <Globe className="size-4 text-muted-foreground" />}
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger className={compact ? "h-8 w-[130px] text-xs" : "h-9 w-[180px]"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {SUPPORTED_LANGUAGES.map((l) => (
            <SelectItem key={l.code} value={l.code}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
