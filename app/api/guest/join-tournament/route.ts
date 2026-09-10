import { normalizePersonName, isValidPersonName, PERSON_NAME_ERROR } from "@/lib/person-name";
import { getDatabase } from "@/db/raw";
import { guestExpiryFrom } from "@/lib/guest-players";
import { createGuestToken } from "@/lib/guest-tokens";
import { readJsonRequest, registrationConflict } from "@/lib/request-security";
import {
  browserTokenCookie,
  browserTokenHeaders,
  checkRequestBanned,
  recordPlayerBrowser,
  recordVisitorLog,
} from "@/lib/anti-abuse";

export const dynamic = "force-dynamic";

type RawTournament = {
  id: string;
  registrationOpen: number | boolean;
  currentRound: number;
  archivedAt: string | null;
};

type GuestJoinBody = {
  joinCode?: string;
  tournamentId?: string;
  name?: string;
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
    const database = getDatabase();
    const { banned, telemetry, rawBrowserToken, browserHash, isNewToken } =
      await checkRequestBanned(request, database);

    if (banned) {
      await recordVisitorLog(database, telemetry);
      return Response.json(
        { error: "Your access to this site has been blocked.", banned: true },
        { status: 403, headers: browserTokenHeaders(request, rawBrowserToken, isNewToken) },
      );
    }

    const parsed = await readJsonRequest(request);
    if (parsed instanceof Response) return parsed;
    const body = parsed as GuestJoinBody;
    if (!body) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const code = cleanText(body.joinCode, 12).toUpperCase();
    const directId = cleanText(body.tournamentId, 80);
    if (!code && !directId) {
      return Response.json({ error: "Enter a tournament code." }, { status: 400 });
    }

    const tournament = directId
      ? await database
          .prepare(
            `SELECT id, registration_open AS registrationOpen, current_round AS currentRound, archived_at AS archivedAt
             FROM tournaments WHERE id = ?`,
          )
          .bind(directId)
          .first<RawTournament>()
      : await database
          .prepare(
            `SELECT id, registration_open AS registrationOpen, current_round AS currentRound, archived_at AS archivedAt
             FROM tournaments WHERE UPPER(join_code) = ?`,
          )
          .bind(code)
          .first<RawTournament>();

    if (!tournament) {
      return Response.json({ error: "Tournament code not found." }, { status: 404 });
    }
    if (tournament.archivedAt || !tournament.registrationOpen || Number(tournament.currentRound) > 0) {
      return Response.json(
        { error: "Registration is closed for this tournament." },
        { status: 409 },
      );
    }

    const name = normalizePersonName(body.name);
    if (!isValidPersonName(name)) {
      return Response.json({ error: PERSON_NAME_ERROR }, { status: 400 });
    }
    const rating = Math.max(0, Math.min(4000, Number(body.rating) || 0));

    const playerId = crypto.randomUUID();
    const createdAt = new Date();
    await database
      .prepare(
        `INSERT INTO players
           (id, tournament_id, name, account_email,
            rating, seed, withdrawn, checked_in, guest_expires_at, created_at)
         VALUES (?, ?, ?, NULL, ?,
           (SELECT COALESCE(MAX(seed), 0) + 1 FROM players WHERE tournament_id = ?),
           0, 0, ?, ?)`,
      )
      .bind(
        playerId,
        tournament.id,
        name,
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
    await recordPlayerBrowser(database, playerId, browserHash, telemetry.ip);

    const secure = new URL(request.url).protocol === "https:";
    const headers = new Headers();
    if (isNewToken) {
      headers.append("set-cookie", browserTokenCookie(rawBrowserToken, secure));
    }

    return Response.json(
      {
        ok: true,
        tournamentId: tournament.id,
        playerId,
        guestToken: token,
        guestTokenExpiresAt: expiresAt,
      },
      { status: 201, headers },
    );
  } catch (error) {
    const conflict = registrationConflict(error);
    if (conflict) return conflict;
    return Response.json(
      { error: "Unable to join the tournament right now." },
      { status: 500 },
    );
  }
}
