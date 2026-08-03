import { useState } from "react";
import { MonitorCog, ReceiptText, Save } from "lucide-react";
import { toast } from "sonner";
import { AndroidDevicePanel } from "@/components/settings/AndroidDevicePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const keys = {
  label: "pos.device.label",
  paper: "pos.receipt.paperWidth",
  autoPrint: "pos.receipt.autoPrint",
  copies: "pos.receipt.copies",
} as const;

function read(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function RegisterAppSettingsPage() {
  const [label, setLabel] = useState(() => read(keys.label, "Register 1"));
  const [paper, setPaper] = useState(() => read(keys.paper, "80"));
  const [copies, setCopies] = useState(() => read(keys.copies, "1"));
  const [autoPrint, setAutoPrint] = useState(() => read(keys.autoPrint, "1") !== "0");

  const save = () => {
    localStorage.setItem(keys.label, label.trim() || "Register 1");
    localStorage.setItem(keys.paper, paper);
    localStorage.setItem(keys.copies, copies);
    localStorage.setItem(keys.autoPrint, autoPrint ? "1" : "0");
    window.dispatchEvent(new Event("seza:device-config-changed"));
    toast.success("Register settings saved");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/25">
      <div className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorCog className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-black">Register & app settings</h1>
            <p className="text-xs text-muted-foreground">
              Preferences for this Android register. Hardware and card terminals have separate pages.
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Register identity</CardTitle>
              <CardDescription>A clear name helps owners recognize this device in reports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-label">Register name</Label>
                <Input id="register-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={50} />
              </div>
              <Button onClick={save}><Save className="mr-2 size-4" />Save settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ReceiptText className="size-5" />Receipt preferences</CardTitle>
              <CardDescription>Printing behavior for completed sales on this register.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div><Label>Auto-print after sale</Label><p className="text-xs text-muted-foreground">Print immediately after a successful checkout.</p></div>
                <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
              </div>
              <div className="space-y-2">
                <Label>Paper width</Label>
                <Select value={paper} onValueChange={setPaper}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58 mm</SelectItem>
                    <SelectItem value="80">80 mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-copies">Copies</Label>
                <Input
                  id="receipt-copies"
                  type="number"
                  min={1}
                  max={3}
                  value={copies}
                  onChange={(event) => setCopies(String(Math.min(3, Math.max(1, Number(event.target.value) || 1))))}
                />
              </div>
              <Button variant="outline" onClick={save}><Save className="mr-2 size-4" />Apply receipt preferences</Button>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <AndroidDevicePanel />
          </div>
        </div>
      </div>
    </div>
  );
}
