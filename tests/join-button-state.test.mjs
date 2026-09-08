import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("tournament cards show a red Join action and a disabled grey Joined state", async () => {
  const [manager, css] = await Promise.all([
    readFile(`${root}/app/tournament-manager.tsx`, "utf8"),
    readFile(`${root}/app/globals.css`, "utf8"),
  ]);

  assert.match(manager, /className="tournament-join-button"[\s\S]*<UserPlus \/> Join/);
  assert.match(manager, /item\.role === "player"[\s\S]*className="tournament-joined-button" disabled[\s\S]*<UserCheck \/> Joined/);
  assert.match(css, /\.tournament-join-button\s*\{[\s\S]*background:\s*var\(--red\)[\s\S]*color:\s*var\(--white\)/);
  assert.match(css, /\.tournament-joined-button:disabled\s*\{[\s\S]*background:\s*#d6d3ca[\s\S]*color:\s*#6f6d66[\s\S]*opacity:\s*1/);
});

test("public listings keep live personal tournaments visible", async () => {
  const route = await readFile(`${root}/app/api/manager/route.ts`, "utf8");
  const listingBlock = route.slice(route.indexOf("openTournaments ="), route.indexOf("const snapshot ="));

  assert.doesNotMatch(listingBlock, /filter\(\(row\) => !personalIds\.has\(row\.id\)\)/);
  assert.match(listingBlock, /const personal = tournaments\.find\(\(item\) => item\.id === row\.id\)/);
  assert.match(listingBlock, /role: personal\?\.role \?\? \(\"visitor\" as const\)/);
});

test("tournament navigation keeps browser history inside the app", async () => {
  const manager = await readFile(`${root}/app/tournament-manager.tsx`, "utf8");

  assert.match(manager, /window\.history\.pushState\(\{\}, "", `\?t=\$\{encodeURIComponent\(tournamentId\)\}`\)/);
  assert.match(manager, /window\.addEventListener\("popstate", syncFromUrl\)/);
  assert.match(manager, /window\.removeEventListener\("popstate", syncFromUrl\)/);
  assert.match(manager, /if \(window\.location\.search\) \{[\s\S]*window\.history\.pushState\(\{\}, "", window\.location\.pathname\)/);
});
