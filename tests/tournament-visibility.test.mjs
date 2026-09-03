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

test("only staff can request official visibility or the featured flag", async () => {
  const {
    canSetOfficialVisibility,
    resolveRequestedVisibility,
    resolveFeaturedFlag,
    isValidVisibility,
  } = await vite.ssrLoadModule("/lib/tournament-visibility.ts");

  assert.equal(canSetOfficialVisibility("superadmin"), true);
  assert.equal(canSetOfficialVisibility("moderator"), true);
  assert.equal(canSetOfficialVisibility("player"), false);
  assert.equal(canSetOfficialVisibility("visitor"), false);

  assert.equal(resolveRequestedVisibility("official", "player"), "community");
  assert.equal(resolveRequestedVisibility("official", "moderator"), "official");
  assert.equal(resolveRequestedVisibility("official", "superadmin"), "official");
  assert.equal(resolveRequestedVisibility("private", "player"), "private");
  assert.equal(resolveRequestedVisibility("PRIVATE", "player"), "private");
  assert.equal(resolveRequestedVisibility("nonsense", "player"), "community");
  assert.equal(resolveRequestedVisibility(undefined, "player"), "community");

  assert.equal(resolveFeaturedFlag(true, "player"), false);
  assert.equal(resolveFeaturedFlag(true, "moderator"), true);
  assert.equal(resolveFeaturedFlag(true, "superadmin"), true);
  assert.equal(resolveFeaturedFlag(false, "superadmin"), false);

  assert.equal(isValidVisibility("official"), true);
  assert.equal(isValidVisibility("community"), true);
  assert.equal(isValidVisibility("private"), true);
  assert.equal(isValidVisibility("public"), false);
});

test("any authenticated user can create a tournament and becomes its owner", async () => {
  const managerRoute = await source("app/api/manager/route.ts");

  assert.doesNotMatch(
    managerRoute,
    /Only the configured superadmin can create tournaments/,
  );
  assert.match(managerRoute, /canCreateTournament: viewerGlobalRole !== "visitor"/);
  assert.match(
    managerRoute,
    /const visibility = resolveRequestedVisibility\(body\.visibility, globalRole\)/,
  );
  assert.match(
    managerRoute,
    /const featured = resolveFeaturedFlag\(body\.featured, globalRole\)/,
  );
});

test("set_tournament_visibility enforces ownership and staff-only official/featured status", async () => {
  const managerRoute = await source("app/api/manager/route.ts");

  assert.match(
    managerRoute,
    /const tournament = await getTournamentForControl\(tournamentId, email\);/,
  );
  assert.match(managerRoute, /body\.action === "set_tournament_visibility"/);
  assert.match(
    managerRoute,
    /\(requested === "official" \|\| body\.featured === true\) &&\s*\n\s*!canSetOfficialVisibility\(globalRole\)/,
  );
});

test("home page listing only surfaces official or featured tournaments, separate from community", async () => {
  const managerRoute = await source("app/api/manager/route.ts");

  assert.match(
    managerRoute,
    /AND \(t\.visibility = 'official' OR t\.featured = 1\)/,
  );
  assert.match(managerRoute, /AND t\.visibility = 'community'/);
});
