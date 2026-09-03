import { getDatabase } from "@/db/raw";
import { guestExpiryFrom } from "@/lib/guest-players";
import { createGuestToken } from "@/lib/guest-tokens";

export const dynamic = "force-dynamic";

type JoinRequest = {
  tournament_code?: unknown;
  name?: unknown;
  rating?: unknown;
  surname?: unknown;
  federation?: unknown;
  club?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as JoinRequest | null;
    const code = cleanText(body?.tournament_code, 12).toUpperCase();
    const name = cleanText(body?.name, 100);
    const ratingValue = typeof body?.rating === "number" || typeof body?.rating === "string"
      ? Number(body.rating)
      : Number.NaN;
    if (!code || name.length < 2 || !Number.isInteger(ratingValue) || ratingValue < 0 || ratingValue > 4000) {
      return Response.json(
        { error: "Enter a tournament code, name, and rating from 0 to 4000." },
        { status: 400 },
      );
    }

    const database = getDatabase();
    const tournament = await database
      .prepare(
        `SELECT id, registration_open AS registrationOpen, current_round AS currentRound
         FROM tournaments WHERE UPPER(join_code) = ?`,
      )
      .bind(code)
      .first<{ id: string; registrationOpen: number | boolean; currentRound: number }>();
    if (!tournament) {
      return Response.json({ error: "Tournament code not found." }, { status: 404 });
    }
    if (!Boolean(tournament.registrationOpen) || Number(tournament.currentRound) > 0) {
      return Response.json({ error: "Registration is closed." }, { status: 409 });
    }

    const createdAt = new Date();
    const playerId = crypto.randomUUID();
    const expiresAt = guestExpiryFrom(createdAt);
    await database
      .prepare(
        `INSERT INTO players
           (id, tournament_id, name, surname, federation, club, fide_id, account_email,
            rating, seed, withdrawn, checked_in, guest_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '', NULL, ?,
           (SELECT COALESCE(MAX(seed), 0) + 1 FROM players WHERE tournament_id = ?),
           0, 0, ?, ?)`,
      )
      .bind(
        playerId,
        tournament.id,
        name,
        cleanText(body?.surname, 100),
        cleanText(body?.federation, 60),
        cleanText(body?.club, 100),
        ratingValue,
        tournament.id,
        expiresAt,
        createdAt.toISOString(),
      )
      .run();
    const guestToken = await createGuestToken(
      database,
      { playerId, tournamentId: tournament.id },
      expiresAt,
      createdAt.toISOString(),
    );

    return Response.json(
      { ok: true, tournamentId: tournament.id, playerId, guestToken, expiresAt },
      { status: 201 },
    );
  } catch {
    return Response.json({ error: "Unable to register right now." }, { status: 500 });
  }
}
