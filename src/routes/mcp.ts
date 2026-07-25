// route: /mcp
// emitted to: src/routes/mcp.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";

const sezaMcpHandler = createTanStackMcpHandler(mcp, { resourcePath: "/mcp", metadataPath: "/.well-known/oauth-protected-resource", trustForwardedHost: true });

async function guardedMcpHandler(context: any) {
  const { guardApiRequest } = await import("@/lib/security/api-security.server");
  const blocked = await guardApiRequest(context.request, {
    scope: "api.mcp.main",
    limit: 60,
    windowSeconds: 60,
    blockSeconds: 300,
    maxBodyBytes: 256 * 1024,
    skipOriginCheck: true,
  });
  return blocked ?? sezaMcpHandler(context);
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: guardedMcpHandler,
    },
  },
});
