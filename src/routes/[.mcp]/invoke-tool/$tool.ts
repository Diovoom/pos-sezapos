// route: /.mcp/invoke-tool/$tool
// emitted to: src/routes/[.mcp]/invoke-tool/$tool.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackInvokeToolHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../../lib/mcp/index";

const sezaMcpHandler = createTanStackInvokeToolHandler(mcp, { resourcePath: "/mcp", metadataPath: "/.well-known/oauth-protected-resource", trustForwardedHost: true });

async function guardedMcpHandler(context: any) {
  const { guardApiRequest } = await import("@/lib/security/api-security.server");
  const blocked = await guardApiRequest(context.request, {
    scope: "api.mcp.invoke_tool",
    limit: 30,
    windowSeconds: 60,
    blockSeconds: 300,
    maxBodyBytes: 256 * 1024,
    skipOriginCheck: true,
  });
  return blocked ?? sezaMcpHandler(context);
}

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: guardedMcpHandler,
    },
  },
});
