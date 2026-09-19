import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  ChevronRight,
  Cloud,
  CreditCard,
  Info,
  LifeBuoy,
  MonitorCog,
  MonitorUp,
  Phone,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Sun,
  Type,
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
import { useMe } from "@/hooks/useMe";
import {
  CUSTOMER_DISPLAY_LOCAL_KEYS,
  clearLocalCustomerDisplayOverrides,
  normalizeCustomerDisplaySettings,
} from "@/lib/customer-display-preferences";

const keys = {
  label: "pos.device.label",
  paper: "pos.receipt.paperWidth",
  autoPrint: "pos.receipt.autoPrint",
  copies: "pos.receipt.copies",
  customerDisplayAuto: "pos.customerDisplay.autoStart",
} as const;

type Section =
  | "general"
  | "display"
  | "android"
  | "receipts"
  | "customer"
  | "hardware"
  | "payments"
  | "sync"
  | "support"
  | "about";

type SectionItem = {
  id: Section;
  label: string;
  description: string;
  icon: typeof Settings2;
};

const settingGroups: Array<{ label: string; items: SectionItem[] }> = [
  {
    label: "Register",
    items: [
      { id: "general", label: "General", description: "Register identity and basic behavior", icon: Settings2 },
      { id: "display", label: "Display & accessibility", description: "Brightness and text size", icon: Sun },
      { id: "android", label: "Android terminal", description: "Boot, kiosk, and system behavior", icon: Smartphone },
    ],
  },
  {
    label: "Checkout",
    items: [
      { id: "receipts", label: "Receipts", description: "Printing and receipt preferences", icon: ReceiptText },
      { id: "customer", label: "Customer display", description: "Second-screen behavior and message", icon: MonitorCog },
    ],
  },
  {
    label: "Connections",
    items: [
      { id: "hardware", label: "Hardware", description: "Printer, scanner, drawer, and display", icon: Printer },
      { id: "payments", label: "Payments", description: "Reader M2 and payment terminal", icon: CreditCard },
      { id: "sync", label: "Offline & sync", description: "Pending work and cloud synchronization", icon: WifiOff },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "support", label: "Support", description: "Cases, screen sharing, and phone support", icon: LifeBuoy },
      { id: "about", label: "About SEZA POS", description: "App, store, and register information", icon: Info },
    ],
  },
];

const sectionMeta = Object.fromEntries(
  settingGroups.flatMap((group) => group.items.map((item) => [item.id, item])),
) as Record<Section, SectionItem>;

