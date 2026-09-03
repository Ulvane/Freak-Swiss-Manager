const encoder = new TextEncoder();

export type GuestTokenIdentity = {
  playerId: string;
  tournamentId: string;
};

export async function createGuestToken(
  database: D1Database,
  identity: GuestTokenIdentity,
  expiresAt: string,
  createdAt = new Date().toISOString(),
) {
  const value = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashGuestToken(value);

  await database
    .prepare(
      `INSERT INTO guest_tokens
         (id, player_id, tournament_id, token_hash, token_hint, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      identity.playerId,
      identity.tournamentId,
      tokenHash,
      `••••${value.slice(-4)}`,
      expiresAt,
      createdAt,
    )
    .run();

  return value;
}

export async function verifyGuestToken(
  database: D1Database,
  token: string,
  tournamentId: string,
) {
  const tokenHash = await hashGuestToken(token);
  return database
    .prepare(
      `SELECT gt.player_id AS playerId, gt.tournament_id AS tournamentId
       FROM guest_tokens gt
       JOIN players p ON p.id = gt.player_id AND p.tournament_id = gt.tournament_id
       WHERE gt.token_hash = ? AND gt.tournament_id = ?
         AND gt.expires_at > ? AND p.account_email IS NULL`,
    )
    .bind(tokenHash, tournamentId, new Date().toISOString())
    .first<GuestTokenIdentity>();
}

export async function hashGuestToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
