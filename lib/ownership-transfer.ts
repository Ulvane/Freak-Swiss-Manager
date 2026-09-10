/** Resolve successors inside the deletion batch so concurrent changes cannot
 * leave a tournament with the account being deleted as its owner. */
export function transferDeletedOwnerStatements(
  database: D1Database,
  target: string,
  superadmin: string,
  now: string,
  transferId: string,
): D1PreparedStatement[] {
  return [
    database.prepare(
      `INSERT INTO moderation_audit_log
         (id, actor_email, action, target_email, tournament_id, detail, created_at)
       SELECT ? || ':' || t.id, ?, 'transfer_tournament_ownership',
              COALESCE((
                SELECT m.email FROM moderators m
                JOIN user_accounts ua ON ua.email = m.email
                JOIN auth_credentials ac ON ac.email = m.email
                LEFT JOIN moderation_accounts ma ON ma.email = m.email
                LEFT JOIN tournament_moderators tm
                  ON tm.moderator_email = m.email AND tm.tournament_id = t.id
                WHERE m.email <> ? AND m.email <> ?
                  AND COALESCE(ma.status, 'active') = 'active'
                ORDER BY (tm.id IS NULL), COALESCE(tm.created_at, m.created_at), m.email
                LIMIT 1
              ), ?), t.id, ?, ?
       FROM tournaments t WHERE t.owner_email = ?`,
    ).bind(transferId, superadmin, target, superadmin, superadmin,
      `Previous organizer: ${target}. Transferred before account deletion.`, now, target),
    database.prepare(
      `UPDATE tournaments SET owner_email = (
         SELECT target_email FROM moderation_audit_log WHERE id = ? || ':' || tournaments.id
       ) WHERE owner_email = ?`,
    ).bind(transferId, target),
    database.prepare(
      `DELETE FROM tournament_moderators WHERE EXISTS (
         SELECT 1 FROM moderation_audit_log log
         WHERE log.id = ? || ':' || tournament_moderators.tournament_id
           AND log.target_email = tournament_moderators.moderator_email
       )`,
    ).bind(transferId),
  ];
}
