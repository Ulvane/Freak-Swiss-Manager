import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const player = (id, seed, withdrawn = false, withdrawnFromRound = null) => ({
  id,
  name: `Player ${id}`,
  fideId: "",
  rating: 2000 - seed,
  seed,
  withdrawn,
  withdrawnFromRound,
  checkedIn: true,
  nextRoundStatus: "active",
  isYou: false,
});

test("official and community listings are separate and private events stay code-only", async () => {
  const route = await readFile(`${root}/app/api/manager/route.ts`, "utf8");
  const ui = await readFile(`${root}/app/tournament-manager.tsx`, "utf8");

  assert.match(route, /WHERE t\.visibility = 'official' AND t\.archived_at IS NULL/);
  assert.doesNotMatch(
    route.match(/WHERE t\.visibility = 'official'[\s\S]*?GROUP BY t\.id/)?.[0] ?? "",
    /registration_open = 1/,
  );
  assert.match(route, /WHERE t\.visibility = 'community' AND t\.archived_at IS NULL/);
  assert.doesNotMatch(route, /WHERE t\.visibility = 'private'/);
  assert.match(ui, /OFFICIAL TOURNAMENTS/);
  assert.match(ui, /id="community-tournaments"/);
});

test("crosstable combines games, byes, skips and withdrawal history", async () => {
  const { createCrosstableRows } = await vite.ssrLoadModule("/lib/crosstable.ts");
  const players = [
    player("a", 1),
    player("b", 2),
    player("c", 3),
    player("d", 4, true, 2),
  ];
  const standings = players.map((entry, index) => ({
    rank: index + 1,
    playerId: entry.id,
    name: entry.name,
    rating: entry.rating,
    score: entry.id === "a" ? 2 : entry.id === "c" ? 1 : 0,
    buchholz: 1,
    sonnebornBerger: 0.5,
  }));
  const pairings = [
    {
      id: "g1",
      roundNumber: 1,
      boardNumber: 1,
      whitePlayerId: "a",
      blackPlayerId: "b",
      result: "1-0",
      whiteName: "Player a",
      blackName: "Player b",
    },
    {
      id: "bye",
      roundNumber: 1,
      boardNumber: 2,
      whitePlayerId: "c",
      blackPlayerId: null,
      result: "1-BYE",
      whiteName: "Player c",
      blackName: null,
    },
  ];
  const rows = createCrosstableRows(
    players,
    pairings,
    standings,
    [{ playerId: "a", roundNumber: 2, status: "skip" }],
    2,
  );

  assert.deepEqual(rows[0].rounds.map((cell) => cell.label), ["2W 1", "SKIP"]);
  assert.deepEqual(rows[2].rounds.map((cell) => cell.label), ["BYE", "—"]);
  assert.deepEqual(rows[3].rounds.map((cell) => cell.label), ["—", "WD"]);
});

test("pair publication order follows score and TPN independently of colour", async () => {
  const { sortPairingsForPublication } = await vite.ssrLoadModule(
    "/lib/pairing-engine.ts",
  );
  const players = [
    { ...player("p1", 1), score: 2, opponents: new Set(), colors: [], hadBye: false, history: [] },
    { ...player("p2", 2), score: 2, opponents: new Set(), colors: [], hadBye: false, history: [] },
    { ...player("p3", 3), score: 2, opponents: new Set(), colors: [], hadBye: false, history: [] },
    { ...player("p4", 4), score: 1, opponents: new Set(), colors: [], hadBye: false, history: [] },
    { ...player("p5", 5), score: 1.5, opponents: new Set(), colors: [], hadBye: false, history: [] },
    { ...player("p6", 6), score: 1.5, opponents: new Set(), colors: [], hadBye: false, history: [] },
  ];
  const unordered = [
    { whitePlayerId: "p6", blackPlayerId: "p5", result: "*" },
    { whitePlayerId: "p4", blackPlayerId: "p3", result: "*" },
    { whitePlayerId: "p2", blackPlayerId: "p1", result: "*" },
  ];
  const ordered = sortPairingsForPublication(unordered, players);
  assert.deepEqual(
    ordered.map((pairing) => new Set([pairing.whitePlayerId, pairing.blackPlayerId])),
    [new Set(["p1", "p2"]), new Set(["p3", "p4"]), new Set(["p5", "p6"])],
  );

  const flipped = unordered.map((pairing) => ({
    ...pairing,
    whitePlayerId: pairing.blackPlayerId,
    blackPlayerId: pairing.whitePlayerId,
  }));
  assert.deepEqual(
    sortPairingsForPublication(flipped, players).map((pairing) =>
      [...new Set([pairing.whitePlayerId, pairing.blackPlayerId])].sort(),
    ),
    [["p1", "p2"], ["p3", "p4"], ["p5", "p6"]],
  );
});

test("print output has dedicated headers, active-tab isolation and A4 landscape rules", async () => {
  const ui = await readFile(`${root}/app/tournament-manager.tsx`, "utf8");
  const css = await readFile(`${root}/app/globals.css`, "utf8");

  assert.match(ui, /Print \/ Save PDF/);
  assert.match(ui, /className="print-header"/);
  assert.match(css, /@media print/);
  assert.match(css, /size:\s*A4 landscape/);
  assert.match(css, /\.tab-panel\[data-state="inactive"\]/);
  assert.match(css, /\.print-header\s*\{[\s\S]*display:\s*block/);
});

test("operational pairing cases cover odd fields, repeat avoidance and skipped-player gates", async () => {
  const { createSwissPairings, hydratePairingPlayers } = await vite.ssrLoadModule(
    "/lib/pairing-engine.ts",
  );
  const roster = Array.from({ length: 5 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    rating: 2200 - index * 50,
    seed: index + 1,
  }));
  const first = createSwissPairings(hydratePairingPlayers(roster, []), {
    expectedRounds: 3,
  });
  assert.equal(first.length, 3);
  assert.equal(first.filter((pairing) => pairing.blackPlayerId === null).length, 1);
  assert.equal(new Set(first.flatMap((pairing) => [pairing.whitePlayerId, pairing.blackPlayerId]).filter(Boolean)).size, 5);

  const history = first.map((pairing) => ({ ...pairing, roundNumber: 1, result: pairing.blackPlayerId ? "½-½" : "1-BYE" }));
  const second = createSwissPairings(hydratePairingPlayers(roster, history), {
    expectedRounds: 3,
  });
  const firstMatches = new Set(
    first
      .filter((pairing) => pairing.blackPlayerId)
      .map((pairing) => [pairing.whitePlayerId, pairing.blackPlayerId].sort().join(":")),
  );
  assert.equal(
    second
      .filter((pairing) => pairing.blackPlayerId)
      .some((pairing) =>
        firstMatches.has([pairing.whitePlayerId, pairing.blackPlayerId].sort().join(":")),
      ),
    false,
  );

  const route = await readFile(`${root}/app/api/manager/route.ts`, "utf8");
  assert.match(route, /activePlayers\.filter\(\(player\) => !statuses\.has\(player\.id\)\)/);
  assert.match(route, /manualByePlayers/);
  assert.match(route, /withdrawn = 0 AND checked_in = 0/);
  assert.match(route, /sortPairingsForPublication/);
});
