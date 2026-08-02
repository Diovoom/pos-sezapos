import { useNavigate } from "@tanstack/react-router";
import { Clock, Cloud, LogOut, Receipt, RotateCcw, Settings, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deviceControl } from "@/lib/device-control";

export function PosManagerDashboardDialog({ open, onOpenChange, storeId, storeName }: { open: boolean; onOpenChange: (v:boolean)=>void; storeId:string; storeName:string }) {
  const navigate=useNavigate();
  const go=(to:string)=>{ onOpenChange(false); navigate({to:to as any}); };
  const tools=[
    ["Refunds & receipts","Find a sale, refund, return, or reprint.",RotateCcw,"/refunds"],
    ["Shift & cash drawer","Review the drawer, safe drops, and close shift.",Clock,"/register"],
    ["Time clock","Clock employees in or out.",Users,"/timeclock"],
    ["Pending sync","Retry sales waiting for SEZA Cloud.",Cloud,"/pending-sync"],
    ["POS settings","Register, kiosk, updates, and preferences.",Settings,"/settings"],
  ] as const;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="h-[94dvh] max-w-6xl overflow-hidden p-0">
      <DialogHeader className="border-b p-4 pr-12 text-left">
        <DialogTitle>Manager dashboard</DialogTitle>
        <DialogDescription>Protected tools for {storeName}. The current cashier stays signed in.</DialogDescription>
      </DialogHeader>
      <div className="h-full overflow-y-auto p-4 pb-24">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map(([label,description,Icon,to])=><button key={label} type="button" onClick={()=>go(to)} className="rounded-xl border bg-background p-4 text-left hover:border-primary/50">
            <Icon className="size-5 text-primary"/><div className="mt-3 font-bold">{label}</div><div className="mt-1 text-sm text-muted-foreground">{description}</div>
          </button>)}
          <button type="button" onClick={()=>go("/manager-tools")} className="rounded-xl border bg-background p-4 text-left hover:border-primary/50">
            <Receipt className="size-5 text-primary"/><div className="mt-3 font-bold">Hardware setup</div><div className="mt-1 text-sm text-muted-foreground">Printer, scanner, drawer, and customer display.</div>
          </button>
          <button type="button" onClick={async()=>{ await deviceControl.stopKiosk().catch(()=>{}); await deviceControl.exitToLauncher(); }} className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left text-destructive">
            <LogOut className="size-5"/><div className="mt-3 font-bold">Exit to Android</div><div className="mt-1 text-sm opacity-80">Leave SEZA and return to the Android launcher.</div>
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
