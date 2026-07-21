import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, applyLanguage } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const current = i18n.language || "en-US";

  const onChange = async (value: string) => {
    applyLanguage(value);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from as any)("profiles")
          .update({ preferred_language: value })
          .eq("id", u.user.id);
      }
    } catch { /* noop */ }
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
            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
