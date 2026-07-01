import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Mail, X } from "lucide-react";
import { Receipt, type ReceiptData } from "./Receipt";
import { toast } from "sonner";

export function ReceiptDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ReceiptData | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!ref.current) return;
    const html = ref.current.outerHTML;
    const w = window.open("", "_blank", "width=380,height=700");
    if (!w) {
      toast.error("Popup blocked. Allow popups to print.");
      return;
    }
    w.document.write(`
      <!doctype html><html><head><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .receipt-print { padding: 8px !important; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style></head><body>${html}
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500);};</script>
      </body></html>`);
    w.document.close();
  };

  const handleEmail = () => {
    toast.info("Email receipt will send via configured SMTP once connected.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle>Receipt</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="size-8 grid place-items-center rounded-md hover:bg-accent"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto bg-muted/40 py-4">
          {data && <Receipt ref={ref} data={data} />}
        </div>
        <div className="p-4 border-t bg-surface/40 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleEmail}>
            <Mail className="size-4" /> Email
          </Button>
          <Button className="flex-1" onClick={handlePrint}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
