import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function applyMigration(database, sql) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const files = (await readdir(path.join(root, "drizzle")))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) applyMigration(database, await source(`drizzle/${file}`));
  return database;
}

test("permission policy keeps organizer delegation local and global administration restricted", async () => {
  const {
    canCreateOfficialTournament,
    canGrantGlobalModerator,
    canRemoveTournamentModerator,
    creationVisibility,
  } = await vite.ssrLoadModule("/lib/tournament-access.ts");
  const route = await source("app/api/manager/route.ts");

  assert.equal(canCreateOfficialTournament("superadmin"), true);
  assert.equal(canCreateOfficialTournament("moderator"), true);
  assert.equal(canCreateOfficialTournament("organizer"), false);
  assert.equal(canGrantGlobalModerator("organizer"), false);
  assert.equal(canGrantGlobalModerator("moderator"), false);
  assert.equal(
    canRemoveTournamentModerator({ role: "organizer", ownsTournament: true }),
    false,
  );
  assert.equal(
    canRemoveTournamentModerator({ role: "organizer", ownsTournament: false }),
    false,
  );
  assert.equal(creationVisibility("organizer", "official"), "community");
  assert.match(route, /t\.owner_email = \? OR tm\.id IS NOT NULL/);
  assert.match(route, /if \(!isSuperadmin\(email\)\)[\s\S]*Superadmin access required/);
  assert.match(route, /if \(!isSuperadmin\(email\)\)[\s\S]*Superadmin access required/);
  assert.match(route, /moderator_token_targets/);
});

test("withdrawal persists its starting round without deleting historical pairings", async () => {
  const database = await migratedDatabase();
  database.exec(`
    INSERT INTO user_accounts VALUES ('owner@example.com', 'Owner', '2026-09-03', '2026-09-03');
    INSERT INTO tournaments
      (id, owner_email, name, city, rounds, join_code, registration_open,
       visibility, current_round, status, created_at)
    VALUES ('t1', 'owner@example.com', 'Test', '', 5, 'ABC123', 0,
            'community', 1, 'between_rounds', '2026-09-03');
    INSERT INTO players
      (id, tournament_id, name, fide_id, account_email, rating, seed,
       withdrawn, checked_in, guest_expires_at, created_at)
    VALUES
      ('p1', 't1', 'Player One', '', NULL, 1800, 1, 0, 1, NULL, '2026-09-03'),
      ('p2', 't1', 'Player Two', '', NULL, 1700, 2, 0, 1, NULL, '2026-09-03');
    INSERT INTO rounds VALUES ('r1', 't1', 1, 'completed', '2026-09-03');
    INSERT INTO pairings
      (id, tournament_id, round_id, round_number, board_number,
       white_player_id, black_player_id, result)
    VALUES ('g1', 't1', 'r1', 1, 1, 'p1', 'p2', '1-0');
  `);

  database
    .prepare(
      `UPDATE players
       SET withdrawn = 1, checked_in = 0,
           withdrawn_from_round = COALESCE(withdrawn_from_round, ?)
       WHERE id = ? AND tournament_id = ?`,
    )
    .run(2, "p1", "t1");

  assert.deepEqual(
    { ...database.prepare("SELECT withdrawn, withdrawn_from_round AS fromRound FROM players WHERE id = 'p1'").get() },
    { withdrawn: 1, fromRound: 2 },
  );
  assert.equal(database.prepare("SELECT result FROM pairings WHERE id = 'g1'").get().result, "1-0");

  const route = await source("app/api/manager/route.ts");
  const withdrawalBlock = route.slice(
    route.indexOf('body.action === "self_withdraw"'),
    route.indexOf("if (!user || !email)"),
  );
  assert.doesNotMatch(withdrawalBlock, /DELETE FROM pairings/);
  assert.match(route, /activePlayers = allPlayers\.filter\(\(player\) => !player\.withdrawn\)/);
  assert.match(route, /body\.withdrawn \? Number\(tournament\.currentRound\) \+ 1 : null/);
});

