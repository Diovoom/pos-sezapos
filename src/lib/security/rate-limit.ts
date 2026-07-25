import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type FunctionRateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
  durable?: boolean;
};

/** Rate-limit middleware safe to import from createServerFn modules. */
export function createRateLimitMiddleware(options: FunctionRateLimitOptions) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }: any) => {
    const request = getRequest();
    const { enforceRateLimit, getClientIp, requestPath } = await import("./rate-limit.server");
    const actor = context?.userId || getClientIp(request);
    await enforceRateLimit({
      ...options,
      identifier: `${actor}:${requestPath(request)}`,
      request,
      durable: options.durable ?? true,
    });
    return next();
  });
}

export const publicReadRateLimit = createRateLimitMiddleware({
  scope: "server.public.read",
  limit: 60,
  windowSeconds: 60,
  blockSeconds: 60,
});

export const publicWriteRateLimit = createRateLimitMiddleware({
  scope: "server.public.write",
  limit: 20,
  windowSeconds: 60,
  blockSeconds: 300,
});

export const credentialRateLimit = createRateLimitMiddleware({
  scope: "server.public.credential",
  limit: 8,
  windowSeconds: 15 * 60,
  blockSeconds: 30 * 60,
});

export const authenticatedWriteRateLimit = createRateLimitMiddleware({
  scope: "server.authenticated.write",
  limit: 60,
  windowSeconds: 60,
  blockSeconds: 120,
});

export const expensiveActionRateLimit = createRateLimitMiddleware({
  scope: "server.expensive",
  limit: 10,
  windowSeconds: 60,
  blockSeconds: 300,
});
