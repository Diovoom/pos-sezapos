// route: /.mcp/list-tools
// This route is intentionally maintained by SEZA so the API security guard is preserved.

import { createFileRoute } from "@tanstack/react-router";
import { createTanStackListToolsHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp from "../../lib/mcp/index";

const listToolsHandler = createTanStackListToolsHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/.mcp/list-tools")({
  server: {
    handlers: {
      ANY: async (args) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(args.request, {
          scope: "mcp.list-tools",
          limit: 60,
          windowSeconds: 60,
          blockSeconds: 60,
          maxBodyBytes: 16 * 1024,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        return listToolsHandler(args);
      },
    },
  },
});
