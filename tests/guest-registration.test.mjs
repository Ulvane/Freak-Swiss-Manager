import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
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

function createMockDatabase() {
  const calls = [];
  const rows = new Map(); // tokenHash -> row
  return {
    calls,
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async run() {
              return { success: true };
            },
            async first() {
              if (/FROM guest_tokens/.test(sql)) {
                const [tokenHash] = args;
                const row = rows.get(tokenHash);
                if (!row) return null;
                const expiresAt = row.expiresAt;
                const now = args[1];
                if (expiresAt <= now) return null;
                return { playerId: row.playerId, tournamentId: row.tournamentId };
              }
              return null;
            },
          };
        },
      };
    },
    async batch(statements) {
      for (const statement of statements) {
        await statement.run();
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

test("guest tokens expire after exactly 30 days", async () => {
  const { GUEST_TOKEN_TTL_DAYS, guestTokenExpiryFrom } = await vite.ssrLoadModule(
    "/lib/guest-tokens.ts",
  );
  const createdAt = new Date("2026-01-01T00:00:00.000Z");

  assert.equal(GUEST_TOKEN_TTL_DAYS, 30);
  assert.equal(guestTokenExpiryFrom(createdAt), "2026-01-31T00:00:00.000Z");
});

test("guest token values only contain the safe alphabet and hyphen separators", async () => {
  const { createGuestTokenValue, compactGuestToken } = await vite.ssrLoadModule(
    "/lib/guest-tokens.ts",
  );
  const value = createGuestTokenValue();

  assert.match(value, /^GST(-[A-Z0-9]{5}){4}$/);
  assert.equal(compactGuestToken(value), value.replaceAll("-", ""));
});

test("hashes guest tokens with SHA-256 and never stores the raw value", async () => {
  const { digestGuestToken } = await vite.ssrLoadModule("/lib/guest-tokens.ts");
  const hashA = await digestGuestToken("ABCDEF1234");
  const hashB = await digestGuestToken("ABCDEF1234");
  const hashC = await digestGuestToken("DIFFERENT");

  assert.match(hashA, /^[0-9a-f]{64}$/);
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
});

test("createGuestToken stores only a hash and links player + tournament", async () => {
  const { createGuestToken, digestGuestToken, compactGuestToken } =
    await vite.ssrLoadModule("/lib/guest-tokens.ts");
  const database = createMockDatabase();

  const { token, expiresAt } = await createGuestToken(database, {
    playerId: "player-1",
    tournamentId: "tournament-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.equal(expiresAt, "2026-01-31T00:00:00.000Z");

  const insertCall = database.calls.find((call) =>
    /INSERT INTO guest_tokens/.test(call.sql),
  );
  const updateCall = database.calls.find((call) =>
    /UPDATE players SET guest_token_hash/.test(call.sql),
  );
  assert.ok(insertCall, "expected an INSERT INTO guest_tokens statement");
  assert.ok(updateCall, "expected an UPDATE players SET guest_token_hash statement");

  const expectedHash = await digestGuestToken(compactGuestToken(token));
  assert.equal(insertCall.args[3], expectedHash);
  assert.equal(insertCall.args[1], "player-1");
  assert.equal(insertCall.args[2], "tournament-1");
  assert.equal(updateCall.args[0], expectedHash);
  assert.equal(updateCall.args[1], "player-1");
  assert.doesNotMatch(JSON.stringify(insertCall.args), new RegExp(token));
});

test("verifyGuestToken rejects tokens scoped to a different tournament", async () => {
  const { verifyGuestToken, digestGuestToken } = await vite.ssrLoadModule(
    "/lib/guest-tokens.ts",
  );
  const database = createMockDatabase();
  const hash = await digestGuestToken("VALIDTOKEN");
  database.rows.set(hash, {
    playerId: "player-1",
    tournamentId: "tournament-1",
    expiresAt: "2026-02-01T00:00:00.000Z",
  });

  const now = new Date("2026-01-15T00:00:00.000Z");
  const matching = await verifyGuestToken(database, "VALIDTOKEN", "tournament-1", now);
  const mismatched = await verifyGuestToken(database, "VALIDTOKEN", "tournament-2", now);

  assert.deepEqual(matching, { playerId: "player-1", tournamentId: "tournament-1" });
  assert.equal(mismatched, null);
});

test("verifyGuestToken rejects expired tokens", async () => {
  const { verifyGuestToken, digestGuestToken } = await vite.ssrLoadModule(
    "/lib/guest-tokens.ts",
  );
  const database = createMockDatabase();
  const hash = await digestGuestToken("EXPIREDONE");
  database.rows.set(hash, {
    playerId: "player-1",
    tournamentId: "tournament-1",
    expiresAt: "2026-01-01T00:00:00.000Z",
  });

  const now = new Date("2026-02-01T00:00:00.000Z");
  const result = await verifyGuestToken(database, "EXPIREDONE", "tournament-1", now);

  assert.equal(result, null);
});

test("verifyGuestToken rejects missing or unrecognized tokens", async () => {
  const { verifyGuestToken } = await vite.ssrLoadModule("/lib/guest-tokens.ts");
  const database = createMockDatabase();

  assert.equal(await verifyGuestToken(database, null), null);
  assert.equal(await verifyGuestToken(database, ""), null);
  assert.equal(await verifyGuestToken(database, "UNKNOWN-TOKEN"), null);
});

test("guest join route requires no authentication and validates registration state", async () => {
  const routeSource = await source("app/api/guest/join-tournament/route.ts");

  assert.doesNotMatch(routeSource, /getAuthenticatedUser/);
  assert.match(routeSource, /registration_open AS registrationOpen/);
  assert.match(routeSource, /Registration is closed for this tournament/);
  assert.match(routeSource, /VALUES \(\?, \?, \?, \?, NULL/);
  assert.match(routeSource, /createGuestToken\(database, \{/);
});

test("player withdraw route accepts a session or a scoped guest token and requires confirmation", async () => {
  const routeSource = await source("app/api/player/withdraw/route.ts");

  assert.match(routeSource, /body\.confirm !== true/);
  assert.match(routeSource, /getAuthenticatedUser/);
  assert.match(routeSource, /verifyGuestToken\(\s*database,\s*body\.guestToken,\s*tournamentId,?\s*\)/);
  assert.match(routeSource, /withdrawn = 1, checked_in = 0/);
  assert.match(routeSource, /DELETE FROM player_round_statuses/);
  assert.match(routeSource, /round_number > \?/);
  assert.doesNotMatch(routeSource, /DELETE FROM pairings/);
});

test("players schema stores only a guest token hash, never the raw token", async () => {
  const schemaSource = await source("db/schema.ts");
  const migrationSource = await source("drizzle/0008_odd_lord_tyger.sql");

  assert.match(schemaSource, /guestTokenHash: text\("guest_token_hash"\)/);
  assert.match(schemaSource, /export const guestTokens = sqliteTable/);
  assert.match(migrationSource, /ALTER TABLE `players` ADD `guest_token_hash` text;/);
  assert.match(migrationSource, /CREATE TABLE `guest_tokens`/);
});
