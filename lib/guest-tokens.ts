export const GUEST_TOKEN_TTL_DAYS = 30;

const GUEST_TOKEN_TTL_MS = GUEST_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// TOKEN_ALPHABET has 32 characters, so we only accept byte values below the
// largest multiple of 32 that fits in a byte. This avoids modulo bias instead
// of relying on 256 happening to be evenly divisible by the alphabet length.
const TOKEN_ALPHABET_MAX_BYTE =
  256 - (256 % TOKEN_ALPHABET.length);

export function guestTokenExpiryFrom(createdAt: Date) {
  return new Date(createdAt.getTime() + GUEST_TOKEN_TTL_MS).toISOString();
}

function randomAlphabetChar() {
  const bytes = new Uint8Array(1);
  let value: number;
  do {
    crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= TOKEN_ALPHABET_MAX_BYTE);
  return TOKEN_ALPHABET[value % TOKEN_ALPHABET.length];
}

/**
 * Generates a fresh, high-entropy guest access token. Only the SHA-256 hash
 * of this value is ever stored, so it must be returned to the guest once and
 * cannot be recovered later.
 */
export function createGuestTokenValue() {
  const body = Array.from({ length: 20 }, () => randomAlphabetChar()).join("");
  return `GST-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}`;
}

export function compactGuestToken(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

export async function digestGuestToken(compactToken: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(compactToken),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function guestTokenHint(compactToken: string) {
  return compactToken.slice(-4);
}

/**
 * Issues a guest token scoped to a single player within a single tournament.
 * The raw token is only ever available to the caller of this function; the
 * database keeps just the SHA-256 hash and a short display hint.
 */
export async function createGuestToken(
  database: D1Database,
  params: { playerId: string; tournamentId: string; createdAt?: Date },
) {
  const createdAt = params.createdAt ?? new Date();
  const compact = compactGuestToken(createGuestTokenValue());
  const tokenHash = await digestGuestToken(compact);
  const expiresAt = guestTokenExpiryFrom(createdAt);

  await database.batch([
    database
      .prepare(
        `INSERT INTO guest_tokens
           (id, player_id, tournament_id, token_hash, token_hint, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        params.playerId,
        params.tournamentId,
        tokenHash,
        guestTokenHint(compact),
        expiresAt,
        createdAt.toISOString(),
      ),
    database
      .prepare(`UPDATE players SET guest_token_hash = ? WHERE id = ?`)
      .bind(tokenHash, params.playerId),
  ]);

  return { token: compact, expiresAt };
}

export type GuestIdentity = { playerId: string; tournamentId: string };

/**
 * Verifies a guest token server-side. Confirms the token is unexpired, that
 * the referenced player still belongs to the referenced tournament, and (when
 * a tournament is supplied) that the token is scoped to that exact
 * tournament. Never trusts a bare player id supplied by the client.
 */
export async function verifyGuestToken(
  database: D1Database,
  rawToken: string | null | undefined,
  tournamentId?: string | null,
  now = new Date(),
): Promise<GuestIdentity | null> {
  const compact = compactGuestToken(rawToken);
  if (!compact) return null;

  const tokenHash = await digestGuestToken(compact);
  const row = await database
    .prepare(
      `SELECT gt.player_id AS playerId, gt.tournament_id AS tournamentId
       FROM guest_tokens gt
       JOIN players p
         ON p.id = gt.player_id AND p.tournament_id = gt.tournament_id
       WHERE gt.token_hash = ? AND gt.expires_at > ?`,
    )
    .bind(tokenHash, now.toISOString())
    .first<GuestIdentity>();

  if (!row) return null;
  if (tournamentId && row.tournamentId !== tournamentId) return null;
  return row;
}
