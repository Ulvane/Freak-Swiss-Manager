export const PLAYER_SESSION_COOKIE = "freak_swiss_player_session";
export const PLAYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const PLAYER_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const encoder = new TextEncoder();

export function playerSessionTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === PLAYER_SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

export function createPlayerSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function isValidPlayerSessionToken(value: string | null | undefined) {
  return Boolean(value && PLAYER_SESSION_TOKEN_PATTERN.test(value));
}

export async function hashPlayerSessionToken(rawToken: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function playerSessionExpiryFrom(now = new Date()) {
  return new Date(
    now.getTime() + PLAYER_SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();
}

export function playerSessionCookie(rawToken: string, secure: boolean) {
  return [
    `${PLAYER_SESSION_COOKIE}=${rawToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${PLAYER_SESSION_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export async function cleanupExpiredPlayerSessions(
  database: D1Database,
  now = new Date(),
) {
  await database
    .prepare(`DELETE FROM player_sessions WHERE expires_at <= ?`)
    .bind(now.toISOString())
    .run();
}