function read(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function RegisterAppSettingsPage() {
  const navigate = useNavigate();
  const me = useMe();
  const [section, setSection] = useState<Section>("general");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [label, setLabel] = useState(() => read(keys.label, "Register 1"));
  const [paper, setPaper] = useState(() => read(keys.paper, "80"));
  const [copies, setCopies] = useState(() => read(keys.copies, "1"));
  const [autoPrint, setAutoPrint] = useState(() => read(keys.autoPrint, "1") !== "0");
  const [customerDisplayAuto, setCustomerDisplayAuto] = useState(
    () => read(keys.customerDisplayAuto, "1") !== "0",
  );
  const [useOwnerCustomerDisplay, setUseOwnerCustomerDisplay] = useState(() => {
    if (typeof window === "undefined") return true;
    return !Object.values(CUSTOMER_DISPLAY_LOCAL_KEYS).some((key) => localStorage.getItem(key) != null);
  });
  const [customerIdleMode, setCustomerIdleMode] = useState<"message" | "image">(
    () => read(CUSTOMER_DISPLAY_LOCAL_KEYS.idleMode, "message") === "image" ? "image" : "message",
  );
  const [customerMessage, setCustomerMessage] = useState(() =>
    read(CUSTOMER_DISPLAY_LOCAL_KEYS.welcomeMessage, "Welcome"),
  );
  const [customerTextScale, setCustomerTextScale] = useState(() => {
    const parsed = Number(read(CUSTOMER_DISPLAY_LOCAL_KEYS.textScale, "1"));
    return Number.isFinite(parsed) ? Math.min(1.8, Math.max(0.8, parsed)) : 1;
  });
  const native = isNativeMode();
  const [brightness, setBrightness] = useState(0.85);
  const [textScale, setTextScale] = useState(() => readTextScale());

  const activeMeta = sectionMeta[section];
  const storeName = String((me.data?.store as any)?.name ?? "SEZA store");
  const role = String(me.data?.roles?.[0] ?? "employee");

  const hardwareStatus = useMemo(() => {
    if (typeof window === "undefined") return { scanner: "Not tested", display: "Automatic" };
    return {
      scanner: localStorage.getItem("pos.hw.scanner.status") === "connected" ? "Connected" : "Not tested",
      display: localStorage.getItem("pos.hw.display.status") === "connected" ? "Connected" : "Automatic",
    };
  }, [section]);

  useEffect(() => {
    applyTextScale(textScale, false);
  }, [textScale]);

  useEffect(() => {
    if (!native) return;
    void deviceControl.getState().then((state) => {
      if (Number.isFinite(state.brightness)) setBrightness(state.brightness);
    }).catch(() => undefined);
  }, [native]);

  useEffect(() => {
    if (!useOwnerCustomerDisplay) return;
    const owner = normalizeCustomerDisplaySettings((me.data?.store as any)?.customer_display_settings);
    setCustomerIdleMode(owner.idleMode);
    setCustomerMessage(owner.welcomeMessage);
    setCustomerTextScale(owner.textScale);
  }, [me.data?.store, useOwnerCustomerDisplay]);

  const openSection = (next: Section) => {
    setSection(next);
    setMobileDetail(true);
  };

  const saveCustomerDisplay = () => {
    if (typeof window === "undefined") return;
    if (useOwnerCustomerDisplay) {
      clearLocalCustomerDisplayOverrides();
    } else {
      localStorage.setItem(CUSTOMER_DISPLAY_LOCAL_KEYS.idleMode, customerIdleMode);
      localStorage.setItem(
        CUSTOMER_DISPLAY_LOCAL_KEYS.welcomeMessage,
        customerMessage.trim().slice(0, 48) || "Welcome",
      );
      localStorage.setItem(CUSTOMER_DISPLAY_LOCAL_KEYS.textScale, String(customerTextScale));
    }
    window.dispatchEvent(new Event("seza:device-config-changed"));
    toast.success(useOwnerCustomerDisplay ? "Using owner customer-display settings" : "Customer display updated");
  };

  const save = () => {
    localStorage.setItem(keys.label, label.trim() || "Register 1");
    localStorage.setItem(keys.paper, paper);
    localStorage.setItem(keys.copies, copies);
    localStorage.setItem(keys.autoPrint, autoPrint ? "1" : "0");
    localStorage.setItem(keys.customerDisplayAuto, customerDisplayAuto ? "1" : "0");
    window.dispatchEvent(new Event("seza:device-config-changed"));
    toast.success("Register settings saved");
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
      <div className="shrink-0 border-b bg-background px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Settings</h1>
            <p className="text-[11px] text-muted-foreground">Register and device settings</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden md:grid md:grid-cols-[300px_1fr]">
        <aside
          className={cn(
            "min-h-0 overflow-y-auto border-r bg-muted/10 p-3",
            mobileDetail ? "hidden md:block" : "block",
          )}
        >
          <div className="space-y-4">
            {settingGroups.map((group) => (
              <section key={group.label}>
                <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                <div className="overflow-hidden rounded-lg border bg-background">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id)}
                      className={cn(
                        "flex min-h-[52px] w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0",
                        section === item.id ? "bg-primary/8" : "hover:bg-muted/35",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-5">{item.label}</span>
                        <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground md:hidden" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section
          className={cn(
            "min-h-0 flex-col bg-background",
            mobileDetail ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 md:hidden"
              onClick={() => setMobileDetail(false)}
              aria-label="Back to settings"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <activeMeta.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{activeMeta.label}</h2>
              <p className="truncate text-[11px] text-muted-foreground">{activeMeta.description}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 md:pb-8">
            <div className="mx-auto max-w-3xl space-y-4">
              {section === "general" && (
                <>
                  <SettingsGroup title="Register">
                    <SettingRow title="Register name" description="How this device is identified in SEZA.">
                      <Input
                        className="h-8 w-52 text-sm"
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        maxLength={50}
                        aria-label="Register name"
                      />
                    </SettingRow>
                    <ValueRow title="Store" value={storeName} />
                    <ValueRow title="Signed-in role" value={role} />
                    <SettingRow title="Save register settings">
                      <Button size="sm" className="h-8 text-xs" onClick={save}>
                        <Save className="mr-1.5 size-3.5" />
                        Save
                      </Button>
                    </SettingRow>
                  </SettingsGroup>
                </>
              )}

              {section === "display" && (
                <SettingsGroup title="Cashier display">
                  <SettingRow title="Screen brightness" description="Brightness while SEZA is open.">
                    <div className="flex w-56 items-center gap-2.5">
                      <Sun className="size-3.5 text-muted-foreground" />
                      <Slider
                        value={[Math.round(brightness * 100)]}
                        min={20}
                        max={100}
                        step={5}
                        disabled={!native}
                        onValueChange={(values) => void updateBrightness((values[0] ?? 85) / 100)}
                      />
                      <span className="w-11 text-right text-xs tabular-nums">{Math.round(brightness * 100)}%</span>
                    </div>
                  </SettingRow>
                  <SettingRow title="Text size" description="Scale labels and controls across the POS.">
                    <div className="flex w-56 items-center gap-2.5">
                      <Type className="size-3.5 text-muted-foreground" />
                      <Slider
                        value={[Math.round(textScale * 100)]}
                        min={90}
                        max={130}
                        step={5}
                        onValueChange={(values) => updateTextScale((values[0] ?? 100) / 100)}
                      />
                      <span className="w-11 text-right text-xs tabular-nums">{Math.round(textScale * 100)}%</span>
                    </div>
                  </SettingRow>
                  {native && (
                    <LinkRow
                      icon={<Sun className="size-4" />}
                      title="Android display settings"
                      description="Open system-level display controls."
                      onClick={() => void deviceControl.openDisplaySettings()}
                    />
                  )}
                  <SettingRow title="Reset display preferences">
                    <Button size="sm" className="h-8 text-xs" variant="outline" onClick={() => void resetDisplay()}>
                      <RotateCcw className="mr-1.5 size-3.5" />
                      Reset
                    </Button>
                  </SettingRow>
                </SettingsGroup>
              )}

              {section === "android" && <AndroidDevicePanel />}

              {section === "receipts" && (
                <SettingsGroup title="Customer receipts">
                  <SettingRow title="Auto-print after sale" description="Print immediately after checkout.">
                    <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
                  </SettingRow>
                  <SettingRow title="Paper width" description="Match the installed receipt printer.">
                    <Select
                      value={paper}
                      onValueChange={(value) => {
                        setPaper(value);
                        localStorage.setItem(keys.paper, value);
                        window.dispatchEvent(new Event("seza:device-config-changed"));
                      }}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="58">58 mm</SelectItem>
                        <SelectItem value="80">80 mm</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow title="Receipt copies" description="Printed copies after a sale.">
                    <Input
                      className="h-8 w-20 text-sm"
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
                    <Button size="sm" className="h-8 text-xs" variant="outline" onClick={save}>
                      <Save className="mr-1.5 size-3.5" />
                      Apply
                    </Button>
                  </SettingRow>
                </SettingsGroup>
              )}

              {section === "customer" && (
                <SettingsGroup title="Customer display">
                  <SettingRow title="Auto-connect" description="Start the second screen automatically when detected.">
                    <Switch checked={customerDisplayAuto} onCheckedChange={updateCustomerDisplayAuto} />
                  </SettingRow>
                  <SettingRow title="Use owner defaults" description="Follow store-wide customer-display settings.">
                    <Switch checked={useOwnerCustomerDisplay} onCheckedChange={setUseOwnerCustomerDisplay} />
                  </SettingRow>
                  <SettingRow title="Idle screen" description="What customers see between sales.">
                    <Select
                      value={customerIdleMode}
                      onValueChange={(value) => setCustomerIdleMode(value === "image" ? "image" : "message")}
                      disabled={useOwnerCustomerDisplay}
                    >
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="message">Message</SelectItem>
                        <SelectItem value="image">Store photo</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow title="Welcome message" description="Up to 48 characters.">
                    <Input
                      className="h-8 w-56 text-sm"
                      value={customerMessage}
                      onChange={(event) => setCustomerMessage(event.target.value.slice(0, 48))}
                      disabled={useOwnerCustomerDisplay}
                      placeholder="Welcome"
                      maxLength={48}
                    />
                  </SettingRow>
                  <SettingRow title="Welcome text size">
                    <div className="flex w-56 items-center gap-2.5">
                      <Type className="size-3.5 text-muted-foreground" />
                      <Slider
                        value={[Math.round(customerTextScale * 100)]}
                        min={80}
                        max={180}
                        step={10}
                        disabled={useOwnerCustomerDisplay}
                        onValueChange={(values) =>
                          setCustomerTextScale(Math.min(1.8, Math.max(0.8, (values[0] ?? 100) / 100)))
                        }
                      />
                      <span className="w-11 text-right text-xs tabular-nums">{Math.round(customerTextScale * 100)}%</span>
                    </div>
                  </SettingRow>
                  <SettingRow title="Apply customer display">
                    <Button size="sm" className="h-8 text-xs" onClick={saveCustomerDisplay}>
                      <Save className="mr-1.5 size-3.5" />
                      Apply
                    </Button>
                  </SettingRow>
                </SettingsGroup>
              )}

              {section === "hardware" && (
                <>
                  <SettingsGroup title="Connected hardware">
                    <LinkRow
                      icon={<Printer className="size-4" />}
                      title="Receipt printer"
                      description={`Paper width ${paper} mm`}
                      onClick={() => navigate({ to: "/manager-tools" as any })}
                    />
                    <LinkRow
                      icon={<Barcode className="size-4" />}
                      title="Barcode scanner"
                      description={hardwareStatus.scanner}
                      onClick={() => navigate({ to: "/manager-tools" as any })}
                    />
                    <LinkRow
                      icon={<Banknote className="size-4" />}
                      title="Cash drawer"
                      description="Controlled through the receipt printer"
                      onClick={() => navigate({ to: "/manager-tools" as any })}
                    />
                    <LinkRow
                      icon={<MonitorCog className="size-4" />}
                      title="Customer display"
                      description={hardwareStatus.display}
                      onClick={() => openSection("customer")}
                    />
                  </SettingsGroup>
                </>
              )}

              {section === "payments" && (
                <SettingsGroup title="Card payments">
                  <LinkRow
                    icon={<CreditCard className="size-4" />}
                    title="Payment terminal"
                    description="Reader M2 status, USB/Bluetooth connection, and reconnect controls."
                    onClick={() => navigate({ to: "/payment-terminal" as any })}
                  />
                  <ValueRow title="Processor" value="Stripe Terminal" />
                  <ValueRow title="Reader connection" value="Automatic reconnect" />
                </SettingsGroup>
              )}

              {section === "sync" && (
                <SettingsGroup title="Offline & synchronization">
                  <LinkRow
                    icon={<Cloud className="size-4" />}
                    title="Sync queue"
                    description="Review records waiting for SEZA Cloud and retry synchronization."
                    onClick={() => navigate({ to: "/pending-sync" as any })}
                  />
                  <ValueRow title="Offline mode" value="Automatic fallback" />
                  <ValueRow title="Reconnect behavior" value="Sync when connection returns" />
                </SettingsGroup>
              )}

              {section === "support" && (
                <>
                  <SettingsGroup title="Help & support">
                    <LinkRow
                      icon={<LifeBuoy className="size-4" />}
                      title="Support center"
                      description="Open support cases and follow replies from SEZA."
                      onClick={() => navigate({ to: "/support" as any })}
                    />
                    <a
                      href={`tel:${LEGAL_CONFIG.phone}`}
                      className="flex min-h-[54px] items-center gap-3 border-b px-3 py-2.5 text-left transition last:border-b-0 hover:bg-muted/35"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                        <Phone className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Call SEZA Support</span>
                        <span className="block text-[11px] text-muted-foreground">{LEGAL_CONFIG.phoneDisplay}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                    <SettingRow
                      title="Screen sharing"
                      description="SEZA Admin must start the request. This register will ask you to Allow or Decline."
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <MonitorUp className="size-3.5" /> Admin initiated
                      </div>
                    </SettingRow>
                  </SettingsGroup>
                  <ManagerSupportFooter />
                </>
              )}

              {section === "about" && (
                <SettingsGroup title="About this register">
                  <ValueRow title="Product" value={LEGAL_CONFIG.productName} />
                  <ValueRow title="Company" value={LEGAL_CONFIG.companyName} />
                  <ValueRow title="Store" value={storeName} />
                  <ValueRow title="Register" value={label || "Register 1"} />
                  <ValueRow title="Platform" value={native ? "Android POS" : "Web POS"} />
                  <ValueRow title="Support" value={LEGAL_CONFIG.supportEmail} />
                </SettingsGroup>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">{children}</div>
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
    <div className="flex min-h-[54px] items-center justify-between gap-4 border-b px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{title}</Label>
        {description ? <p className="text-[11px] leading-4 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ValueRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex min-h-[50px] items-center justify-between gap-4 border-b px-3 py-2 last:border-b-0">
      <span className="text-sm font-medium">{title}</span>
      <span className="max-w-[55%] truncate text-right text-xs text-muted-foreground">{value}</span>
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
      className="flex min-h-[54px] w-full items-center gap-3 border-b px-3 py-2.5 text-left transition last:border-b-0 hover:bg-muted/35"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5">{title}</span>
        <span className="block truncate text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
