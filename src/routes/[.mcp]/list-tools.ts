// SEZA-owned MCP route. Guarded by guardApiRequest; the mcp-js Vite plugin
// emits its generated copies outside src/routes so this file is not overwritten.
// route: /.mcp/list-tools

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
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: async (ctx: Parameters<typeof listToolsHandler>[0]) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(ctx.request, {
          scope: "mcp.list-tools",
          limit: 120,
          windowSeconds: 60,
          blockSeconds: 0,
          maxBodyBytes: 64 * 1024,
          allowMissingOrigin: true,
          skipOriginCheck: true,
        });
        if (blocked) return blocked;
        return listToolsHandler(ctx);
      },
    },
  },
});
