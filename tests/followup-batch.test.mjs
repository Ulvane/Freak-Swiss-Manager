import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
for (const file of (await readdir(`${root}/drizzle`)).filter((name) => name.endsWith(".sql")).sort()) {
  database.exec(await readFile(`${root}/drizzle/${file}`, "utf8"));
}

function prepare(sql, args = []) {
  return {
    bind: (...values) => prepare(sql, values),
    first: async () => database.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: database.prepare(sql).all(...args), success: true }),
    run: async () => ({ success: true, meta: database.prepare(sql).run(...args) }),
  };
}

globalThis.__freakFollowupDatabase = {
  prepare,
  async batch(statements) {
    database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      database.exec("COMMIT");
      return results;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  },
};
globalThis.__freakFollowupCookies = new Map();

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root, "next/headers": "/__followup_headers__.ts" } },
  server: { middlewareMode: true, hmr: false },
  plugins: [
    {
      name: "followup-route-runtime",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__followup_headers__.ts") return "\0followup-headers";
      },
      load(id) {
        if (id === "\0followup-headers") {
          return "export async function cookies() { return {get: name => {const value = globalThis.__freakFollowupCookies.get(name); return value ? {value} : undefined;}}; }";
        }
        if (id === `${root}db/raw.ts` || id === `${root}/db/raw.ts`) {
          return "export function getDatabase() { return globalThis.__freakFollowupDatabase; }";
        }
      },
    },
  ],
});

after(async () => {
  await vite.close();
  database.close();
  delete globalThis.__freakFollowupDatabase;
  delete globalThis.__freakFollowupCookies;
});

const register = await vite.ssrLoadModule("/app/api/auth/register/route.ts");
const manager = await vite.ssrLoadModule("/app/api/manager/route.ts");
const legacyJoin = await vite.ssrLoadModule("/app/api/guest/join-tournament/route.ts");

