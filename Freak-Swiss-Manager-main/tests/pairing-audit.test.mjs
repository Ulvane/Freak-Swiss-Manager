import assert from "node:assert/strict";
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

test("Malatya fixture covers every entrant and round-one allocation", async () => {
  const {
    createMalatyaRoundOneAudit,
    MALATYA_PLAYERS,
    MALATYA_ROUND_ONE,
    MALATYA_UNPAIRED_SEEDS,
  } = await vite.ssrLoadModule("/lib/malatya-benchmark.ts");
  const { MALATYA_ROUND_ONE_AUDIT_STATS } = await vite.ssrLoadModule(
    "/lib/malatya-benchmark-audit-stats.ts",
  );

  assert.equal(MALATYA_PLAYERS.length, 67);
  assert.deepEqual(MALATYA_UNPAIRED_SEEDS, [2, 50]);
  assert.equal(MALATYA_ROUND_ONE.length, 33);

  const allocatedSeeds = MALATYA_ROUND_ONE.flatMap((pairing) =>
    pairing.blackSeed === null
      ? [pairing.whiteSeed]
      : [pairing.whiteSeed, pairing.blackSeed],
  );
  assert.equal(allocatedSeeds.length, 65);
  assert.equal(new Set(allocatedSeeds).size, 65);
  assert.deepEqual(
    [...allocatedSeeds].sort((a, b) => a - b),
    MALATYA_PLAYERS.map((player) => player.seed).filter(
      (seed) => !MALATYA_UNPAIRED_SEEDS.includes(seed),
    ),
  );

  const audit = createMalatyaRoundOneAudit();
  assert.deepEqual(audit.stats, MALATYA_ROUND_ONE_AUDIT_STATS);
  assert.equal(audit.activePlayerCount, 65);
  assert.equal(audit.generated.length, 33);
  assert.equal(audit.rows.length, 33);
  assert.equal(
    audit.stats.sameMatchupAnywhere + audit.stats.differentMatchups,
    33,
  );
});

test("Malatya Category C fixture covers the complete normal-Swiss round", async () => {
  const {
    createMalatyaCategoryCRoundOneAudit,
    MALATYA_C_PLAYERS,
    MALATYA_C_ROUND_ONE,
  } = await vite.ssrLoadModule("/lib/malatya-category-c-benchmark.ts");

  assert.equal(MALATYA_C_PLAYERS.length, 257);
  assert.equal(MALATYA_C_ROUND_ONE.length, 129);

  const allocatedSeeds = MALATYA_C_ROUND_ONE.flatMap((pairing) =>
    pairing.blackSeed === null
      ? [pairing.whiteSeed]
      : [pairing.whiteSeed, pairing.blackSeed],
  );
  assert.equal(allocatedSeeds.length, 257);
  assert.equal(new Set(allocatedSeeds).size, 257);
  assert.deepEqual(
    [...allocatedSeeds].sort((a, b) => a - b),
    MALATYA_C_PLAYERS.map((player) => player.seed),
  );

  const audit = createMalatyaCategoryCRoundOneAudit();
  assert.equal(audit.officialByeSeed, 213);
  assert.equal(audit.stats.exactBoardAndColors, 41);
  assert.equal(audit.stats.sameMatchupAnywhere, 41);
  assert.equal(audit.stats.differentMatchups, 88);
  assert.equal(audit.rawStats.sameMatchupAnywhere, 2);
});

test("Malatya Category C round two uses the full official round-one state", async () => {
  const {
    createMalatyaCategoryCRoundTwoAudit,
    MALATYA_C_ROUND_TWO,
    MALATYA_C_ROUND_TWO_UNPAIRED_SEEDS,
  } = await vite.ssrLoadModule("/lib/malatya-category-c-round-two.ts");
  const { MALATYA_C_PLAYERS } = await vite.ssrLoadModule(
    "/lib/malatya-category-c-benchmark.ts",
  );

  assert.equal(MALATYA_C_ROUND_TWO.length, 128);
  assert.deepEqual(MALATYA_C_ROUND_TWO_UNPAIRED_SEEDS, [148]);
  const allocatedSeeds = MALATYA_C_ROUND_TWO.flatMap((pairing) => [
    pairing.whiteSeed,
    pairing.blackSeed,
  ]);
  assert.equal(allocatedSeeds.length, 256);
  assert.equal(new Set(allocatedSeeds).size, 256);
  assert.deepEqual(
    [...allocatedSeeds].sort((a, b) => a - b),
    MALATYA_C_PLAYERS.map((player) => player.seed).filter(
      (seed) => !MALATYA_C_ROUND_TWO_UNPAIRED_SEEDS.includes(seed),
    ),
  );

  const audit = createMalatyaCategoryCRoundTwoAudit();
  assert.equal(audit.activePlayerCount, 256);
  assert.equal(audit.stats.exactBoardAndColors, 128);
  assert.equal(audit.stats.sameMatchupAnywhere, 128);
  assert.equal(audit.stats.differentMatchups, 0);
});

test("all nine Category C rounds account for every paired, skipped and withdrawn player", async () => {
  const { MALATYA_C_ALL_ROUNDS } = await vite.ssrLoadModule(
    "/lib/malatya-category-c-all-round-data.ts",
  );
  const {
    computeMalatyaCategoryCRoundAudit,
    createMalatyaCategoryCRoundAudit,
  } = await vite.ssrLoadModule(
    "/lib/malatya-category-c-all-rounds.ts",
  );

  assert.equal(MALATYA_C_ALL_ROUNDS.length, 9);
  const expectedExactBoards = [41, 128, 128, 127, 126, 124, 121, 118, 112];
  for (const round of MALATYA_C_ALL_ROUNDS) {
    const allocated = round.pairings.flatMap((pairing) =>
      pairing.blackSeed === null
        ? [pairing.whiteSeed]
        : [pairing.whiteSeed, pairing.blackSeed],
    );
    assert.equal(new Set(allocated).size, allocated.length);
    assert.equal(
      allocated.length + round.unpairedSeeds.length,
      257,
      `Round ${round.round} must account for all starters`,
    );

    const audit = computeMalatyaCategoryCRoundAudit(round.round);
    const fixtureAudit = createMalatyaCategoryCRoundAudit(round.round);
    assert.deepEqual(fixtureAudit.generated, audit.generated);
    assert.equal(audit.rows.length, round.pairings.length);
    assert.equal(audit.generated.length, round.pairings.length);
    assert.equal(
      audit.stats.sameMatchupAnywhere + audit.stats.differentMatchups,
      round.pairings.length,
    );
    assert.equal(
      audit.stats.exactBoardAndColors,
      expectedExactBoards[round.round - 1],
      `Round ${round.round} exact board-and-colour regression`,
    );
  }
});

test("forfeit wins score but remain unplayed pairing history", async () => {
  const { hydratePairingPlayers } = await vite.ssrLoadModule(
    "/lib/pairing-engine.ts",
  );
  const players = hydratePairingPlayers(
    [
      { id: "white", name: "White", rating: 2000, seed: 1 },
      { id: "black", name: "Black", rating: 1900, seed: 2 },
    ],
    [{ whitePlayerId: "white", blackPlayerId: "black", result: "1F-0F" }],
  );

  const white = players.find((player) => player.id === "white");
  const black = players.find((player) => player.id === "black");
  assert.equal(white.score, 1);
  assert.equal(black.score, 0);
  assert.equal(white.opponents.size, 0);
  assert.equal(black.opponents.size, 0);
  assert.deepEqual(white.colors, []);
  assert.deepEqual(black.colors, []);
  assert.equal(white.hadBye, true);
});
