export const GUEST_RETENTION_DAYS = 7;

const GUEST_RETENTION_MS = GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function guestExpiryFrom(createdAt: Date) {
  return new Date(createdAt.getTime() + GUEST_RETENTION_MS).toISOString();
}

/**
 * Removes expired temporary roster entries while preserving any historical
 * player rows referenced by pairings, results, or standings. Unpaired guests
 * can be deleted safely; paired guests are withdrawn and have their access
 * revoked while their player row remains for historical integrity.
 */
export async function cleanupExpiredGuestPlayers(
  database: D1Database,
  now = new Date(),
) {
  const cutoff = now.toISOString();
  const deletedUnpaired = await database
    .prepare(
      `DELETE FROM players
       WHERE guest_expires_at IS NOT NULL
         AND guest_expires_at <= ?
         AND tournament_id IN (
           SELECT id FROM tournaments WHERE current_round = 0
         )`,
    )
    .bind(cutoff)
    .run();
  const revokedPaired = await database
    .prepare(
      `UPDATE players
       SET withdrawn = 1,
           checked_in = 0,
           withdrawn_from_round = COALESCE(
             withdrawn_from_round,
             (SELECT current_round + 1 FROM tournaments WHERE tournaments.id = players.tournament_id)
           ),
           guest_token_hash = NULL
       WHERE guest_expires_at IS NOT NULL
         AND guest_expires_at <= ?
         AND tournament_id IN (
           SELECT id FROM tournaments WHERE current_round > 0
         )`,
    )
    .bind(cutoff)
    .run();
  await database
    .prepare(
      `DELETE FROM player_sessions
       WHERE player_id IN (
         SELECT id FROM players WHERE guest_expires_at IS NOT NULL AND guest_expires_at <= ?
       )`,
    )
    .bind(cutoff)
    .run();
  await database
    .prepare(
      `DELETE FROM guest_tokens
       WHERE player_id IN (
         SELECT id FROM players WHERE guest_expires_at IS NOT NULL AND guest_expires_at <= ?
       )`,
    )
    .bind(cutoff)
    .run();
  return { deletedUnpaired, revokedPaired };
}
