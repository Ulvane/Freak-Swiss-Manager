import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test, { after, beforeEach } from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let database;
const migrations = await Promise.all((await readdir(`${root}/drizzle`))
  .filter((name) => name.endsWith(".sql")).sort()
  .map((name) => readFile(`${root}/drizzle/${name}`, "utf8")));
function prepare(sql, values = []) {
  return {
    bind: (...args) => prepare(sql, args),
    first: async () => database.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: database.prepare(sql).all(...values) }),
    run: async () => ({ meta: database.prepare(sql).run(...values) }),
  };
}
globalThis.__ownershipDb = {
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
const vite = await createServer({
  appType: "custom", configFile: false, root,
  resolve: { alias: { "@": root, "next/headers": "/__ownership_headers__.ts" } },
  server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: "ownership-test-runtime", enforce: "pre",
    resolveId(id) { if (id === "/__ownership_headers__.ts") return "\0ownership-headers"; },
    load(id) {
      if (id === "\0ownership-headers") return "export async function cookies() {return {get:()=>({value:globalThis.__ownershipToken})};}";
      if (id === `${root}db/raw.ts` || id === `${root}/db/raw.ts`) return "export function getDatabase(){return globalThis.__ownershipDb;}";
    },
  }],
});
const manager = await vite.ssrLoadModule("/app/api/manager/route.ts");
const oldSuperadmin = process.env.SUPERADMIN_EMAIL;
after(async () => {
  await vite.close();
  database?.close();
  delete globalThis.__ownershipDb;
  delete globalThis.__ownershipToken;
  if (oldSuperadmin === undefined) delete process.env.SUPERADMIN_EMAIL;
  else process.env.SUPERADMIN_EMAIL = oldSuperadmin;
});

function addAccount(name, { moderator = false, banned = false, credentials = true } = {}) {
  const email = `${name}@example.test`;
  database.prepare("INSERT INTO user_accounts VALUES (?, ?, '2026-01-01', '2026-01-01')").run(email, name);
  if (credentials) database.prepare(`INSERT INTO auth_credentials
    (email, password_hash, password_salt, password_iterations, created_at, updated_at)
    VALUES (?, 'unused-hash', 'unused-salt', 100000, '2026-01-01', '2026-01-01')`).run(email);
  if (moderator) database.prepare("INSERT INTO moderators VALUES (?, ?, 'admin@example.test', '2026-01-01')").run(email, name);
  if (banned) database.prepare("INSERT INTO moderation_accounts (email, status) VALUES (?, 'banned')").run(email);
  return email;
}
function event(id, owner = "owner", archived = false) {
  database.prepare(`INSERT INTO tournaments (id, owner_email, name, rounds, visibility, archived_at, created_at)
    VALUES (?, ?, ?, 5, 'private', ?, '2026-01-01')`).run(id, `${owner}@example.test`, id, archived ? "2026-01-02" : null);
}
function delegate(id, name, created = "2026-01-01") {
  database.prepare(`INSERT INTO tournament_moderators VALUES (?, ?, ?, 'admin@example.test', ?)`)
    .run(`${id}-${name}`, id, `${name}@example.test`, created);
}
function owner(id) { return database.prepare("SELECT owner_email FROM tournaments WHERE id = ?").get(id).owner_email; }
async function post(body, actor = "admin") {
  globalThis.__ownershipToken = `session-${actor}`;
  database.prepare("INSERT OR IGNORE INTO auth_sessions VALUES (?, ?, '2999-01-01', '2026-01-01')")
    .run(createHash("sha256").update(globalThis.__ownershipToken).digest("hex"), `${actor}@example.test`);
  const response = await manager.POST(new Request("https://test.invalid/api/manager", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: response.status, data: await response.json() };
}
beforeEach(() => {
  database?.close();
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const sql of migrations) database.exec(sql);
  process.env.SUPERADMIN_EMAIL = "admin@example.test";
  addAccount("admin"); addAccount("owner");
});

