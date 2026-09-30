import { createFileRoute } from "@tanstack/react-router";
import { PendingSyncScreen } from "../../../capacitor-shell/screens/PendingSyncScreen";

export const Route = createFileRoute("/_pos/pending-sync")({ component: PendingSyncScreen });
