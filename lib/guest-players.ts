export const GUEST_RETENTION_DAYS = 3;

const GUEST_RETENTION_MS = GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function guestExpiryFrom(createdAt: Date) {
  return new Date(createdAt.getTime() + GUEST_RETENTION_MS).toISOString();
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