test("accountless registration and visibility edge cases are explicitly guarded", async () => {
  const route = await source("app/api/manager/route.ts");
  const joinStart = route.indexOf('body.action === "join_tournament"');
  const joinEnd = route.indexOf('body.action === "self_withdraw"');
  const join = route.slice(joinStart, joinEnd);

  assert.ok(joinStart > 0 && joinEnd > joinStart);
  assert.match(join, /code\.length !== 6/);
  assert.match(join, /Join code not found/);
  assert.match(join, /tournament\.archivedAt/);
  assert.match(join, /!tournament\.registrationOpen/);
  assert.match(join, /Number\(tournament\.currentRound\) > 0/);
  assert.match(join, /if \(existing\)[\s\S]*playerId: existing\.id/);
  assert.match(join, /guest_expires_at, created_at\)[\s\S]*0, 0, NULL/);
  assert.match(join, /INSERT INTO player_sessions/);
  assert.doesNotMatch(join, /visibility\s*[!=]=?\s*["']private/);
  assert.ok(joinStart < route.indexOf("if (!user || !email)"));
});

test("crosstable stays in standings order and updates from the same pairing snapshot", async () => {
  const { createCrosstableRows } = await vite.ssrLoadModule("/lib/crosstable.ts");
  const { calculateStandings } = await vite.ssrLoadModule("/lib/standings.ts");
  const players = Array.from({ length: 4 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    fideId: "",
    rating: 2000 - index * 50,
    seed: index + 1,
    withdrawn: index === 3,
    withdrawnFromRound: index === 3 ? 2 : null,
    checkedIn: true,
    nextRoundStatus: "active",
    isYou: false,
  }));
  const pairings = [
    { id: "g1", roundNumber: 1, boardNumber: 1, whitePlayerId: "p1", blackPlayerId: "p2", result: "*", whiteName: "Player 1", blackName: "Player 2" },
    { id: "g2", roundNumber: 1, boardNumber: 2, whitePlayerId: "p3", blackPlayerId: null, result: "1-BYE", whiteName: "Player 3", blackName: null },
  ];
  const initialStandings = calculateStandings(players, pairings);
  const initialRows = createCrosstableRows(players, pairings, initialStandings, [], 15);
  assert.deepEqual(
    initialRows.map((row) => row.standing.playerId),
    initialStandings.map((standing) => standing.playerId),
  );
  assert.equal(initialRows.every((row) => row.rounds.length === 15), true);
  assert.equal(initialRows.find((row) => row.player.id === "p3").rounds[0].label, "BYE");

  const completedPairings = pairings.map((pairing) =>
    pairing.id === "g1" ? { ...pairing, result: "0-1" } : pairing,
  );
  const updatedStandings = calculateStandings(players, completedPairings);
  const updatedRows = createCrosstableRows(players, completedPairings, updatedStandings, [], 15);
  assert.equal(updatedRows.find((row) => row.player.id === "p1").rounds[0].label, "2W 0");
  assert.equal(updatedRows.find((row) => row.player.id === "p2").rounds[0].label, "1B 1");
  assert.equal(updatedRows.find((row) => row.player.id === "p4").rounds[1].label, "WD");
});

test("existing free tournament features and deferred rating scope remain intact", async () => {
  const [route, readme, packageJson, ui, css] = await Promise.all([
    source("app/api/manager/route.ts"),
    source("README.md"),
    source("package.json"),
    source("app/tournament-manager.tsx"),
    source("app/globals.css"),
  ]);

  for (const feature of [
    "toggle_registration",
    "set_player_checked_in",
    "set_player_withdrawn",
    "set_player_next_round_status",
    "generate_round",
    "delete_round",
    "set_result",
    "create_moderator_token",
  ]) {
    assert.match(route, new RegExp(feature));
  }
  assert.match(readme, /Pairing a small chess tournament should be free/);
  assert.match(readme, /I protest anyone who charges/);
  assert.doesNotMatch(`${packageJson}\n${route}`, /stripe|subscription|checkout|paywall/i);
  assert.doesNotMatch(route, /rating_history|rating_change|freak_rating/i);
  assert.match(ui, /TabsTrigger value="standings"/);
  assert.match(ui, /TabsTrigger value="crosstable"/);
  assert.match(ui, /Print \/ Save PDF/);
  assert.match(css, /\.crosstable-scroll/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media print/);
});
