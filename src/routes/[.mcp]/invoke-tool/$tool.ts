// SEZA-owned MCP route. Guarded by guardApiRequest; the mcp-js Vite plugin
// emits its generated copies outside src/routes so this file is not overwritten.
// route: /.mcp/invoke-tool/$tool
// emitted to: src/routes/[.mcp]/invoke-tool/$tool.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackInvokeToolHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../../lib/mcp/index";

const invokeToolHandler = createTanStackInvokeToolHandler(mcp, { resourcePath: "/mcp", metadataPath: "/.well-known/oauth-protected-resource", trustForwardedHost: true });

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: async (ctx: Parameters<typeof invokeToolHandler>[0]) => {
        const { guardApiRequest } = await import(
          "@/lib/security/api-security.server"
        );
        const blocked = await guardApiRequest(ctx.request, {
          scope: "mcp.invoke-tool",
          limit: 60,
          windowSeconds: 60,
          blockSeconds: 0,
          maxBodyBytes: 256 * 1024,
          allowMissingOrigin: true,
          skipOriginCheck: true,
        });
        if (blocked) return blocked;
        return invokeToolHandler(ctx);
      },
    },
  },
});
