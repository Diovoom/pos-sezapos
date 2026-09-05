import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { StatusBar, Style } from "@capacitor/status-bar";
import type { QueryClient } from "@tanstack/react-query";
import { isNativeMode } from "@/lib/native";
import { syncNow } from "@/lib/offline/sync";

export function NativeRuntime({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    if (!isNativeMode()) return;

    document.documentElement.classList.add("native-app");
    document.body.classList.add("native-app-ready");

    void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: "#ffffff" }).catch(() => undefined);
    void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);

    const refresh = () => {
      void queryClient.invalidateQueries();
      void syncNow();
    };

    const appListener = App.addListener("appStateChange", ({ isActive }) => {
      document.documentElement.classList.toggle("native-app-background", !isActive);
      if (isActive) refresh();
    });
    const resumeListener = App.addListener("resume", refresh);
    const networkListener = Network.addListener("networkStatusChange", ({ connected }) => {
      document.documentElement.classList.toggle("native-offline", !connected);
      if (connected) refresh();
    });

    void Network.getStatus().then(({ connected }) => {
      document.documentElement.classList.toggle("native-offline", !connected);
    });

    return () => {
      document.body.classList.remove("native-app-ready");
      void appListener.then((listener) => listener.remove());
      void resumeListener.then((listener) => listener.remove());
      void networkListener.then((listener) => listener.remove());
    };
  }, [queryClient]);

  return null;
}
