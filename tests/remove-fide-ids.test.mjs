import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("removing FIDE IDs preserves players, results, sessions, and capacity enforcement", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const directory = new URL("../drizzle/", import.meta.url);
    const migration = "0013_remove_fide_ids.sql";
    for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql") && name < migration).sort()) {
      database.exec(await readFile(new URL(file, directory), "utf8"));
    }
    database.exec(`
      INSERT INTO tournaments (id, owner_email, name, rounds, player_limit, created_at)
      VALUES ('t1', 'owner@example.test', 'Existing event', 5, 2, '2026-09-10');
      INSERT INTO players (id, tournament_id, name, fide_id, rating, seed, created_at)
      VALUES ('p1', 't1', 'Alice', '101', 1800, 1, '2026-09-10'),
             ('p2', 't1', 'Bob', '102', 1700, 2, '2026-09-10');
      INSERT INTO rounds (id, tournament_id, number, created_at)
      VALUES ('r1', 't1', 1, '2026-09-10');
      INSERT INTO pairings (id, tournament_id, round_id, round_number, board_number, white_player_id, black_player_id, result)
      VALUES ('g1', 't1', 'r1', 1, 1, 'p1', 'p2', '1-0');
      INSERT INTO player_sessions (id, token_hash, tournament_id, player_id, expires_at, created_at)
      VALUES ('s1', 'hash', 't1', 'p1', '2027-09-10', '2026-09-10');
    `);
    const playersBefore = database.prepare("SELECT * FROM players ORDER BY seed").all()
      .map((row) => {
        const player = { ...row };
        delete player.fide_id;
        return player;
      });
    const pairingsBefore = database.prepare("SELECT * FROM pairings").all();
    const sessionsBefore = database.prepare("SELECT * FROM player_sessions").all();

    database.exec(await readFile(new URL(migration, directory), "utf8"));

    assert.deepEqual(database.prepare("SELECT * FROM players ORDER BY seed").all().map((player) => ({ ...player })), playersBefore);
    assert.deepEqual(database.prepare("SELECT * FROM pairings").all(), pairingsBefore);
    assert.deepEqual(database.prepare("SELECT * FROM player_sessions").all(), sessionsBefore);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare("PRAGMA table_info(players)").all().some((column) => column.name === "fide_id"), false);
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'players_fide_%'").all().length, 0);
    assert.throws(() => database.exec(`
      INSERT INTO players (id, tournament_id, name, rating, seed, created_at)
      VALUES ('p3', 't1', 'Charlie', 1600, 3, '2026-09-10')
    `), /roster_capacity_exceeded/);
  } finally {
    database.close();
  }
});
