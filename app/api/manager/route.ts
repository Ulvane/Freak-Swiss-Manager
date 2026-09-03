import {
  getAuthenticatedUser,
  isSuperadmin,
  normalizeEmail,
} from "@/app/auth-server";
import { getDatabase } from "@/db/raw";
import { guestExpiryFrom } from "@/lib/guest-players";
import {
  createSwissPairings,
  hydratePairingPlayers,
  type EnginePairing,
} from "@/lib/pairing-engine";
import { calculateStandings } from "@/lib/standings";
import {
  createTestTournamentRoster,
  TEST_TOURNAMENT_SOURCE,
} from "@/lib/test-tournament";
import { isEnterableResult } from "@/lib/result-workflow";
import type {
  AccountSummary,
  ManagerPayload,
  ModeratorSummary,
  ModeratorTokenSummary,
  Pairing,
  Player,
  ResultCode,
  Tournament,
  TournamentSnapshot,
  TournamentSummary,
} from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

type GlobalRole = "superadmin" | "moderator" | "player" | "visitor";

type RawTournament = {
  id: string;
  ownerEmail: string;
  name: string;
  city: string;
  rounds: number;
  joinCode: string | null;
  registrationOpen: number | boolean;
  currentRound: number;
  status: string;
  createdAt: string;
};

type RawTournamentSummary = RawTournament & {
  playerCount: number;
  role?: TournamentSummary["role"];
};

type RawPlayer = Omit<
  Player,
  "withdrawn" | "checkedIn" | "isYou" | "nextRoundStatus"
> & {
  withdrawn: number | boolean;
  checkedIn: number | boolean;
  accountEmail: string | null;
  nextRoundStatus: string;
};

const TOURNAMENT_SELECT = `
  id, owner_email AS ownerEmail, name, city, rounds,
  join_code AS joinCode, registration_open AS registrationOpen,
  current_round AS currentRound, status, created_at AS createdAt
`;

const TOURNAMENT_SELECT_FROM_T = `
  t.id, t.owner_email AS ownerEmail, t.name, t.city, t.rounds,
  t.join_code AS joinCode, t.registration_open AS registrationOpen,
  t.current_round AS currentRound, t.status, t.created_at AS createdAt
`;

function publicTournament(row: RawTournament): Tournament {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    rounds: Number(row.rounds),
    joinCode: row.joinCode,
    registrationOpen: Boolean(row.registrationOpen),
    currentRound: Number(row.currentRound),
    status: row.status,
    createdAt: row.createdAt,
  };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function pairingInsertStatements(
  database: D1Database,
  tournamentId: string,
  roundId: string,
  roundNumber: number,
  pairings: EnginePairing[],
) {
  const statements = [];
  const rowsPerStatement = 12;
  for (let offset = 0; offset < pairings.length; offset += rowsPerStatement) {
    const chunk = pairings.slice(offset, offset + rowsPerStatement);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = chunk.flatMap((pairing, index) => [
      crypto.randomUUID(),
      tournamentId,
      roundId,
      roundNumber,
      offset + index + 1,
      pairing.whitePlayerId,
      pairing.blackPlayerId,
      pairing.result,
    ]);
    statements.push(
      database
        .prepare(
          `INSERT INTO pairings
             (id, tournament_id, round_id, round_number, board_number,
              white_player_id, black_player_id, result)
           VALUES ${placeholders}`,
        )
        .bind(...values),
    );
  }
  return statements;
}

async function getGlobalRole(email: string | null): Promise<GlobalRole> {
  if (!email) return "visitor";
  if (isSuperadmin(email)) return "superadmin";
  const row = await getDatabase()
    .prepare(`SELECT email FROM moderators WHERE email = ?`)
    .bind(normalizeEmail(email))
    .first<{ email: string }>();
  return row ? "moderator" : "player";
}

async function canControlTournament(tournamentId: string, email: string) {
  if (isSuperadmin(email)) return true;
  const assignment = await getDatabase()
    .prepare(
      `SELECT id FROM tournament_moderators
       WHERE tournament_id = ? AND moderator_email = ?`,
    )
    .bind(tournamentId, normalizeEmail(email))
    .first<{ id: string }>();
  return Boolean(assignment);
}

async function getTournamentForControl(tournamentId: string, email: string) {
  if (!(await canControlTournament(tournamentId, email))) return null;
  return getDatabase()
    .prepare(`SELECT ${TOURNAMENT_SELECT} FROM tournaments WHERE id = ?`)
    .bind(tournamentId)
    .first<RawTournament>();
}

function randomJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function uniqueJoinCode() {
  const database = getDatabase();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomJoinCode();
    const existing = await database
      .prepare(`SELECT id FROM tournaments WHERE join_code = ?`)
      .bind(code)
      .first<{ id: string }>();
    if (!existing) return code;
  }
  throw new Error("Unable to create a unique join code. Please try again.");
}

async function ensureJoinCode(tournament: RawTournament, canControl: boolean) {
  if (tournament.joinCode || !canControl) return tournament;
  const code = await uniqueJoinCode();
  const database = getDatabase();
  await database
    .prepare(`UPDATE tournaments SET join_code = ? WHERE id = ? AND join_code IS NULL`)
    .bind(code, tournament.id)
    .run();
  const persisted = await database
    .prepare(`SELECT join_code AS joinCode FROM tournaments WHERE id = ?`)
    .bind(tournament.id)
    .first<{ joinCode: string | null }>();
  return { ...tournament, joinCode: persisted?.joinCode ?? code };
}

