import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PlanTier } from "@/hooks/useSubscription";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  feature: string;
  requiredTier: PlanTier;
}

const TIER_LABEL: Record<PlanTier, string> = {
  expired: "a paid plan",
  starter: "Starter",
  pro: "Pro",
  trial_pro: "Pro",
  business: "Business",
};

export function UpgradeModal({ open, onOpenChange, feature, requiredTier }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Upgrade to {TIER_LABEL[requiredTier]}
          </DialogTitle>
          <DialogDescription>
            <strong>{feature}</strong> is included in the {TIER_LABEL[requiredTier]} plan and higher.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button asChild>
            <Link to="/_authenticated/settings" search={{ section: "billing" } as any}>
              See plans
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
