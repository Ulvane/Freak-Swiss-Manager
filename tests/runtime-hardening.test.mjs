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

test("uses the maximum PBKDF2 iteration count supported by workerd", async () => {
  const authServer = await source("app/auth-server.ts");

  assert.match(authServer, /PASSWORD_ITERATIONS = 100_000/);
  assert.match(authServer, /iterations > PASSWORD_ITERATIONS/);
  assert.doesNotMatch(authServer, /PASSWORD_ITERATIONS = 210_000/);
});

test("expires temporary guest players after exactly three days", async () => {
  const { guestExpiryFrom, GUEST_RETENTION_DAYS } = await vite.ssrLoadModule(
    "/lib/guest-players.ts",
  );
  const createdAt = new Date("2026-09-02T12:00:00.000Z");

  assert.equal(GUEST_RETENTION_DAYS, 3);
  assert.equal(guestExpiryFrom(createdAt), "2026-09-05T12:00:00.000Z");
});

test("cleans only expired, unpaired guest roster entries", async () => {
  const { cleanupExpiredGuestPlayers } = await vite.ssrLoadModule(
    "/lib/guest-players.ts",
  );
  let sql = "";
  let cutoff = "";
  const database = {
    prepare(statement) {
      sql = statement;
      return {
        bind(value) {
          cutoff = value;
          return { run: async () => ({ success: true }) };
        },
      };
    },
  };

  await cleanupExpiredGuestPlayers(
    database,
    new Date("2026-09-05T12:00:00.000Z"),
  );

  assert.match(sql, /guest_expires_at IS NOT NULL/);
  assert.match(sql, /guest_expires_at <= \?/);
  assert.match(sql, /current_round = 0/);
  assert.equal(cutoff, "2026-09-05T12:00:00.000Z");
});

test("keeps library and tournament payloads separated", async () => {
  const [managerRoute, worker, wrangler] = await Promise.all([
    source("app/api/manager/route.ts"),
    source("worker/index.ts"),
    source("wrangler.jsonc"),
  ]);

  assert.match(managerRoute, /const selectedId = tournamentId \|\| null/);
  assert.match(managerRoute, /isSuperadmin\(viewerEmail\) && !selectedId/);
  assert.match(managerRoute, /UPDATE players SET guest_expires_at = NULL/);
  assert.match(managerRoute, /const rowsPerStatement = 12/);
  assert.match(worker, /scheduled\(/);
  assert.match(wrangler, /"crons": \["17 \* \* \* \*"\]/);
});
