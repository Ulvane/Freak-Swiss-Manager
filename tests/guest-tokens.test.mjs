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

test("guest tokens are hashed and verified within their tournament", async () => {
  const { createGuestToken, verifyGuestToken } = await vite.ssrLoadModule(
    "/lib/guest-tokens.ts",
  );
  let insertValues;
  let verificationSql = "";
  let verificationValues;
  const database = {
    prepare(sql) {
      if (sql.includes("INSERT INTO guest_tokens")) {
        return {
          bind(...values) {
            insertValues = values;
            return { run: async () => ({ success: true }) };
          },
        };
      }
      verificationSql = sql;
      return {
        bind(...values) {
          verificationValues = values;
          return { first: async () => ({ playerId: "player-a", tournamentId: "tournament-a" }) };
        },
      };
    },
  };

  const token = await createGuestToken(
    database,
    { playerId: "player-a", tournamentId: "tournament-a" },
    "2026-09-06T12:00:00.000Z",
    "2026-09-03T12:00:00.000Z",
  );
  const identity = await verifyGuestToken(database, token, "tournament-a");

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(insertValues[3], /^[a-f0-9]{64}$/);
  assert.notEqual(insertValues[3], token);
  assert.match(verificationSql, /gt\.tournament_id = \?/);
  assert.match(verificationSql, /p\.account_email IS NULL/);
  assert.equal(verificationValues[1], "tournament-a");
  assert.deepEqual(identity, { playerId: "player-a", tournamentId: "tournament-a" });
});

test("guest registration and withdrawal routes enforce scoped ownership", async () => {
  const [joinRoute, withdrawRoute] = await Promise.all([
    readFile(path.join(root, "app/api/guest/join-tournament/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/player/withdraw/route.ts"), "utf8"),
  ]);

  assert.match(joinRoute, /registration_open AS registrationOpen/);
  assert.match(joinRoute, /account_email,\s*\n\s*rating/);
  assert.match(joinRoute, /createGuestToken/);
  assert.match(withdrawRoute, /body\?\.confirmation !== true/);
  assert.match(withdrawRoute, /verifyGuestToken\(database, guestToken, tournamentId\)/);
  assert.match(withdrawRoute, /round_number > \?/);
});
