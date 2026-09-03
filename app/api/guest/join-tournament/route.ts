import { getDatabase } from "@/db/raw";
import { guestExpiryFrom } from "@/lib/guest-players";
import { createGuestToken } from "@/lib/guest-tokens";

export const dynamic = "force-dynamic";

type RawTournament = {
  id: string;
  registrationOpen: number | boolean;
  currentRound: number;
};

type GuestJoinBody = {
  joinCode?: string;
  tournamentId?: string;
  name?: string;
  fideId?: string;
  rating?: number;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Accountless registration: no session, password, or email required. Guest
// players are scoped to the tournament they join and never receive a full
// user_accounts row.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as GuestJoinBody | null;
    if (!body) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const code = cleanText(body.joinCode, 12).toUpperCase();
    const directId = cleanText(body.tournamentId, 80);
    if (!code && !directId) {
      return Response.json({ error: "Enter a tournament code." }, { status: 400 });
    }

    const database = getDatabase();
    const tournament = directId
      ? await database
          .prepare(
            `SELECT id, registration_open AS registrationOpen, current_round AS currentRound
             FROM tournaments WHERE id = ?`,
          )
          .bind(directId)
          .first<RawTournament>()
      : await database
          .prepare(
            `SELECT id, registration_open AS registrationOpen, current_round AS currentRound
             FROM tournaments WHERE UPPER(join_code) = ?`,
          )
          .bind(code)
          .first<RawTournament>();

    if (!tournament) {
      return Response.json({ error: "Tournament code not found." }, { status: 404 });
    }
    if (!tournament.registrationOpen || Number(tournament.currentRound) > 0) {
      return Response.json(
        { error: "Registration is closed for this tournament." },
        { status: 409 },
      );
    }

    const name = cleanText(body.name, 100);
    if (name.length < 2) {
      return Response.json({ error: "Enter your name to join." }, { status: 400 });
    }
    const fideId = cleanText(body.fideId, 24);
    const rating = Math.max(0, Math.min(4000, Number(body.rating) || 0));

    const playerId = crypto.randomUUID();
    const createdAt = new Date();
    await database
      .prepare(
        `INSERT INTO players
           (id, tournament_id, name, fide_id, account_email,
            rating, seed, withdrawn, checked_in, guest_expires_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?,
           (SELECT COALESCE(MAX(seed), 0) + 1 FROM players WHERE tournament_id = ?),
           0, 0, ?, ?)`,
      )
      .bind(
        playerId,
        tournament.id,
        name,
        fideId,
        rating,
        tournament.id,
        guestExpiryFrom(createdAt),
        createdAt.toISOString(),
      )
      .run();

    const { token, expiresAt } = await createGuestToken(database, {
      playerId,
      tournamentId: tournament.id,
      createdAt,
    });

    return Response.json(
      {
        ok: true,
        tournamentId: tournament.id,
        playerId,
        guestToken: token,
        guestTokenExpiresAt: expiresAt,
      },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "Unable to join the tournament right now." },
      { status: 500 },
    );
  }
}
