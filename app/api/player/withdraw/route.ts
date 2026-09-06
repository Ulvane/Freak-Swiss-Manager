import { getAuthenticatedUser, normalizeEmail } from "@/app/auth-server";
import { getDatabase } from "@/db/raw";
import { verifyGuestToken } from "@/lib/guest-tokens";

export const dynamic = "force-dynamic";

type WithdrawBody = {
  tournamentId?: string;
  confirm?: boolean;
  guestToken?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Player self-withdrawal for both registered accounts and guests. Historical
// pairings/results are never touched: only the roster status changes and
// pending future-round statuses are cleared.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as WithdrawBody | null;
    if (!body || body.confirm !== true) {
      return Response.json(
        { error: "Confirm withdrawal to continue." },
        { status: 400 },
      );
    }

    const tournamentId = cleanText(body.tournamentId, 80);
    if (!tournamentId) {
      return Response.json({ error: "Tournament not found." }, { status: 400 });
    }

    const database = getDatabase();
    let playerId: string | null = null;

    const user = await getAuthenticatedUser();
    if (user) {
      const email = normalizeEmail(user.email);
      const owned = await database
        .prepare(
          `SELECT id FROM players WHERE tournament_id = ? AND account_email = ?`,
        )
        .bind(tournamentId, email)
        .first<{ id: string }>();
      playerId = owned?.id ?? null;
    }

    if (!playerId) {
      const guestIdentity = await verifyGuestToken(
        database,
        body.guestToken,
        tournamentId,
      );
      playerId = guestIdentity?.playerId ?? null;
    }

    if (!playerId) {
      return Response.json(
        { error: "Sign in or provide a valid guest token to withdraw." },
        { status: 401 },
      );
    }

    const tournament = await database
      .prepare(`SELECT current_round AS currentRound FROM tournaments WHERE id = ?`)
      .bind(tournamentId)
      .first<{ currentRound: number }>();
    if (!tournament) {
      return Response.json({ error: "Tournament not found." }, { status: 404 });
    }

    await database.batch([
      database
        .prepare(
          `UPDATE players SET withdrawn = 1, checked_in = 0
           WHERE id = ? AND tournament_id = ?`,
        )
        .bind(playerId, tournamentId),
      database
        .prepare(
          `DELETE FROM player_round_statuses
           WHERE tournament_id = ? AND player_id = ? AND round_number > ?`,
        )
        .bind(tournamentId, playerId, Number(tournament.currentRound)),
    ]);

    return Response.json({ ok: true, tournamentId, playerId });
  } catch {
    return Response.json(
      { error: "Unable to withdraw from the tournament right now." },
      { status: 500 },
    );
  }
}
