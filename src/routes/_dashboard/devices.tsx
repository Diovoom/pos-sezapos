import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  Trash2,
  Wifi,
  Printer,
  ScanLine,
  CreditCard,
  DollarSign,
} from "lucide-react";
import {
  createPairingCode,
  listPosDevices,
  revokePosDevice,
} from "@/lib/pos/device-pairing.functions";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";

export const Route = createFileRoute("/_dashboard/devices")({
  head: () => ({
    meta: [
      { title: "POS Devices  -  SEZA POS" },
      { name: "description", content: "Read-only health and pairing for Android POS registers." },
    ],
  }),
  component: DevicesPage,
});

type Snapshot = {
  captured_at?: string;
  online?: boolean;
  route?: string | null;
  printer?: {
    driver_label?: string;
    paired?: boolean;
    name?: string | null;
    last_ok?: string | null;
    last_error?: string | null;
  };
  drawer?: {
    enabled?: boolean;
    open_on_cash?: boolean;
    last_ok?: string | null;
    last_error?: string | null;
  };
  scanner?: { mode?: string; last_scan_at?: string | null };
  terminal?: {
    label?: string;
    plugin_linked?: boolean | null;
    tap_to_pay_supported?: boolean | null;
    connected_reader?: string | null;
    last_error?: string | null;
  };
};

type Device = {
  id: string;
  label: string;
  platform: string | null;
  status: string;
  paired_at: string;
  last_seen_at: string | null;
  last_sync_at: string | null;
  app_version: string | null;
  status_snapshot: Snapshot | null;
};

function freshness(lastSeen: string | null) {
  if (!lastSeen) return { label: "Never connected", online: false };
  const age = Date.now() - new Date(lastSeen).getTime();
  if (age < 90_000) return { label: "Online", online: true };
  if (age < 10 * 60_000) return { label: "Recently online", online: false };
  return { label: "Offline", online: false };
}

function StatusRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className={ok === false ? "text-destructive text-right" : "font-medium text-right"}>
        {value}
      </span>
    </div>
  );
}

function DevicesPage() {
  const qc = useQueryClient();
  const me = useMe();
  const storeId = me.data?.store?.id as string | undefined;
  const list = useServerFn(listPosDevices);
  const create = useServerFn(createPairingCode);
  const revoke = useServerFn(revokePosDevice);

  const devicesQ = useQuery({
    queryKey: ["pos-devices"],
    queryFn: () => list(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`dashboard-pos-devices:${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "device_registrations",
          filter: `store_id=eq.${storeId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["pos-devices"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, storeId]);

  const [label, setLabel] = useState("Front Counter");
  const [issued, setIssued] = useState<{ code: string; expires_at: string; label: string } | null>(
    null,
  );
  const createMut = useMutation({
    mutationFn: () => create({ data: { label } }),
    onSuccess: (res) => {
      setIssued(res);
      qc.invalidateQueries({ queryKey: ["pos-devices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create code"),
  });

  const [confirm, setConfirm] = useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const revokeMut = useMutation({
    mutationFn: (v: { device_id: string; reason: string }) => revoke({ data: v }),
    onSuccess: () => {
      toast.success("Device revoked");
      setConfirm(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["pos-devices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });

  const devices = (devicesQ.data?.devices ?? []) as Device[];

  return (
    <>
      <PageHeader
        title="POS Devices"
        subtitle="Live, read-only status from each paired Android register"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => devicesQ.refetch()}
            disabled={devicesQ.isFetching}
          >
            <RefreshCw className={`size-4 mr-2 ${devicesQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Pair an Android register
            </CardTitle>
            <CardDescription>
              Pairing is the only setup performed from the dashboard. Printer, scanner, drawer and
              payment-terminal configuration stays on the physical Android POS.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2 w-full max-w-sm">
              <Label>Register name</Label>
              <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !label.trim()}
            >
              {createMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Generate
              pairing code
            </Button>
          </CardContent>
        </Card>

        {devicesQ.isLoading ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin inline mr-2" />
              Loading devices…
            </CardContent>
          </Card>
        ) : devices.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No Android registers are paired yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid xl:grid-cols-2 gap-4">
            {devices.map((d) => {
              const snap = d.status_snapshot ?? {};
              const live = freshness(d.last_seen_at);
              return (
                <Card key={d.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <MonitorSmartphone className="size-5" />
                          {d.label}
                        </CardTitle>
                        <CardDescription>
                          {d.platform ?? "Android"} · App {d.app_version ?? "unknown"} · paired{" "}
                          {new Date(d.paired_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          live.online ? "text-success border-success/30" : "text-muted-foreground"
                        }
                      >
                        {live.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <StatusRow
                      icon={Wifi}
                      label="Register connection"
                      value={d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "Never"}
                      ok={live.online}
                    />
                    <StatusRow
                      icon={Printer}
                      label="Receipt printer"
                      value={
                        snap.printer?.paired
                          ? `${snap.printer.name ?? snap.printer.driver_label ?? "Paired"}`
                          : "Not paired"
                      }
                      ok={snap.printer?.paired}
                    />
                    <StatusRow
                      icon={ScanLine}
                      label="Barcode scanner"
                      value={
                        snap.scanner?.mode
                          ? `${snap.scanner.mode.toUpperCase()}${snap.scanner.last_scan_at ? ` · last scan ${new Date(snap.scanner.last_scan_at).toLocaleString()}` : ""}`
                          : "No status yet"
                      }
                    />
                    <StatusRow
                      icon={DollarSign}
                      label="Cash drawer"
                      value={
                        snap.drawer?.enabled
                          ? snap.drawer.last_error
                            ? `Error: ${snap.drawer.last_error}`
                            : "Enabled"
                          : "Disabled"
                      }
                      ok={!snap.drawer?.last_error}
                    />
                    <StatusRow
                      icon={CreditCard}
                      label="Payment terminal"
                      value={
                        snap.terminal?.connected_reader
                          ? `Connected: ${snap.terminal.connected_reader}`
                          : (snap.terminal?.label ?? "Not configured")
                      }
                      ok={!!snap.terminal?.connected_reader}
                    />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Hardware changes are made on this Android register and appear here
                        automatically.
                      </p>
                      {d.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirm({ id: d.id, label: d.label })}
                        >
                          <Trash2 className="size-4 mr-1" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pairing code for {issued?.label}</DialogTitle>
            <DialogDescription>
              Enter this one-time code on the Android POS app. It expires at{" "}
              {issued && new Date(issued.expires_at).toLocaleTimeString()}.
            </DialogDescription>
          </DialogHeader>
          <div className="text-4xl font-mono tracking-widest text-center py-6 select-all">
            {issued?.code}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (issued) {
                  navigator.clipboard.writeText(issued.code);
                  toast.success("Copied");
                }
              }}
            >
              <Copy className="size-4 mr-1" />
              Copy
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {confirm?.label}?</DialogTitle>
            <DialogDescription>
              This blocks PIN sign-in from that install immediately. Hardware configuration on the
              device is not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Register replaced"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirm(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMut.isPending || reason.trim().length < 4}
              onClick={() =>
                confirm && revokeMut.mutate({ device_id: confirm.id, reason: reason.trim() })
              }
            >
              {revokeMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}Revoke device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
