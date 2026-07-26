// route: /.mcp/invoke-tool/$tool
// This route is intentionally maintained by SEZA so the API security guard is preserved.

import { createFileRoute } from "@tanstack/react-router";
import { createTanStackInvokeToolHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp from "../../../lib/mcp/index";

const invokeToolHandler = createTanStackInvokeToolHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      ANY: async (args) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(args.request, {
          scope: "mcp.invoke-tool",
          limit: 90,
          windowSeconds: 60,
          blockSeconds: 120,
          maxBodyBytes: 1024 * 1024,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        return invokeToolHandler(args);
      },
    },
  },
});
