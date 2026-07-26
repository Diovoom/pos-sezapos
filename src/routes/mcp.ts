// route: /mcp
// This route is intentionally maintained by SEZA so the API security guard is preserved.

import { createFileRoute } from "@tanstack/react-router";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp from "../lib/mcp/index";

const mcpHandler = createTanStackMcpHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async (args) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(args.request, {
          scope: "mcp.transport",
          limit: 120,
          windowSeconds: 60,
          blockSeconds: 60,
          maxBodyBytes: 1024 * 1024,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        return mcpHandler(args);
      },
    },
  },
});
