import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("ordinary organizers cannot classify their tournaments as official", async () => {
  const { creationVisibility, editableVisibility } = await vite.ssrLoadModule(
    "/lib/tournament-access.ts",
  );

  assert.equal(creationVisibility("organizer", "official"), "community");
  assert.equal(creationVisibility("organizer", "private"), "private");
  assert.equal(creationVisibility("moderator", undefined), "official");
  assert.equal(creationVisibility("superadmin", "official"), "official");
  assert.equal(
    editableVisibility({
      current: "private",
      requested: "official",
      role: "organizer",
      ownsTournament: true,
    }),
    "community",
  );
  assert.equal(
    editableVisibility({
      current: "community",
      requested: "private",
      role: "moderator",
      ownsTournament: false,
    }),
    "community",
  );
});

test("player session tokens are strong, bounded, and one-way", async () => {
  const {
    createPlayerSessionToken,
    hashPlayerSessionToken,
    isValidPlayerSessionToken,
    playerSessionCookie,
  } = await vite.ssrLoadModule("/lib/player-session.ts");

  const token = createPlayerSessionToken();
  assert.equal(isValidPlayerSessionToken(token), true);
  assert.equal(isValidPlayerSessionToken(`${token}x`), false);
  assert.equal((await hashPlayerSessionToken(token)).length, 64);
  assert.match(playerSessionCookie(token, true), /HttpOnly/);
  assert.match(playerSessionCookie(token, true), /SameSite=Strict/);
  assert.match(playerSessionCookie(token, true), /Secure/);
});

test("migration preserves tournaments and adds ownership-session fields", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (let index = 0; index <= 7; index += 1) {
    const filename = (await import("node:fs/promises"))
      .readdir(path.join(root, "drizzle"))
      .then((files) => files.find((file) => file.startsWith(`${String(index).padStart(4, "0")}_`)));
    const resolved = await filename;
    assert.ok(resolved, `migration ${index} exists`);
    applyMigration(database, await source(`drizzle/${resolved}`));
  }

  database
    .prepare(
      `INSERT INTO user_accounts (email, display_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run("owner@example.com", "Owner", "2026-09-03", "2026-09-03");
  database
    .prepare(
      `INSERT INTO auth_credentials
       (email, password_hash, password_salt, password_iterations,
        failed_attempts, locked_until, created_at, updated_at)
       VALUES (?, ?, ?, 100000, 0, NULL, ?, ?)`,
    )
    .run("owner@example.com", "hash", "salt", "2026-09-03", "2026-09-03");
  database
    .prepare(
      `INSERT INTO tournaments
       (id, owner_email, name, city, rounds, join_code, registration_open,
        current_round, status, created_at)
       VALUES ('t1', 'owner@example.com', 'Existing event', '', 5, 'ABC123', 1, 0, 'draft', '2026-09-03')`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO players
       (id, tournament_id, name, account_email, rating, seed,
        withdrawn, checked_in, guest_expires_at, created_at)
       VALUES ('p1', 't1', 'Player One', NULL, 1500, 1, 0, 0, NULL, '2026-09-03')`,
    )
    .run();

  applyMigration(database, await source("drizzle/0008_odd_lord_tyger.sql"));
  database.exec(`INSERT INTO guest_tokens
    (id, player_id, tournament_id, token_hash, expires_at, created_at)
    VALUES ('legacy-token', 'p1', 't1', 'legacy-hash', '2027-09-03', '2026-09-03')`);
  applyMigration(database, await source("drizzle/0009_tiresome_demogoblin.sql"));
  assert.equal(database.prepare("SELECT token_hash FROM guest_tokens WHERE id = 'legacy-token'").get().token_hash, 'legacy-hash');

  const tournament = database
    .prepare("SELECT name, visibility, archived_at AS archivedAt FROM tournaments WHERE id = 't1'")
    .get();
  assert.deepEqual({ ...tournament }, {
    name: "Existing event",
    visibility: "official",
    archivedAt: null,
  });
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM auth_credentials").get().count,
    1,
  );
  database
    .prepare(
      `INSERT INTO player_sessions
       (id, token_hash, tournament_id, player_id, expires_at, created_at)
       VALUES ('s1', 'token-hash', 't1', 'p1', '2027-09-03', '2026-09-03')`,
    )
    .run();
  assert.equal(database.prepare("SELECT player_id FROM player_sessions").get().player_id, "p1");
  assert.equal(
    database.prepare("SELECT withdrawn_from_round FROM players WHERE id = 'p1'").get()
      .withdrawn_from_round,
    null,
  );
});

test("manager API enforces accountless join, self-withdrawal, ownership, and listing boundaries", async () => {
  const route = await source("app/api/manager/route.ts");
  const joinIndex = route.indexOf('body.action === "join_tournament"');
  const authGuardIndex = route.indexOf("if (!user || !email)");

  assert.ok(joinIndex > 0 && joinIndex < authGuardIndex);
  assert.match(route, /action: "self_withdraw"/);
  assert.match(route, /SET withdrawn = 1, checked_in = 0,[\s\S]*withdrawn_from_round/);
  assert.doesNotMatch(
    route.slice(route.indexOf('body.action === "self_withdraw"'), authGuardIndex),
    /DELETE FROM pairings/,
  );
  assert.match(route, /t\.owner_email = \? OR tm\.id IS NOT NULL/);
  assert.match(route, /t\.visibility = 'official'/);
  assert.match(route, /t\.visibility = 'community'/);
  assert.doesNotMatch(route, /WHERE t\.visibility = 'private'/);
  assert.match(route, /guest_expires_at, created_at\)[\s\S]*NULL, \?\)/);
});

test("production deploy applies and verifies migrations before publishing", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  assert.match(packageJson.scripts.deploy, /^npm run db:migrate:remote/);
  assert.match(packageJson.scripts.deploy, /npm run db:verify:remote/);
  assert.match(packageJson.scripts.deploy, /vinext deploy --skip-build$/);
  assert.match(packageJson.scripts["db:verify:remote"], /auth_credentials/);
  assert.match(packageJson.scripts["db:verify:remote"], /player_sessions/);
});
