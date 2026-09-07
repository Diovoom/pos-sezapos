import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Cloud,
  CreditCard,
  MonitorCog,
  MessageCircle,
  MonitorUp,
  Phone,
  ReceiptText,
  Save,
  Settings2,
  Smartphone,
  Sun,
  Type,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AndroidDevicePanel } from "@/components/settings/AndroidDevicePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { ManagerSupportFooter } from "@/components/pos/ManagerSupportFooter";
import { deviceControl } from "@/lib/device-control";
import { applyTextScale, readTextScale } from "@/lib/display-preferences";
import { isNativeMode } from "@/lib/native";

const keys = {
  label: "pos.device.label",
  paper: "pos.receipt.paperWidth",
  autoPrint: "pos.receipt.autoPrint",
  copies: "pos.receipt.copies",
  customerDisplayAuto: "pos.customerDisplay.autoStart",
} as const;

type Section = "general" | "display" | "receipts" | "connections" | "sync" | "support" | "android";

const sections: Array<{
  id: Section;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "display", label: "Display & accessibility", icon: Sun },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "connections", label: "Connections", icon: MonitorCog },
  { id: "sync", label: "Sync & offline", icon: WifiOff },
  { id: "support", label: "Support", icon: MessageCircle },
  { id: "android", label: "Android", icon: Smartphone },
];