test("deletion prefers assigned staff, then other site staff; preserves archive and results", async () => {
  addAccount("a-site", { moderator: true });
  addAccount("z-assigned", { moderator: true });
  event("assigned", "owner", true); event("unassigned");
  delegate("assigned", "z-assigned");
  database.exec(`INSERT INTO players (id, tournament_id, name, account_email, seed, created_at)
    VALUES ('p', 'assigned', 'Player', 'owner@example.test', 1, '2026-01-01');
    INSERT INTO rounds (id,tournament_id,number,created_at) VALUES ('r','assigned',1,'2026-01-01');
    INSERT INTO pairings (id,tournament_id,round_id,round_number,board_number,white_player_id,result)
    VALUES ('game','assigned','r',1,1,'p','1-BYE');`);
  const response = await post({ action: "delete_account", email: "owner@example.test" });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.transferredTournamentCount, 2);
  assert.equal(owner("assigned"), "z-assigned@example.test");
  assert.equal(owner("unassigned"), "a-site@example.test");
  assert.equal(database.prepare("SELECT archived_at FROM tournaments WHERE id='assigned'").get().archived_at, "2026-01-02");
  assert.equal(database.prepare("SELECT result FROM pairings WHERE id='game'").get().result, "1-BYE");
  assert.equal(database.prepare("SELECT account_email FROM players WHERE id='p'").get().account_email, null);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM auth_credentials WHERE email='owner@example.test'").get().n, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM moderation_audit_log WHERE action='transfer_tournament_ownership'").get().n, 2);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("deleting a moderator skips itself, banned and unusable moderators, then falls back to superadmin", async () => {
  addAccount("mod-owner", { moderator: true });
  addAccount("banned", { moderator: true, banned: true });
  addAccount("no-login", { moderator: true, credentials: false });
  event("fallback", "mod-owner"); delegate("fallback", "banned");
  const response = await post({ action: "delete_account", email: "mod-owner@example.test" });
  assert.equal(response.status, 200);
  assert.equal(owner("fallback"), "admin@example.test");
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM moderators WHERE email='mod-owner@example.test'").get().n, 0);
});

test("manual changes allow site moderators and superadmin, reject owners, unknown and banned recipients", async () => {
  addAccount("mod", { moderator: true }); addAccount("recipient"); addAccount("banned", { banned: true });
  event("manual");
  const change = (email, actor) => post({ action: "change_organizer", tournamentId: "manual", email }, actor);
  assert.equal((await change("recipient@example.test", "owner")).status, 403);
  assert.equal((await change("missing@example.test", "mod")).status, 409);
  assert.equal((await change("banned@example.test", "mod")).status, 409);
  assert.equal((await change("recipient@example.test", "mod")).status, 200);
  assert.equal(owner("manual"), "recipient@example.test");
  assert.equal((await post({ action: "update_tournament", tournamentId: "manual", name: "Hijacked" }, "owner")).status, 403);
  assert.equal((await post({ action: "update_tournament", tournamentId: "manual", name: "New owner title" }, "recipient")).status, 200);
  assert.equal((await change("admin@example.test", "admin")).status, 200);
  assert.equal(owner("manual"), "admin@example.test");
});

test("failed deletion rolls back both the ownership handover and audit records", async () => {
  event("rollback");
  database.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON user_accounts
    WHEN OLD.email='owner@example.test' BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
  const response = await post({ action: "delete_account", email: "owner@example.test" });
  assert.equal(response.status, 500);
  assert.equal(owner("rollback"), "owner@example.test");
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM auth_credentials WHERE email='owner@example.test'").get().n, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM moderation_audit_log").get().n, 0);
});

test("player-only accounts delete directly and only superadmin can delete accounts", async () => {
  addAccount("mod", { moderator: true });
  assert.equal((await post({ action: "delete_account", email: "owner@example.test" }, "mod")).status, 403);
  assert.equal((await post({ action: "delete_account", email: "admin@example.test" })).status, 400);
  const response = await post({ action: "delete_account", email: "owner@example.test" });
  assert.equal(response.status, 200);
  assert.equal(response.data.transferredTournamentCount, 0);
  assert.equal((await post({ action: "delete_account", email: "owner@example.test" })).status, 404);
});