function compactModeratorToken(value: unknown) {
  return cleanText(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function digestToken(compactToken: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(compactToken));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createModeratorTokenValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `MOD-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

async function uniqueModeratorToken() {
  const database = getDatabase();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = createModeratorTokenValue();
    const hash = await digestToken(compactModeratorToken(value));
    const existing = await database
      .prepare(`SELECT id FROM moderator_tokens WHERE token_hash = ?`)
      .bind(hash)
      .first<{ id: string }>();
    if (!existing) return { value, hash };
  }
  throw new Error("Unable to create a moderator token. Please try again.");
}

async function loadTournamentModerators(tournamentId: string): Promise<ModeratorSummary[]> {
  const rows = await getDatabase()
    .prepare(
      `SELECT m.email, m.display_name AS displayName, m.created_at AS createdAt,
              1 AS tournamentCount
       FROM tournament_moderators tm
       JOIN moderators m ON m.email = tm.moderator_email
       WHERE tm.tournament_id = ?
       ORDER BY m.display_name COLLATE NOCASE`,
    )
    .bind(tournamentId)
    .all<ModeratorSummary>();
  return rows.results ?? [];
}

async function loadSnapshot(
  tournamentId: string,
  viewerEmail: string | null,
): Promise<TournamentSnapshot | null> {
  const database = getDatabase();
  const row = await database
    .prepare(`SELECT ${TOURNAMENT_SELECT} FROM tournaments WHERE id = ?`)
    .bind(tournamentId)
    .first<RawTournament>();
  if (!row) return null;

  const canEdit = Boolean(viewerEmail && (await canControlTournament(tournamentId, viewerEmail)));
  const tournament = await ensureJoinCode(row, canEdit);
  const [playerRows, pairingRows, tournamentModerators] = await Promise.all([
    database
      .prepare(
        `SELECT id, name, fide_id AS fideId, account_email AS accountEmail,
                rating, seed, withdrawn, checked_in AS checkedIn,
                COALESCE((
                  SELECT status FROM player_round_statuses prs
                  WHERE prs.player_id = players.id
                    AND prs.tournament_id = players.tournament_id
                    AND prs.round_number = ?
                ), 'active') AS nextRoundStatus
         FROM players WHERE tournament_id = ? ORDER BY seed ASC`,
      )
      .bind(Number(tournament.currentRound) + 1, tournamentId)
      .all<RawPlayer>(),
    database
      .prepare(
        `SELECT p.id, p.round_number AS roundNumber, p.board_number AS boardNumber,
                p.white_player_id AS whitePlayerId, p.black_player_id AS blackPlayerId,
                p.result, w.name AS whiteName, b.name AS blackName
         FROM pairings p
         LEFT JOIN players w ON w.id = p.white_player_id
         LEFT JOIN players b ON b.id = p.black_player_id
         WHERE p.tournament_id = ?
         ORDER BY p.round_number DESC, p.board_number ASC`,
      )
      .bind(tournamentId)
      .all<Pairing>(),
    canEdit ? loadTournamentModerators(tournamentId) : Promise.resolve([]),
  ]);

  const rawPlayers = (playerRows.results ?? []) as RawPlayer[];
  const players: Player[] = rawPlayers.map((player) => ({
    id: player.id,
    name: player.name,
    fideId: player.fideId,
    rating: Number(player.rating),
    seed: Number(player.seed),
    withdrawn: Boolean(player.withdrawn),
    checkedIn: Boolean(player.checkedIn),
    nextRoundStatus:
      player.nextRoundStatus === "skip" || player.nextRoundStatus === "bye"
        ? player.nextRoundStatus
        : "active",
    isYou: Boolean(viewerEmail && player.accountEmail === normalizeEmail(viewerEmail)),
  }));
  const pairings = (pairingRows.results ?? []) as Pairing[];
  const isPlayer = rawPlayers.some(
    (player) => Boolean(viewerEmail && player.accountEmail === normalizeEmail(viewerEmail)),
  );
  const viewerRole: TournamentSnapshot["viewerRole"] = canEdit
    ? isSuperadmin(viewerEmail)
      ? "superadmin"
      : "moderator"
    : isPlayer
      ? "player"
      : "visitor";

  return {
    tournament: { ...publicTournament(tournament), joinCode: canEdit ? tournament.joinCode : null },
    players,
    pairings,
    standings: calculateStandings(players, pairings),
    canEdit,
    canDeleteTournament: isSuperadmin(viewerEmail),
    canDeleteRound: canEdit && Number(tournament.currentRound) > 0,
    canInviteModerators: canEdit,
    canRemoveModerators: isSuperadmin(viewerEmail),
    canManageCheckIn: canEdit && Number(tournament.currentRound) === 0,
    canJoin: Boolean(
      viewerEmail && !canEdit && !isPlayer && tournament.registrationOpen && Number(tournament.currentRound) === 0,
    ),
    viewerRole,
    moderators: tournamentModerators,
  };
}

async function loadAdminDirectory() {
  const database = getDatabase();
  const [accountRows, moderatorRows, tokenRows] = await Promise.all([
    database
      .prepare(
        `SELECT ua.email, ua.display_name AS displayName, ua.created_at AS createdAt,
                ua.last_seen_at AS lastSeenAt,
                CASE WHEN m.email IS NULL THEN 0 ELSE 1 END AS isModerator
         FROM user_accounts ua
         LEFT JOIN moderators m ON m.email = ua.email
         ORDER BY ua.last_seen_at DESC`,
      )
      .all<Omit<AccountSummary, "isModerator"> & { isModerator: number | boolean }>(),
    database
      .prepare(
        `SELECT m.email, m.display_name AS displayName, m.created_at AS createdAt,
                COUNT(tm.id) AS tournamentCount
         FROM moderators m
         LEFT JOIN tournament_moderators tm ON tm.moderator_email = m.email
         GROUP BY m.email ORDER BY m.created_at DESC`,
      )
      .all<ModeratorSummary>(),
    database
      .prepare(
        `SELECT mt.id, mt.token_hint AS tokenHint,
                mt.tournament_id AS tournamentId, t.name AS tournamentName,
                mt.created_by_email AS createdByEmail,
                creator.display_name AS createdByName,
                mt.used_by_email AS usedByEmail,
                redeemer.display_name AS usedByName,
                mt.used_at AS usedAt, mt.revoked_at AS revokedAt,
                mt.revoked_by_email AS revokedByEmail,
                mt.expires_at AS expiresAt, mt.created_at AS createdAt
         FROM moderator_tokens mt
         LEFT JOIN tournaments t ON t.id = mt.tournament_id
         LEFT JOIN user_accounts creator ON creator.email = mt.created_by_email
         LEFT JOIN user_accounts redeemer ON redeemer.email = mt.used_by_email
         ORDER BY mt.created_at DESC
         LIMIT 200`,
      )
      .all<ModeratorTokenSummary>(),
  ]);
  return {
    accounts: ((accountRows.results ?? []) as Array<
      Omit<AccountSummary, "isModerator"> & { isModerator: number | boolean }
    >).map((row) => ({ ...row, isModerator: Boolean(row.isModerator) })),
    moderators: ((moderatorRows.results ?? []) as ModeratorSummary[]).map((row) => ({
      ...row,
      tournamentCount: Number(row.tournamentCount),
    })),
    moderatorTokens: (tokenRows.results ?? []) as ModeratorTokenSummary[],
  };
}

async function loadManagerPayload(tournamentId?: string | null) {
  const user = await getAuthenticatedUser();
  const database = getDatabase();
  const viewerEmail = user ? normalizeEmail(user.email) : null;
  const viewerGlobalRole = await getGlobalRole(viewerEmail);
  let tournaments: TournamentSummary[] = [];

  if (viewerEmail) {
    const rows = isSuperadmin(viewerEmail)
      ? await database
          .prepare(
            `SELECT ${TOURNAMENT_SELECT_FROM_T}, COUNT(roster.id) AS playerCount,
                    'superadmin' AS role
             FROM tournaments t
             LEFT JOIN players roster ON roster.tournament_id = t.id
             GROUP BY t.id ORDER BY t.created_at DESC`,
          )
          .all<RawTournamentSummary>()
      : await database
          .prepare(
            `SELECT ${TOURNAMENT_SELECT_FROM_T}, COUNT(DISTINCT roster.id) AS playerCount,
                    CASE WHEN tm.id IS NOT NULL THEN 'moderator' ELSE 'player' END AS role
             FROM tournaments t
             LEFT JOIN tournament_moderators tm
               ON tm.tournament_id = t.id AND tm.moderator_email = ?
             LEFT JOIN players member
               ON member.tournament_id = t.id AND member.account_email = ?
             LEFT JOIN players roster ON roster.tournament_id = t.id
             WHERE tm.id IS NOT NULL OR member.id IS NOT NULL
             GROUP BY t.id ORDER BY t.created_at DESC`,
          )
          .bind(viewerEmail, viewerEmail)
          .all<RawTournamentSummary>();
    tournaments = ((rows.results ?? []) as RawTournamentSummary[]).map((row) => {
      const role = row.role ?? "player";
      return {
        ...publicTournament(row),
        joinCode: role === "superadmin" || role === "moderator" ? row.joinCode : null,
        playerCount: Number(row.playerCount),
        role,
      };
    });
  }

  const selectedId = tournamentId || null;
  let openTournaments: TournamentSummary[] = [];
  if (!selectedId) {
    const openRows = await database
      .prepare(
        `SELECT ${TOURNAMENT_SELECT_FROM_T}, COUNT(p.id) AS playerCount
         FROM tournaments t
         LEFT JOIN players p ON p.tournament_id = t.id
         WHERE t.registration_open = 1 AND t.current_round = 0
         GROUP BY t.id ORDER BY t.created_at DESC LIMIT 12`,
      )
      .all<RawTournamentSummary>();
    const personalIds = new Set(tournaments.map((item) => item.id));
    openTournaments = ((openRows.results ?? []) as RawTournamentSummary[])
      .filter((row) => !personalIds.has(row.id))
      .map((row) => ({
        ...publicTournament(row),
        joinCode: null,
        playerCount: Number(row.playerCount),
        role: "visitor" as const,
      }));
  }
  const snapshot = selectedId ? await loadSnapshot(selectedId, viewerEmail) : null;
  const directory = isSuperadmin(viewerEmail) && !selectedId
    ? await loadAdminDirectory()
    : { accounts: [], moderators: [], moderatorTokens: [] };

  const payload: ManagerPayload = {
    serverTime: new Date().toISOString(),
    authenticated: Boolean(user),
    viewerName: user?.displayName ?? null,
    viewerEmail,
    viewerGlobalRole,
    canCreateTournament: viewerGlobalRole === "superadmin",
    tournaments,
    openTournaments,
    snapshot,
    accounts: directory.accounts,
    moderators: directory.moderators,
    moderatorTokens: directory.moderatorTokens,
  };
  return payload;
}

export async function GET(request: Request) {
  try {
    const tournamentId = new URL(request.url).searchParams.get("t");
    return Response.json(await loadManagerPayload(tournamentId));
  } catch {
    return Response.json(
      { error: "Unable to load tournament data right now." },
      { status: 500 },
    );
  }
}

type ManagerAction =
  | { action: "create_tournament"; name?: string; city?: string; rounds?: number }
  | { action: "create_test_tournament" }
  | {
      action: "add_player";
      tournamentId?: string;
      name?: string;
      fideId?: string;
      rating?: number;
    }
  | {
      action: "join_tournament";
      tournamentId?: string;
      joinCode?: string;
      name?: string;
      fideId?: string;
      rating?: number;
    }
  | { action: "leave_tournament"; tournamentId?: string }
  | { action: "delete_tournament"; tournamentId?: string }
  | { action: "remove_player"; tournamentId?: string; playerId?: string }
  | {
      action: "set_player_checked_in";
      tournamentId?: string;
      playerId?: string;
      checkedIn?: boolean;
    }
  | {
      action: "set_player_withdrawn";
      tournamentId?: string;
      playerId?: string;
      withdrawn?: boolean;
    }
  | {
      action: "set_player_next_round_status";
      tournamentId?: string;
      playerId?: string;
      status?: "active" | "skip" | "bye";
    }
  | { action: "toggle_registration"; tournamentId?: string; open?: boolean }
  | { action: "generate_round"; tournamentId?: string }
  | { action: "delete_round"; tournamentId?: string }
  | {
      action: "set_result";
      tournamentId?: string;
      pairingId?: string;
      result?: ResultCode;
    }
  | { action: "create_moderator_token"; tournamentId?: string }
  | { action: "redeem_moderator_token"; token?: string }
  | { action: "revoke_moderator_token"; tokenId?: string }
  | { action: "delete_moderator_token"; tokenId?: string }
  | { action: "remove_tournament_moderator"; tournamentId?: string; email?: string }
  | { action: "delete_moderator"; email?: string }
  | { action: "delete_account"; email?: string };

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Sign in to continue." }, { status: 401 });
    }

    const email = normalizeEmail(user.email);
    const body = (await request.json().catch(() => null)) as ManagerAction | null;
    if (!body || typeof body.action !== "string") {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const database = getDatabase();
    const globalRole = await getGlobalRole(email);

    if (body.action === "redeem_moderator_token") {
      const compact = compactModeratorToken(body.token);
      if (!compact.startsWith("MOD") || compact.length !== 15) {
        return Response.json({ error: "Enter a valid moderator token." }, { status: 400 });
      }
      const hash = await digestToken(compact);
      const token = await database
        .prepare(
          `SELECT id, tournament_id AS tournamentId
           FROM moderator_tokens
           WHERE token_hash = ? AND tournament_id IS NOT NULL
             AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
        )
        .bind(hash, new Date().toISOString())
        .first<{ id: string; tournamentId: string | null }>();
      if (!token) {
        return Response.json(
          { error: "This moderator token is invalid, expired, or already used." },
          { status: 409 },
        );
      }

      const now = new Date().toISOString();
      const claim = await database
        .prepare(
          `UPDATE moderator_tokens SET used_by_email = ?, used_at = ?
           WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
             AND expires_at > ?`,
        )
        .bind(email, now, token.id, now)
        .run();
      if (Number(claim.meta?.changes ?? 0) !== 1) {
        return Response.json({ error: "This token was already used." }, { status: 409 });
      }

      const writes = [
        database
          .prepare(
            `INSERT INTO moderators (email, display_name, created_by_email, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name`,
          )
          .bind(email, user.displayName, email, now),
      ];
      if (token.tournamentId) {
        writes.push(
          database
            .prepare(
              `INSERT OR IGNORE INTO tournament_moderators
                 (id, tournament_id, moderator_email, assigned_by_email, created_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(crypto.randomUUID(), token.tournamentId, email, email, now),
        );
      }
      await database.batch(writes);
      return Response.json({ ok: true, tournamentId: token.tournamentId });
    }

    if (body.action === "create_moderator_token") {
      const tournamentId = cleanText(body.tournamentId, 80);
      if (!tournamentId) {
        return Response.json(
          { error: "Choose the tournament this moderator will control." },
          { status: 400 },
        );
      }
      if (!(await canControlTournament(tournamentId, email))) {
        return Response.json(
          { error: "You can only invite moderators to a tournament you control." },
          { status: 403 },
        );
      }

      const token = await uniqueModeratorToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await database
        .prepare(
          `INSERT INTO moderator_tokens
             (id, token_hash, token_hint, tournament_id, created_by_email,
              used_by_email, used_at, revoked_at, revoked_by_email, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          token.hash,
          `MOD-••••-••••-${token.value.slice(-4)}`,
          tournamentId,
          email,
          expiresAt.toISOString(),
          now.toISOString(),
        )
        .run();
      return Response.json({
        ok: true,
        tournamentId,
        moderatorToken: token.value,
        expiresAt: expiresAt.toISOString(),
      });
    }

    if (body.action === "revoke_moderator_token") {
      if (!isSuperadmin(email)) {
        return Response.json({ error: "Superadmin access required." }, { status: 403 });
      }
      const tokenId = cleanText(body.tokenId, 80);
      if (!tokenId) {
        return Response.json({ error: "Choose a moderator token." }, { status: 400 });
      }
      const revokedAt = new Date().toISOString();
      const result = await database
        .prepare(
          `UPDATE moderator_tokens
           SET revoked_at = ?, revoked_by_email = ?
           WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
        )
        .bind(revokedAt, email, tokenId)
        .run();
      if (Number(result.meta?.changes ?? 0) !== 1) {
        return Response.json(
          { error: "This token was already used, revoked, or does not exist." },
          { status: 409 },
        );
      }
      return Response.json({ ok: true });
    }

    if (body.action === "delete_moderator_token") {
      if (!isSuperadmin(email)) {
        return Response.json({ error: "Superadmin access required." }, { status: 403 });
      }
      const tokenId = cleanText(body.tokenId, 80);
      if (!tokenId) {
        return Response.json({ error: "Choose a moderator token." }, { status: 400 });
      }
      const result = await database
        .prepare(`DELETE FROM moderator_tokens WHERE id = ?`)
        .bind(tokenId)
        .run();
      if (Number(result.meta?.changes ?? 0) !== 1) {
        return Response.json({ error: "Moderator token not found." }, { status: 404 });
      }
      return Response.json({ ok: true });
    }

    if (body.action === "delete_moderator") {
      if (!isSuperadmin(email)) {
        return Response.json({ error: "Superadmin access required." }, { status: 403 });
      }
      const target = normalizeEmail(cleanText(body.email, 254));
      if (!target || isSuperadmin(target)) {
        return Response.json({ error: "The superadmin cannot be removed." }, { status: 400 });
      }
      await database.batch([
        database.prepare(`DELETE FROM tournament_moderators WHERE moderator_email = ?`).bind(target),
        database
          .prepare(`DELETE FROM moderator_tokens WHERE created_by_email = ? OR used_by_email = ?`)
          .bind(target, target),
        database.prepare(`DELETE FROM moderators WHERE email = ?`).bind(target),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "delete_account") {
      if (!isSuperadmin(email)) {
        return Response.json({ error: "Superadmin access required." }, { status: 403 });
      }
      const target = normalizeEmail(cleanText(body.email, 254));
      if (!target || isSuperadmin(target)) {
        return Response.json({ error: "The superadmin account cannot be deleted." }, { status: 400 });
      }
      await database.batch([
        database.prepare(`UPDATE players SET account_email = NULL WHERE account_email = ?`).bind(target),
        database.prepare(`DELETE FROM tournament_moderators WHERE moderator_email = ?`).bind(target),
        database
          .prepare(`DELETE FROM moderator_tokens WHERE created_by_email = ? OR used_by_email = ?`)
          .bind(target, target),
        database.prepare(`DELETE FROM moderators WHERE email = ?`).bind(target),
        database.prepare(`DELETE FROM auth_sessions WHERE email = ?`).bind(target),
        database.prepare(`DELETE FROM auth_credentials WHERE email = ?`).bind(target),
        database.prepare(`DELETE FROM user_accounts WHERE email = ?`).bind(target),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === "remove_tournament_moderator") {
      if (!isSuperadmin(email)) {
        return Response.json({ error: "Superadmin access required." }, { status: 403 });
      }
      const tournamentId = cleanText(body.tournamentId, 80);
      const target = normalizeEmail(cleanText(body.email, 254));
      await database
        .prepare(
          `DELETE FROM tournament_moderators
           WHERE tournament_id = ? AND moderator_email = ?`,
        )
        .bind(tournamentId, target)
        .run();
      return Response.json({ ok: true, tournamentId });
    }

    if (body.action === "create_tournament") {
      if (globalRole !== "superadmin") {
        return Response.json(
          { error: "Only the configured superadmin can create tournaments." },
          { status: 403 },
        );
      }
      const name = cleanText(body.name, 100);
      const city = cleanText(body.city, 80);
      const roundsCount = Math.max(3, Math.min(15, Number(body.rounds) || 5));
      if (name.length < 3) {
        return Response.json({ error: "Tournament name is too short." }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const joinCode = await uniqueJoinCode();
      const now = new Date().toISOString();
      const writes = [
        database
          .prepare(
            `INSERT INTO tournaments
               (id, owner_email, name, city, rounds, join_code,
                registration_open, current_round, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, 0, 'draft', ?)`,
          )
          .bind(id, email, name, city, roundsCount, joinCode, now),
      ];
      if (!isSuperadmin(email)) {
        writes.push(
          database
            .prepare(
              `INSERT INTO tournament_moderators
                 (id, tournament_id, moderator_email, assigned_by_email, created_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(crypto.randomUUID(), id, email, email, now),
        );
      }
      await database.batch(writes);
      return Response.json({ ok: true, tournamentId: id }, { status: 201 });
    }

    if (body.action === "create_test_tournament") {
      if (!isSuperadmin(email)) {
        return Response.json({ error: "Superadmin access required." }, { status: 403 });
      }
      const id = crypto.randomUUID();
      const joinCode = await uniqueJoinCode();
      const now = new Date().toISOString();
      const roster = createTestTournamentRoster().map((player) => ({
        ...player,
        id: crypto.randomUUID(),
      }));
      const generated = createSwissPairings(hydratePairingPlayers(roster, []), {
        expectedRounds: 6,
      });
      const roundId = crypto.randomUUID();
      await database.batch([
        database
          .prepare(
            `INSERT INTO tournaments
               (id, owner_email, name, city, rounds, join_code,
                registration_open, current_round, status, created_at)
             VALUES (?, ?, ?, ?, 6, ?, 0, 1, 'active', ?)`,
          )
          .bind(
            id,
            email,
            "2700chess Top 64 · Round 1 Test",
            TEST_TOURNAMENT_SOURCE,
            joinCode,
            now,
          ),
        ...roster.map((player) =>
          database
            .prepare(
              `INSERT INTO players
                 (id, tournament_id, name, fide_id, account_email,
                  rating, seed, withdrawn, checked_in, created_at)
               VALUES (?, ?, ?, ?, NULL, ?, ?, 0, 1, ?)`,
            )
            .bind(
              player.id,
              id,
              player.name,
              player.fideId,
              player.rating,
              player.seed,
              now,
            ),
        ),
        database
          .prepare(
            `INSERT INTO rounds (id, tournament_id, number, status, created_at)
             VALUES (?, ?, 1, 'active', ?)`,
          )
          .bind(roundId, id, now),
        ...pairingInsertStatements(database, id, roundId, 1, generated),
      ]);
      return Response.json({ ok: true, tournamentId: id }, { status: 201 });
    }

    if (body.action === "join_tournament") {
      const code = cleanText(body.joinCode, 12).toUpperCase();
      const directId = cleanText(body.tournamentId, 80);
      const tournament = directId
        ? await database
            .prepare(`SELECT ${TOURNAMENT_SELECT} FROM tournaments WHERE id = ?`)
            .bind(directId)
            .first<RawTournament>()
        : await database
            .prepare(`SELECT ${TOURNAMENT_SELECT} FROM tournaments WHERE UPPER(join_code) = ?`)
            .bind(code)
            .first<RawTournament>();
      if (!tournament) {
        return Response.json({ error: "Join code not found." }, { status: 404 });
      }
      if (!tournament.registrationOpen || Number(tournament.currentRound) > 0) {
        return Response.json({ error: "Registration is closed." }, { status: 409 });
      }
      const existing = await database
        .prepare(`SELECT id FROM players WHERE tournament_id = ? AND account_email = ?`)
        .bind(tournament.id, email)
        .first<{ id: string }>();
      if (existing) return Response.json({ ok: true, tournamentId: tournament.id });

      const name = cleanText(body.name, 100) || user.displayName;
      const fideId = cleanText(body.fideId, 24);
      const rating = Math.max(0, Math.min(4000, Number(body.rating) || 0));
      await database
        .prepare(
          `INSERT INTO players
             (id, tournament_id, name, fide_id, account_email,
              rating, seed, withdrawn, checked_in, created_at)
           VALUES (?, ?, ?, ?, ?, ?,
             (SELECT COALESCE(MAX(seed), 0) + 1 FROM players WHERE tournament_id = ?),
             0, 0, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tournament.id,
          name,
          fideId,
          email,
          rating,
          tournament.id,
          new Date().toISOString(),
        )
        .run();
      return Response.json({ ok: true, tournamentId: tournament.id }, { status: 201 });
    }

    const tournamentId = cleanText(body.tournamentId, 80);

    if (body.action === "leave_tournament") {
      const tournament = await database
        .prepare(`SELECT ${TOURNAMENT_SELECT} FROM tournaments WHERE id = ?`)
        .bind(tournamentId)
        .first<RawTournament>();
      if (!tournament) {
        return Response.json({ error: "Tournament not found." }, { status: 404 });
      }
      if (Number(tournament.currentRound) > 0) {
        return Response.json({ error: "You cannot leave after pairing has started." }, { status: 409 });
      }
      await database
        .prepare(`DELETE FROM players WHERE tournament_id = ? AND account_email = ?`)
        .bind(tournamentId, email)
        .run();
      return Response.json({ ok: true });
    }

    const tournament = await getTournamentForControl(tournamentId, email);
    if (!tournament) {
      return Response.json(
        { error: "You can only manage tournaments assigned to you." },
        { status: 403 },
      );
    }

    if (body.action === "delete_tournament") {
      if (!isSuperadmin(email)) {
        return Response.json(
          { error: "Only the configured superadmin can delete tournaments." },
          { status: 403 },
        );
      }
      await database.batch([
        database.prepare(`DELETE FROM moderator_tokens WHERE tournament_id = ?`).bind(tournamentId),
        database.prepare(`DELETE FROM tournament_moderators WHERE tournament_id = ?`).bind(tournamentId),
        database.prepare(`DELETE FROM player_round_statuses WHERE tournament_id = ?`).bind(tournamentId),
        database.prepare(`DELETE FROM pairings WHERE tournament_id = ?`).bind(tournamentId),
        database.prepare(`DELETE FROM rounds WHERE tournament_id = ?`).bind(tournamentId),
        database.prepare(`DELETE FROM players WHERE tournament_id = ?`).bind(tournamentId),
        database.prepare(`DELETE FROM tournaments WHERE id = ?`).bind(tournamentId),
      ]);
      return Response.json({ ok: true, deletedTournamentId: tournamentId });
    }

    if (body.action === "add_player") {
      if (Number(tournament.currentRound) > 0) {
        return Response.json(
          { error: "Delete the latest round before changing the roster." },
          { status: 409 },
        );
      }
      const name = cleanText(body.name, 100);
      const fideId = cleanText(body.fideId, 24);
      const rating = Math.max(0, Math.min(4000, Number(body.rating) || 0));
      if (name.length < 2) {
        return Response.json({ error: "Player name is too short." }, { status: 400 });
      }
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
          crypto.randomUUID(),
          tournamentId,
          name,
          fideId,
          rating,
          tournamentId,
          guestExpiryFrom(createdAt),
          createdAt.toISOString(),
        )
        .run();
      return Response.json({ ok: true, tournamentId }, { status: 201 });
    }

    if (body.action === "remove_player") {
      if (Number(tournament.currentRound) > 0) {
        return Response.json(
          { error: "Delete the latest round or withdraw this player instead." },
          { status: 409 },
        );
      }
      const playerId = cleanText(body.playerId, 80);
      await database
        .prepare(`DELETE FROM players WHERE id = ? AND tournament_id = ?`)
        .bind(playerId, tournamentId)
        .run();
      return Response.json({ ok: true, tournamentId });
    }

    if (body.action === "set_player_checked_in") {
      if (Number(tournament.currentRound) > 0) {
        return Response.json({ error: "Check-in is closed after round one." }, { status: 409 });
      }
      const playerId = cleanText(body.playerId, 80);
      const result = await database
        .prepare(
          `UPDATE players SET checked_in = ?
           WHERE id = ? AND tournament_id = ? AND withdrawn = 0`,
        )
        .bind(body.checkedIn ? 1 : 0, playerId, tournamentId)
        .run();
      if (Number(result.meta?.changes ?? 0) !== 1) {
        return Response.json({ error: "Active player not found." }, { status: 404 });
      }
      return Response.json({ ok: true, tournamentId });
    }

    if (body.action === "set_player_withdrawn") {
      const playerId = cleanText(body.playerId, 80);
      const existing = await database
        .prepare(`SELECT id FROM players WHERE id = ? AND tournament_id = ?`)
        .bind(playerId, tournamentId)
        .first<{ id: string }>();
      if (!existing) {
        return Response.json({ error: "Player not found." }, { status: 404 });
      }
      const updatePlayer = database
        .prepare(
          `UPDATE players SET withdrawn = ?, checked_in = 0
           WHERE id = ? AND tournament_id = ?`,
        )
        .bind(body.withdrawn ? 1 : 0, playerId, tournamentId);
      if (body.withdrawn) {
        await database.batch([
          updatePlayer,
          database
            .prepare(
              `DELETE FROM player_round_statuses
               WHERE tournament_id = ? AND player_id = ? AND round_number > ?`,
            )
            .bind(tournamentId, playerId, Number(tournament.currentRound)),
        ]);
      } else {
        await updatePlayer.run();
      }
      return Response.json({ ok: true, tournamentId });
    }

    if (body.action === "set_player_next_round_status") {
      if (Number(tournament.currentRound) >= Number(tournament.rounds)) {
        return Response.json({ error: "The tournament has no remaining round." }, { status: 409 });
      }
      const playerId = cleanText(body.playerId, 80);
      const status = body.status;
      if (!status || !["active", "skip", "bye"].includes(status)) {
        return Response.json({ error: "Invalid next-round status." }, { status: 400 });
      }
      const existing = await database
        .prepare(`SELECT id, withdrawn FROM players WHERE id = ? AND tournament_id = ?`)
        .bind(playerId, tournamentId)
        .first<{ id: string; withdrawn: number | boolean }>();
      if (!existing) {
        return Response.json({ error: "Player not found." }, { status: 404 });
      }
      if (Boolean(existing.withdrawn) && status !== "active") {
        return Response.json(
          { error: "Reactivate the player before setting a one-round status." },
          { status: 409 },
        );
      }
      const roundNumber = Number(tournament.currentRound) + 1;
      const removeExisting = database
        .prepare(
          `DELETE FROM player_round_statuses
           WHERE tournament_id = ? AND player_id = ? AND round_number = ?`,
        )
        .bind(tournamentId, playerId, roundNumber);
      if (status === "active") {
        await removeExisting.run();
      } else {
        await database.batch([
          removeExisting,
          database
            .prepare(
              `INSERT INTO player_round_statuses
                 (id, tournament_id, player_id, round_number, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              tournamentId,
              playerId,
              roundNumber,
              status,
              new Date().toISOString(),
            ),
        ]);
      }
      return Response.json({ ok: true, tournamentId });
    }

    if (body.action === "toggle_registration") {
      if (Number(tournament.currentRound) > 0) {
        return Response.json({ error: "Pairing has already started." }, { status: 409 });
      }
      await database
        .prepare(`UPDATE tournaments SET registration_open = ? WHERE id = ?`)
        .bind(body.open ? 1 : 0, tournamentId)
        .run();
      return Response.json({ ok: true, tournamentId });
    }

    if (body.action === "delete_round") {
      const roundNumber = Number(tournament.currentRound);
      if (roundNumber < 1) {
        return Response.json({ error: "There is no round to delete." }, { status: 409 });
      }
      const round = await database
        .prepare(`SELECT id FROM rounds WHERE tournament_id = ? AND number = ?`)
        .bind(tournamentId, roundNumber)
        .first<{ id: string }>();
      if (!round) {
        return Response.json({ error: "Latest round not found." }, { status: 404 });
      }
      const previousRound = roundNumber - 1;
      await database.batch([
        database.prepare(`DELETE FROM pairings WHERE round_id = ?`).bind(round.id),
        database.prepare(`DELETE FROM rounds WHERE id = ?`).bind(round.id),
        database
          .prepare(`UPDATE tournaments SET current_round = ?, status = ? WHERE id = ?`)
          .bind(previousRound, previousRound === 0 ? "draft" : "between_rounds", tournamentId),
      ]);
      return Response.json({ ok: true, tournamentId, deletedRoundNumber: roundNumber });
    }

    if (body.action === "generate_round") {
      if (Number(tournament.currentRound) >= Number(tournament.rounds)) {
        return Response.json({ error: "All scheduled rounds are complete." }, { status: 409 });
      }
      const unresolved = await database
        .prepare(`SELECT COUNT(*) AS count FROM pairings WHERE tournament_id = ? AND result = '*'`)
        .bind(tournamentId)
        .first<{ count: number }>();
      if (Number(unresolved?.count ?? 0) > 0) {
        return Response.json(
          { error: "Record every result before pairing the next round." },
          { status: 409 },
        );
      }
      if (Number(tournament.currentRound) === 0) {
        const missingCheckIn = await database
          .prepare(
            `SELECT COUNT(*) AS count FROM players
             WHERE tournament_id = ? AND withdrawn = 0 AND checked_in = 0`,
          )
          .bind(tournamentId)
          .first<{ count: number }>();
        if (Number(missingCheckIn?.count ?? 0) > 0) {
          return Response.json(
            { error: `${Number(missingCheckIn?.count)} active player(s) still need check-in.` },
            { status: 409 },
          );
        }
      }

      const roundNumber = Number(tournament.currentRound) + 1;
      const [playerRows, historyRows, statusRows] = await Promise.all([
        database
          .prepare(
            `SELECT id, name, rating, seed, withdrawn
             FROM players WHERE tournament_id = ? ORDER BY seed ASC`,
          )
          .bind(tournamentId)
          .all<{
            id: string;
            name: string;
            rating: number;
            seed: number;
            withdrawn: number;
          }>(),
        database
          .prepare(
            `SELECT round_number AS roundNumber, white_player_id AS whitePlayerId,
                    black_player_id AS blackPlayerId, result
             FROM pairings WHERE tournament_id = ?
             ORDER BY round_number ASC, board_number ASC`,
          )
          .bind(tournamentId)
          .all<{
            roundNumber: number;
            whitePlayerId: string | null;
            blackPlayerId: string | null;
            result: ResultCode;
          }>(),
        database
          .prepare(
            `SELECT player_id AS playerId, status FROM player_round_statuses
             WHERE tournament_id = ? AND round_number = ?`,
          )
          .bind(tournamentId, roundNumber)
          .all<{ playerId: string; status: "skip" | "bye" }>(),
      ]);
      const allPlayers = (playerRows.results ?? []) as Array<{
        id: string;
        name: string;
        rating: number;
        seed: number;
        withdrawn: number;
      }>;
      const activePlayers = allPlayers.filter((player) => !player.withdrawn);
      if (activePlayers.length < 2) {
        return Response.json(
          { error: "Add at least two active players before generating a round." },
          { status: 409 },
        );
      }
      const statuses = new Map(
        ((statusRows.results ?? []) as Array<{
          playerId: string;
          status: "skip" | "bye";
        }>).map((row) => [row.playerId, row.status]),
      );
      const playersToPair = activePlayers.filter((player) => !statuses.has(player.id));
      const manualByePlayers = activePlayers.filter((player) => statuses.get(player.id) === "bye");
      const playersToPairIds = new Set(playersToPair.map((player) => player.id));
      const generated = playersToPair.length
        ? createSwissPairings(
            hydratePairingPlayers(allPlayers, historyRows.results ?? []).filter((player) =>
              playersToPairIds.has(player.id),
            ),
            { expectedRounds: Number(tournament.rounds) },
          )
        : [];
      generated.push(
        ...manualByePlayers.map((player) => ({
          whitePlayerId: player.id,
          blackPlayerId: null,
          result: "1-BYE" as const,
        })),
      );
      const roundId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await database.batch([
        database
          .prepare(
            `INSERT INTO rounds (id, tournament_id, number, status, created_at)
             VALUES (?, ?, ?, 'active', ?)`,
          )
          .bind(roundId, tournamentId, roundNumber, createdAt),
        ...pairingInsertStatements(
          database,
          tournamentId,
          roundId,
          roundNumber,
          generated,
        ),
        database
          .prepare(
            `UPDATE tournaments
             SET current_round = ?, status = 'active', registration_open = 0
             WHERE id = ?`,
          )
          .bind(roundNumber, tournamentId),
        ...(roundNumber === 1
          ? [
              database
                .prepare(
                  `UPDATE players SET guest_expires_at = NULL
                   WHERE tournament_id = ? AND guest_expires_at IS NOT NULL`,
                )
                .bind(tournamentId),
            ]
          : []),
      ]);
      return Response.json({ ok: true, tournamentId, roundNumber });
    }

    if (body.action === "set_result") {
      const pairingId = cleanText(body.pairingId, 80);
      if (!isEnterableResult(body.result)) {
        return Response.json(
          { error: "Choose 1-0, 0-1 or a draw." },
          { status: 400 },
        );
      }
      const pairing = await database
        .prepare(
          `SELECT id, round_id AS roundId, round_number AS roundNumber,
                  black_player_id AS blackPlayerId
           FROM pairings WHERE id = ? AND tournament_id = ?`,
        )
        .bind(pairingId, tournamentId)
        .first<{
          id: string;
          roundId: string;
          roundNumber: number;
          blackPlayerId: string | null;
        }>();
      if (
        !pairing ||
        Number(pairing.roundNumber) !== Number(tournament.currentRound) ||
        !pairing.blackPlayerId
      ) {
        return Response.json(
          { error: "Results can only be changed on a played board in the current round." },
          { status: 409 },
        );
      }
      await database.prepare(`UPDATE pairings SET result = ? WHERE id = ?`).bind(body.result, pairingId).run();
      const unresolved = await database
        .prepare(`SELECT COUNT(*) AS count FROM pairings WHERE round_id = ? AND result = '*'`)
        .bind(pairing.roundId)
        .first<{ count: number }>();
      const roundComplete = Number(unresolved?.count ?? 0) === 0;
      const tournamentStatus = roundComplete
        ? pairing.roundNumber >= Number(tournament.rounds)
          ? "completed"
          : "between_rounds"
        : "active";
      if (roundComplete) {
        await database.batch([
          database
            .prepare(`UPDATE rounds SET status = 'completed' WHERE id = ?`)
            .bind(pairing.roundId),
          database
            .prepare(`UPDATE tournaments SET status = ? WHERE id = ?`)
            .bind(tournamentStatus, tournamentId),
        ]);
      }
      return Response.json({ ok: true, tournamentId });
    }

    return Response.json({ error: "Unsupported action." }, { status: 400 });
  } catch {
    return Response.json(
      { error: "The request could not be completed right now." },
      { status: 500 },
    );
  }
}
