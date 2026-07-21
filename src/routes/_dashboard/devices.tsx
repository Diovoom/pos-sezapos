// Merchant dashboard page: manage paired POS devices for this store.
// Owner / admin / manager only — enforced server-side.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, MonitorSmartphone, Trash2 } from "lucide-react";
import {
  createPairingCode, listPosDevices, revokePosDevice,
} from "@/lib/pos/device-pairing.functions";

export const Route = createFileRoute("/_dashboard/devices")({
  head: () => ({ meta: [
    { title: "POS Devices — SEZA POS" },
    { name: "description", content: "Pair, manage, and revoke Android POS registers connected to your store." },
  ] }),
  component: DevicesPage,
});

function DevicesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPosDevices);
  const create = useServerFn(createPairingCode);
  const revoke = useServerFn(revokePosDevice);

  const devicesQ = useQuery({
    queryKey: ["pos-devices"],
    queryFn: () => list(),
  });

  const [label, setLabel] = useState("Front Counter");
  const [issued, setIssued] = useState<{ code: string; expires_at: string; label: string } | null>(null);

  const createMut = useMutation({
    mutationFn: () => create({ data: { label } }),
    onSuccess: (res) => { setIssued(res); qc.invalidateQueries({ queryKey: ["pos-devices"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create code"),
  });

  const [confirm, setConfirm] = useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const revokeMut = useMutation({
    mutationFn: (v: { device_id: string; reason: string }) => revoke({ data: v }),
    onSuccess: () => {
      toast.success("Device revoked");
      setConfirm(null); setReason("");
      qc.invalidateQueries({ queryKey: ["pos-devices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });

  const devices = devicesQ.data?.devices ?? [];

  return (
    <>
      <PageHeader title="POS Devices" subtitle="Paired Android registers for this store" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Pair a new register
            </CardTitle>
            <CardDescription>
              Generate a one-time pairing code, then enter it on the Android POS app during first launch.
              The code expires in 15 minutes and can only be used once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 max-w-sm">
              <Label>Register name</Label>
              <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Generate pairing code
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone className="size-5 text-primary" />
              Paired devices
            </CardTitle>
            <CardDescription>
              Revoke a device to immediately block PIN sign-ins from that install. Employees will have to sign in with Employee ID + PIN until you re-pair.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {devicesQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-muted-foreground">No devices paired yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paired</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d: { id: string; label: string; status: string; paired_at: string; last_seen_at: string | null }) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.label}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "active" ? "default" : "secondary"}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(d.paired_at).toLocaleString()}</TableCell>
                      <TableCell>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        {d.status === "active" && (
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setConfirm({ id: d.id, label: d.label })}
                          >
                            <Trash2 className="size-4 mr-1" /> Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pairing code for {issued?.label}</DialogTitle>
            <DialogDescription>
              Enter this code on the Android POS app. It expires at{" "}
              {issued && new Date(issued.expires_at).toLocaleTimeString()}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-6">
            <div className="text-4xl font-mono tracking-widest select-all">
              {issued?.code}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (issued) {
                  navigator.clipboard.writeText(issued.code).catch(() => { /* noop */ });
                  toast.success("Copied");
                }
              }}
            >
              <Copy className="size-4 mr-1" /> Copy
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) { setConfirm(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {confirm?.label}?</DialogTitle>
            <DialogDescription>
              This will immediately block PIN-only sign-ins from that device. This action is audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Register decommissioned" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirm(null); setReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revokeMut.isPending || reason.trim().length < 4}
              onClick={() => confirm && revokeMut.mutate({ device_id: confirm.id, reason: reason.trim() })}
            >
              {revokeMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Revoke device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
