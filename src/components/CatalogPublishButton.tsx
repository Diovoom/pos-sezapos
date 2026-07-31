import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clearInventoryDrafts, loadInventoryDrafts, loadPublishHistory, recordPublish, saveInventoryDraft, type InventoryDraft } from "@/lib/inventory-drafts";

export function CatalogPublishButton({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [drafts, setDrafts] = useState<InventoryDraft[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("id").limit(1).maybeSingle()).data,
  });
  const storeId = store?.id;

  const refresh = () => setDrafts(storeId ? loadInventoryDrafts(storeId) : []);
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("inventory-drafts-change", onChange);
    return () => window.removeEventListener("inventory-drafts-change", onChange);
  }, [storeId]);

  const summary = useMemo(() => ({
    created: drafts.filter((d) => d.operation === "create").length,
    updated: drafts.filter((d) => d.operation === "update").length,
    deleted: drafts.filter((d) => d.operation === "delete").length,
  }), [drafts]);

  async function validate() {
    if (!storeId) throw new Error("Store not found");
    const { data, error } = await supabase.from("products").select("id,sku,barcode").eq("store_id", storeId);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; sku: string | null; barcode: string | null }[];
    const skuOwner = new Map(rows.filter((r) => r.sku).map((r) => [r.sku!.trim().toLowerCase(), r.id]));
    const barcodeOwner = new Map(rows.filter((r) => r.barcode).map((r) => [r.barcode!.trim(), r.id]));
    for (const draft of drafts) {
      if (draft.operation === "delete") continue;
      const name = String(draft.changes?.name ?? "").trim();
      const price = Number(draft.changes?.price ?? 0);
      if (!name) throw new Error("Every product needs a name before publishing");
      if (!Number.isFinite(price) || price < 0) throw new Error(`${name} has an invalid price`);
      const sku = String(draft.changes?.sku ?? "").trim().toLowerCase();
      const barcode = String(draft.changes?.barcode ?? "").trim();
      if (sku && skuOwner.has(sku) && skuOwner.get(sku) !== draft.productId) throw new Error(`Duplicate SKU: ${sku}`);
      if (barcode && barcodeOwner.has(barcode) && barcodeOwner.get(barcode) !== draft.productId) throw new Error(`Duplicate barcode: ${barcode}`);
      if (sku) skuOwner.set(sku, draft.productId);
      if (barcode) barcodeOwner.set(barcode, draft.productId);
    }
  }

  async function publish() {
    if (!storeId || drafts.length === 0) return;
    setPublishing(true);
    try {
      await validate();
      for (const draft of drafts) {
        if (draft.operation === "create") {
          const { error } = await supabase.from("products").insert({ ...draft.changes, id: draft.productId, store_id: storeId } as any);
          if (error) throw error;
        } else if (draft.operation === "update") {
          const { error } = await supabase.from("products").update({ ...draft.changes, updated_at: new Date().toISOString() } as any).eq("id", draft.productId).eq("store_id", storeId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("products").delete().eq("id", draft.productId).eq("store_id", storeId);
          if (error) throw error;
        }
      }
      const release = recordPublish(storeId, drafts);
      clearInventoryDrafts(storeId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["inventory-products"] }),
        qc.invalidateQueries({ queryKey: ["dashboard-data"] }),
      ]);
      toast.success(`Catalog version ${release.version} published to POS`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Catalog publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const history = storeId ? loadPublishHistory(storeId) : [];
  return (
    <>
      <Button variant={drafts.length ? "default" : "outline"} size={compact ? "icon" : "sm"} onClick={() => setOpen(true)} aria-label="Publish inventory changes">
        <Upload className={compact ? "size-4" : "mr-2 size-4"} />
        {!compact && "Publish"}
        {drafts.length > 0 && <Badge className={compact ? "absolute -right-1 -top-1 h-5 min-w-5 px-1" : "ml-2"}>{drafts.length}</Badge>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Publish inventory to POS</DialogTitle><DialogDescription>Draft changes stay private until you publish. POS devices receive one complete catalog update.</DialogDescription></DialogHeader>
          {drafts.length === 0 ? <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 size-6" />No unpublished changes.</div> : <div className="grid grid-cols-3 gap-3"><Stat label="New" value={summary.created}/><Stat label="Edited" value={summary.updated}/><Stat label="Deleted" value={summary.deleted}/></div>}
          <button className="text-left text-sm text-primary hover:underline" onClick={() => setHistoryOpen(true)}>View publish history and rollback</button>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!drafts.length || publishing} onClick={publish}>{publishing && <Loader2 className="mr-2 size-4 animate-spin"/>}Review passed · Publish</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Publish history</DialogTitle><DialogDescription>Rollback creates a new unpublished draft. Nothing changes on the POS until you publish it.</DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">{history.length === 0 ? <p className="text-sm text-muted-foreground">No catalog versions published yet.</p> : history.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-medium">Version {item.version}</div><div className="text-xs text-muted-foreground">{new Date(item.publishedAt).toLocaleString()} · {item.changeCount} changes</div></div><Button size="sm" variant="outline" onClick={() => { item.rollbackDrafts.forEach((d) => saveInventoryDraft(storeId!, d)); toast.success("Rollback prepared as unpublished changes"); setHistoryOpen(false); }}><RotateCcw className="mr-1.5 size-3.5"/>Prepare rollback</Button></div>)}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border p-3 text-center"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>; }
