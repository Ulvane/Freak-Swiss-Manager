import { validateRequestOrigin } from "./request-security";

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type SecurityBindings = {
  AUTH_RATE_LIMITER: RateLimiter;
  WRITE_RATE_LIMITER: RateLimiter;
  READ_RATE_LIMITER: RateLimiter;
};

export async function guardApiRequest(request: Request, env: SecurityBindings) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/")) return null;
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutation) {
    const rejected = validateRequestOrigin(request);
    if (rejected) return rejected;
  }
  // Cloudflare supplies this header; never trust a user-controlled forwarded IP.
  // The fallback shares one bucket for local development without Cloudflare.
  const client = request.headers.get("cf-connecting-ip") || "local-development";
  const authentication = path === "/api/auth/login" || path === "/api/auth/register";
  const limiter = authentication ? env.AUTH_RATE_LIMITER : mutation ? env.WRITE_RATE_LIMITER : env.READ_RATE_LIMITER;
  if (!limiter) {
    return Response.json({ error: "Request protection is temporarily unavailable." }, { status: 503 });
  }
  const { success } = await limiter.limit({ key: `freak-swiss:${client}` });
  return success ? null : Response.json(
    { error: "Too many requests. Please wait a minute and try again." },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

export function withSecurityHeaders(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  // This policy closes framing/base-URL injection without breaking React's
  // framework-generated inline scripts. Script nonces require separate wiring.
  headers.append("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/") || path === "/auth" || path === "/guest/join") {
    headers.set("Cache-Control", "private, no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
