import {
  cookieValue,
  getAuthenticatedUserFromToken,
  SESSION_COOKIE,
} from "@/app/auth-server";
import { getDatabase } from "@/db/raw";
import { verifyGuestToken } from "@/lib/guest-tokens";

export const dynamic = "force-dynamic";

type WithdrawRequest = {
  tournament_id?: unknown;
  confirmation?: unknown;
  auth_token?: unknown;
  guest_token?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as WithdrawRequest | null;
    const tournamentId = cleanText(body?.tournament_id, 80);
    if (!tournamentId || body?.confirmation !== true) {
      return Response.json(
        { error: "Tournament and withdrawal confirmation are required." },
        { status: 400 },
      );
    }

    const database = getDatabase();
    let playerId: string | null = null;
    const guestToken = cleanText(body?.guest_token, 128);
    if (guestToken) {
      const identity = await verifyGuestToken(database, guestToken, tournamentId);
      playerId = identity?.playerId ?? null;
    } else {
      const authToken =
        cleanText(body?.auth_token, 128) || cookieValue(request, SESSION_COOKIE);
      const user = await getAuthenticatedUserFromToken(authToken);
      if (user) {
        const player = await database
          .prepare(
            `SELECT id FROM players WHERE tournament_id = ? AND account_email = ?`,
          )
          .bind(tournamentId, user.email)
          .first<{ id: string }>();
        playerId = player?.id ?? null;
      }
    }
    if (!playerId) {
      return Response.json(
        { error: "A valid player session or guest token is required." },
        { status: 403 },
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
    return Response.json({ error: "Unable to withdraw right now." }, { status: 500 });
  }
}
