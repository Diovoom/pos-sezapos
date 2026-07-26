// SEZA-owned MCP route. Guarded by guardApiRequest; the mcp-js Vite plugin
// emits its generated copies outside src/routes so this file is not overwritten.
// route: /mcp
// emitted to: src/routes/mcp.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";

const mcpHandler = createTanStackMcpHandler(mcp, { resourcePath: "/mcp", metadataPath: "/.well-known/oauth-protected-resource", trustForwardedHost: true });

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: async (ctx: Parameters<typeof mcpHandler>[0]) => {
        const { guardApiRequest } = await import(
          "@/lib/security/api-security.server"
        );
        const blocked = await guardApiRequest(ctx.request, {
          scope: "mcp.endpoint",
          limit: 120,
          windowSeconds: 60,
          blockSeconds: 0,
          maxBodyBytes: 256 * 1024,
          allowMissingOrigin: true,
          skipOriginCheck: true,
        });
        if (blocked) return blocked;
        return mcpHandler(ctx);
      },
    },
  },
});
