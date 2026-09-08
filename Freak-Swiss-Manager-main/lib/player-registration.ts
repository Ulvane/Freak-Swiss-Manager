export function normalizeFideId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 24) : "";
}

export async function findPlayerByFideId(
  database: D1Database,
  tournamentId: string,
  fideId: string,
) {
  if (!fideId) return null;
  return database
    .prepare(
      `SELECT id FROM players
       WHERE tournament_id = ? AND fide_id <> '' AND fide_id = ?
       LIMIT 1`,
    )
    .bind(tournamentId, fideId)
    .first<{ id: string }>();
}