async function post(route, body, cookie = "") {
  globalThis.__freakFollowupCookies = new Map(
    cookie
      .split(";")
      .filter(Boolean)
      .map((part) => part.trim().split("=")),
  );
  const response = await route.POST(
    new Request("https://test.invalid/api/manager", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    data: await response.json(),
  };
}

async function account(label) {
  const email = `${label}@example.test`;
  const response = await post(register, {
    displayName: label,
    email,
    password: `${label}-test-password`,
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return { email, cookie: response.cookie };
}

async function tournament(ownerCookie, name) {
  const response = await post(
    manager,
    { action: "create_tournament", name, rounds: 5, visibility: "community" },
    ownerCookie,
  );
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return database.prepare("SELECT * FROM tournaments WHERE id = ?").get(response.data.tournamentId);
}

test("owner-issued moderator tokens are single-use and remain tournament-scoped", async () => {
  const owner = await account("token-owner");
  const moderator = await account("token-moderator");
  const stranger = await account("token-stranger");
  const controlled = await tournament(owner.cookie, "Controlled event");
  const unrelated = await tournament(owner.cookie, "Unrelated event");

  const issued = await post(
    manager,
    { action: "create_moderator_token", tournamentId: controlled.id },
    owner.cookie,
  );
  assert.equal(issued.status, 200, JSON.stringify(issued.data));
  assert.match(issued.data.moderatorToken, /^MOD-/);

  const redeemed = await post(
    manager,
    { action: "redeem_moderator_token", token: issued.data.moderatorToken },
    moderator.cookie,
  );
  assert.equal(redeemed.status, 200, JSON.stringify(redeemed.data));
  assert.deepEqual(
    { ...database.prepare(
      "SELECT moderator_email AS moderatorEmail, assigned_by_email AS assignedByEmail FROM tournament_moderators WHERE tournament_id = ?",
    ).get(controlled.id) },
    { moderatorEmail: moderator.email, assignedByEmail: owner.email },
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM moderators WHERE email = ?").get(moderator.email).count, 0);

  const reused = await post(
    manager,
    { action: "redeem_moderator_token", token: issued.data.moderatorToken },
    stranger.cookie,
  );
  assert.equal(reused.status, 409);
  assert.equal(
    (await post(manager, {
      action: "update_tournament",
      tournamentId: controlled.id,
      name: "Controlled event updated",
      rounds: 5,
      visibility: "official",
    }, moderator.cookie)).status,
    200,
  );
  assert.equal(
    (await post(manager, {
      action: "export_tournament",
      tournamentId: controlled.id,
    }, moderator.cookie)).status,
    200,
  );
  assert.equal(
    (await post(manager, {
      action: "update_tournament",
      tournamentId: unrelated.id,
      name: "Forbidden update",
      rounds: 5,
    }, moderator.cookie)).status,
    403,
  );
  assert.equal(
    (await post(manager, {
      action: "remove_tournament_moderator",
      tournamentId: controlled.id,
      email: moderator.email,
    }, owner.cookie)).status,
    200,
  );
});

test("all registration paths reject duplicate FIDE IDs while allowing real name collisions", async () => {
  const owner = await account("duplicate-owner");
  const event = await tournament(owner.cookie, "Duplicate rules event");
  const first = await post(manager, {
    action: "join_tournament",
    joinCode: event.join_code,
    name: "Alex Example",
    fideId: " 12345678 ",
    rating: 1800,
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));

  assert.equal((await post(manager, {
    action: "join_tournament",
    joinCode: event.join_code,
    name: "Different Name",
    fideId: "12345678",
    rating: 1700,
  })).status, 409);
  assert.equal((await post(legacyJoin, {
    joinCode: event.join_code,
    name: "Legacy Duplicate",
    fideId: "12345678",
    rating: 1600,
  })).status, 409);
  assert.equal((await post(manager, {
    action: "add_player",
    tournamentId: event.id,
    name: "Staff Duplicate",
    fideId: "12345678",
    rating: 1500,
  }, owner.cookie)).status, 409);

  const sameName = await post(manager, {
    action: "join_tournament",
    joinCode: event.join_code,
    name: "Alex Example",
    rating: 1500,
  });
  assert.equal(sameName.status, 201, JSON.stringify(sameName.data));
});

test("late entrants join between rounds and latest-round correction preserves earlier history", async () => {
  const owner = await account("late-owner");
  const event = await tournament(owner.cookie, "Late entry event");
  for (let index = 1; index <= 4; index += 1) {
    const added = await post(manager, {
      action: "add_player",
      tournamentId: event.id,
      name: `Starter ${index}`,
      fideId: `START-${index}`,
      rating: 2100 - index * 50,
    }, owner.cookie);
    assert.equal(added.status, 201, JSON.stringify(added.data));
  }
  for (const player of database.prepare("SELECT id FROM players WHERE tournament_id = ?").all(event.id)) {
    assert.equal((await post(manager, {
      action: "set_player_checked_in",
      tournamentId: event.id,
      playerId: player.id,
      checkedIn: true,
    }, owner.cookie)).status, 200);
  }
  assert.equal((await post(manager, {
    action: "generate_round",
    tournamentId: event.id,
  }, owner.cookie)).status, 200);
  assert.equal((await post(manager, {
    action: "add_player",
    tournamentId: event.id,
    name: "Too Early",
  }, owner.cookie)).status, 409);

  for (const pairing of database.prepare(
    "SELECT id FROM pairings WHERE tournament_id = ? AND round_number = 1 AND black_player_id IS NOT NULL",
  ).all(event.id)) {
    assert.equal((await post(manager, {
      action: "set_result",
      tournamentId: event.id,
      pairingId: pairing.id,
      result: "1-0",
    }, owner.cookie)).status, 200);
  }
  assert.equal(database.prepare("SELECT status FROM tournaments WHERE id = ?").get(event.id).status, "between_rounds");

  const late = await post(manager, {
    action: "add_player",
    tournamentId: event.id,
    name: "Late Entrant",
    fideId: "LATE-1",
    rating: 1750,
  }, owner.cookie);
  assert.equal(late.status, 201, JSON.stringify(late.data));
  const latePlayer = database.prepare(
    "SELECT id, checked_in AS checkedIn, guest_expires_at AS guestExpiresAt FROM players WHERE tournament_id = ? AND fide_id = 'LATE-1'",
  ).get(event.id);
  assert.deepEqual({ ...latePlayer, checkedIn: Number(latePlayer.checkedIn) }, {
    id: latePlayer.id,
    checkedIn: 1,
    guestExpiresAt: null,
  });

  assert.equal((await post(manager, {
    action: "generate_round",
    tournamentId: event.id,
  }, owner.cookie)).status, 200);
  const lateAppearances = database.prepare(
    `SELECT COUNT(*) AS count FROM pairings
     WHERE tournament_id = ? AND round_number = 2
       AND (white_player_id = ? OR black_player_id = ?)`,
  ).get(event.id, latePlayer.id, latePlayer.id).count;
  assert.equal(lateAppearances, 1);

  assert.equal((await post(manager, {
    action: "delete_round",
    tournamentId: event.id,
  }, owner.cookie)).status, 200);
  assert.equal(database.prepare(
    "SELECT COUNT(*) AS count FROM pairings WHERE tournament_id = ? AND round_number = 1",
  ).get(event.id).count, 2);
  const corrected = database.prepare(
    "SELECT id FROM pairings WHERE tournament_id = ? AND round_number = 1 ORDER BY board_number LIMIT 1",
  ).get(event.id);
  assert.equal((await post(manager, {
    action: "set_result",
    tournamentId: event.id,
    pairingId: corrected.id,
    result: "0-1",
  }, owner.cookie)).status, 200);
  assert.equal(database.prepare("SELECT result FROM pairings WHERE id = ?").get(corrected.id).result, "0-1");
});

test("published Malatya rounds distinguish one-round absences from withdrawals", async () => {
  const { MALATYA_C_ALL_ROUNDS } = await vite.ssrLoadModule(
    "/lib/malatya-category-c-all-round-data.ts",
  );
  const missingByRound = MALATYA_C_ALL_ROUNDS.map(
    (round) => new Set(round.unpairedSeeds),
  );
  assert.deepEqual(
    missingByRound.map((seeds) => seeds.size),
    [0, 1, 2, 3, 5, 9, 15, 22, 34],
  );

  // Seed 224 is absent only in round six and returns in round seven. This is
  // the real-event equivalent of a one-round skip, not a withdrawal.
  assert.equal(missingByRound[5].has(224), true);
  assert.equal(missingByRound[6].has(224), false);

  // These players disappear and remain absent in every later published
  // round, matching permanent withdrawal behavior.
  for (const [seed, firstMissingRound] of [[148, 2], [42, 3], [213, 4]]) {
    for (let round = firstMissingRound; round <= 9; round += 1) {
      assert.equal(missingByRound[round - 1].has(seed), true);
    }
  }
});

test("authorized tournament backup is complete, deterministic, and secret-free", async () => {
  const owner = await account("backup-owner");
  const other = await account("backup-other");
  const event = await tournament(owner.cookie, "Backup event");
  assert.equal((await post(manager, {
    action: "add_player",
    tournamentId: event.id,
    name: "Backup Player",
    fideId: "BACKUP-1",
    rating: 1650,
  }, owner.cookie)).status, 201);

  assert.equal((await post(manager, {
    action: "export_tournament",
    tournamentId: event.id,
  }, other.cookie)).status, 403);
  const exported = await post(manager, {
    action: "export_tournament",
    tournamentId: event.id,
  }, owner.cookie);
  assert.equal(exported.status, 200, JSON.stringify(exported.data));
  assert.equal(exported.data.backup.format, "freak-swiss-tournament");
  assert.equal(exported.data.backup.version, 1);
  assert.equal(exported.data.backup.tournament.id, event.id);
  assert.equal(exported.data.backup.players.length, 1);
  assert.deepEqual(exported.data.backup.rounds, []);
  assert.deepEqual(exported.data.backup.pairings, []);
  const serialized = JSON.stringify(exported.data.backup);
  assert.doesNotMatch(serialized, /tokenHash|passwordHash|passwordSalt|guestTokenHash/);

  assert.equal((await post(manager, {
    action: "set_tournament_archived",
    tournamentId: event.id,
    archived: true,
  }, owner.cookie)).status, 200);
  const archivedExport = await post(manager, {
    action: "export_tournament",
    tournamentId: event.id,
  }, owner.cookie);
  assert.equal(archivedExport.status, 200);
  assert.ok(archivedExport.data.backup.tournament.archivedAt);

  const ui = await readFile(`${root}/app/tournament-manager.tsx`, "utf8");
  assert.match(ui, /action: "export_tournament"/);
  assert.match(ui, /Tournament backup downloaded/);
  assert.match(ui, /<Download \/> Backup/);
});
