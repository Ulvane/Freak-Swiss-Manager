export const GUEST_RETENTION_DAYS = 3;
export const GUEST_PLAYER_COOKIE = "freak_swiss_guest";
export const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const GUEST_RETENTION_MS = GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;

const textEncoder = new TextEncoder();

export function guestExpiryFrom(createdAt: Date) {
  return new Date(createdAt.getTime() + GUEST_RETENTION_MS).toISOString();
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createGuestPlayerToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashGuestPlayerToken(rawToken: string) {
  return sha256(rawToken);
}

export function parseGuestPlayerCookie(value: string | null | undefined) {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;
  const tournamentId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (!tournamentId || !GUEST_TOKEN_PATTERN.test(token)) return null;
  return { tournamentId, token };
}

export function guestPlayerCookieValue(tournamentId: string, rawToken: string) {
  return `${tournamentId}.${rawToken}`;
}

export function guestPlayerCookie(rawToken: string, tournamentId: string, secure: boolean) {
  return [
    `${GUEST_PLAYER_COOKIE}=${guestPlayerCookieValue(tournamentId, rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${GUEST_SESSION_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Removes expired temporary roster entries while they are still safe to delete.
 * Guests are promoted to permanent tournament records when round one starts so
 * pairings, results, and standings can never lose their player references.
 */
export async function cleanupExpiredGuestPlayers(
  database: D1Database,
  now = new Date(),
) {
  return database
    .prepare(
      `DELETE FROM players
       WHERE guest_expires_at IS NOT NULL
         AND guest_expires_at <= ?
         AND tournament_id IN (
           SELECT id FROM tournaments WHERE current_round = 0
         )`,
    )
    .bind(now.toISOString())
    .run();
}