function read(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function RegisterAppSettingsPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("general");
  const [label, setLabel] = useState(() => read(keys.label, "Register 1"));
  const [paper, setPaper] = useState(() => read(keys.paper, "80"));
  const [copies, setCopies] = useState(() => read(keys.copies, "1"));
  const [autoPrint, setAutoPrint] = useState(() => read(keys.autoPrint, "1") !== "0");
  const [customerDisplayAuto, setCustomerDisplayAuto] = useState(
    () => read(keys.customerDisplayAuto, "1") !== "0",
  );
  const native = isNativeMode();
  const [brightness, setBrightness] = useState(0.85);
  const [textScale, setTextScale] = useState(() => readTextScale());

  useEffect(() => {
    applyTextScale(textScale, false);
  }, [textScale]);

  useEffect(() => {
    if (!native) return;
    void deviceControl.getState().then((state) => {
      if (Number.isFinite(state.brightness)) setBrightness(state.brightness);
    }).catch(() => undefined);
  }, [native]);

  const save = () => {
    localStorage.setItem(keys.label, label.trim() || "Register 1");
    localStorage.setItem(keys.paper, paper);
    localStorage.setItem(keys.copies, copies);
    localStorage.setItem(keys.autoPrint, autoPrint ? "1" : "0");
    localStorage.setItem(keys.customerDisplayAuto, customerDisplayAuto ? "1" : "0");
    window.dispatchEvent(new Event("seza:device-config-changed"));
    toast.success("App settings saved");
  };

  const updateCustomerDisplayAuto = (enabled: boolean) => {
    setCustomerDisplayAuto(enabled);
    localStorage.setItem(keys.customerDisplayAuto, enabled ? "1" : "0");
    window.dispatchEvent(new Event("seza:device-config-changed"));
  };

  const updateBrightness = async (value: number) => {
    const normalized = Math.min(1, Math.max(0.2, value));
    setBrightness(normalized);
    if (!native) return;
    await deviceControl.setBrightness(normalized).catch(() => {
      toast.error("Unable to change screen brightness");
    });
  };

  const updateTextScale = (value: number) => {
    setTextScale(value);
    applyTextScale(value, true);
  };

  const resetDisplay = async () => {
    updateTextScale(1);
    await updateBrightness(0.85);
    toast.success("Display preferences reset");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-black">App settings</h1>
            <p className="text-xs text-muted-foreground">
              Configure this SEZA register without leaving the POS.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden md:grid md:grid-cols-[220px_1fr]">
        <nav className="border-b bg-background md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto touch-pan-x p-2 md:block md:space-y-1 md:overflow-visible md:p-3">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition md:w-full",
                  section === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] p-4 pb-28 md:p-6 md:pb-10">
          <div className="mx-auto max-w-4xl space-y-4">
            {section === "general" && (
              <SettingsGroup title="General" description="Basic identity and behavior for this register.">
                <SettingRow title="Register name" description="Shown to the owner when identifying this device.">
                  <Input
                    className="w-56"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={50}
                    aria-label="Register name"
                  />
                </SettingRow>
                <SettingRow title="Save changes" description="Apply the current register preferences.">
                  <Button onClick={save}>
                    <Save className="mr-2 size-4" />
                    Save
                  </Button>
                </SettingRow>
              </SettingsGroup>
            )}

            {section === "display" && (
              <SettingsGroup title="Display & accessibility" description="Adjust the cashier screen for the person using this register.">
                <SettingRow title="Screen brightness" description="Changes the SEZA cashier screen brightness while the app is open.">
                  <div className="flex w-64 items-center gap-3">
                    <Sun className="size-4 text-muted-foreground" />
                    <Slider
                      value={[Math.round(brightness * 100)]}
                      min={20}
                      max={100}
                      step={5}
                      disabled={!native}
                      onValueChange={(values) => void updateBrightness((values[0] ?? 85) / 100)}
                    />
                    <span className="w-12 text-right text-sm tabular-nums">{Math.round(brightness * 100)}%</span>
                  </div>
                </SettingRow>
                <SettingRow title="Text size" description="Make labels, buttons, and settings easier to read across the POS.">
                  <div className="flex w-64 items-center gap-3">
                    <Type className="size-4 text-muted-foreground" />
                    <Slider
                      value={[Math.round(textScale * 100)]}
                      min={90}
                      max={130}
                      step={5}
                      onValueChange={(values) => updateTextScale((values[0] ?? 100) / 100)}
                    />
                    <span className="w-12 text-right text-sm tabular-nums">{Math.round(textScale * 100)}%</span>
                  </div>
                </SettingRow>
                {native && (
                  <LinkRow
                    icon={<Sun className="size-4" />}
                    title="More Android display options"
                    description="Open Android display settings for system-level brightness and display controls."
                    onClick={() => void deviceControl.openDisplaySettings()}
                  />
                )}
                <SettingRow title="Reset display preferences" description="Return SEZA brightness and text size to the recommended defaults.">
                  <Button variant="outline" onClick={() => void resetDisplay()}>
                    <RotateCcw className="mr-2 size-4" />
                    Reset
                  </Button>
                </SettingRow>
              </SettingsGroup>
            )}

            {section === "receipts" && (
              <SettingsGroup title="Receipts" description="Printing behavior after a completed sale.">
                <SettingRow title="Auto-print after sale" description="Print the receipt immediately after checkout.">
                  <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
                </SettingRow>
                <SettingRow title="Paper width" description="Match the receipt printer installed at this register.">
                  <Select value={paper} onValueChange={setPaper}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58 mm</SelectItem>
                      <SelectItem value="80">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow title="Receipt copies" description="Number of printed copies after a sale.">
                  <Input
                    className="w-24"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3}
                    value={copies}
                    onChange={(event) =>
                      setCopies(String(Math.min(3, Math.max(1, Number(event.target.value) || 1))))
                    }
                  />
                </SettingRow>
                <SettingRow title="Apply receipt preferences">
                  <Button variant="outline" onClick={save}>
                    <Save className="mr-2 size-4" />
                    Apply
                  </Button>
                </SettingRow>
              </SettingsGroup>
            )}

            {section === "connections" && (
              <SettingsGroup title="Connections" description="Hardware and payment connections used by this register.">
                <SettingRow
                  title="Customer display auto-connect"
                  description="Automatically open the customer-facing screen when SEZA detects the second display."
                >
                  <Switch checked={customerDisplayAuto} onCheckedChange={updateCustomerDisplayAuto} />
                </SettingRow>
                <LinkRow
                  icon={<MonitorCog className="size-4" />}
                  title="Peripheral hardware"
                  description="Printer, scanner, cash drawer, and customer display."
                  onClick={() => navigate({ to: "/manager-tools" as any })}
                />
                <LinkRow
                  icon={<CreditCard className="size-4" />}
                  title="Payment terminal"
                  description="Connect, select, and test the card reader."
                  onClick={() => navigate({ to: "/payment-terminal" as any })}
                />
              </SettingsGroup>
            )}

            {section === "sync" && (
              <SettingsGroup title="Sync & offline" description="Review offline work and cloud synchronization.">
                <LinkRow
                  icon={<Cloud className="size-4" />}
                  title="Sync queue"
                  description="Review records waiting for SEZA Cloud and retry synchronization."
                  onClick={() => navigate({ to: "/pending-sync" as any })}
                />
              </SettingsGroup>
            )}

            {section === "support" && (
              <SettingsGroup
                title="Screen sharing"
                description="SEZA Admin can start a secure view-only screen-sharing session while helping you."
              >
                <SettingRow
                  title="Share screen with SEZA Admin"
                  description="Only SEZA Admin can start screen sharing. This register will show Allow or Decline before anything is shared."
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <MonitorUp className="size-4" />
                    Admin initiated
                  </div>
                </SettingRow>
              </SettingsGroup>
            )}

            {section === "android" && <AndroidDevicePanel />}
            <ManagerSupportFooter />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="overflow-hidden rounded-xl border bg-background">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <Label className="font-semibold">{title}</Label>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function LinkRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 border-b px-4 py-3 text-left transition last:border-b-0 hover:bg-muted/40"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
