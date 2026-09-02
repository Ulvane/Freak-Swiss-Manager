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

test("2700chess Top 64 creates exactly one unresolved first round", async () => {
  const { createTestTournamentRoster, TEST_TOURNAMENT_PLAYER_COUNT } =
    await vite.ssrLoadModule("/lib/test-tournament.ts");
  const { createSwissPairings, hydratePairingPlayers } =
    await vite.ssrLoadModule("/lib/pairing-engine.ts");
  const {
    ENTERABLE_RESULTS,
    applyPairingResult,
    countPendingResults,
    isEnterableResult,
    pairingsForRound,
  } =
    await vite.ssrLoadModule("/lib/result-workflow.ts");

  const roster = createTestTournamentRoster().map((player) => ({
    ...player,
    id: `test-player-${player.seed}`,
    checkedIn: true,
  }));

  assert.equal(roster.length, TEST_TOURNAMENT_PLAYER_COUNT);
  assert.equal(new Set(roster.map((player) => player.seed)).size, 64);
  assert.deepEqual(roster[0], {
    id: "test-player-1",
    name: "Carlsen, Magnus",
    fideId: "",
    rating: 2823,
    seed: 1,
    checkedIn: true,
  });
  assert.equal(roster[63].name, "Muradli, Mahammad");
  assert.equal(roster[63].rating, 2653);
  assert.equal(roster.every((player) => player.checkedIn), true);

  const roundOne = createSwissPairings(hydratePairingPlayers(roster, []), {
    expectedRounds: 6,
  });
  assert.equal(roundOne.length, 32);
  assert.equal(roundOne.filter((pairing) => pairing.blackPlayerId === null).length, 0);
  const roundOnePlayers = roundOne.flatMap((pairing) => [
    pairing.whitePlayerId,
    pairing.blackPlayerId,
  ]);
  assert.equal(new Set(roundOnePlayers).size, 64);
  assert.equal(roundOne.every((pairing) => pairing.result === "*"), true);
  assert.equal(countPendingResults(roundOne), 32);
  assert.deepEqual([...ENTERABLE_RESULTS], ["1-0", "0-1", "½-½"]);
  assert.equal(isEnterableResult("1-0"), true);
  assert.equal(isEnterableResult("0-1"), true);
  assert.equal(isEnterableResult("½-½"), true);
  assert.equal(isEnterableResult("*"), false);
  assert.equal(isEnterableResult("1F-0F"), false);

  const recordedRound = roundOne.map((pairing, index) => ({
    ...pairing,
    result: ENTERABLE_RESULTS[index % ENTERABLE_RESULTS.length],
  }));
  assert.equal(countPendingResults(recordedRound), 0);
  assert.equal(
    recordedRound.every((pairing) => isEnterableResult(pairing.result)),
    true,
  );

  const snapshot = {
    tournament: { currentRound: 1, rounds: 6, status: "active" },
    players: roster,
    pairings: roundOne.map((pairing, index) => ({
      ...pairing,
      id: `pairing-${index + 1}`,
      roundNumber: 1,
      boardNumber: index + 1,
      whiteName: null,
      blackName: null,
    })),
    standings: [],
  };
  const firstUpdate = applyPairingResult(snapshot, "pairing-1", "1-0");
  assert.equal(firstUpdate.pairings[0].result, "1-0");
  assert.equal(firstUpdate.standings[0].score, 1);
  assert.equal(firstUpdate.tournament.status, "active");

  const completed = firstUpdate.pairings
    .slice(1)
    .reduce(
      (current, pairing) =>
        applyPairingResult(current, pairing.id, "½-½"),
      firstUpdate,
    );
  assert.equal(countPendingResults(completed.pairings), 0);
  assert.equal(completed.tournament.status, "between_rounds");

  const archivedPairings = [
    ...completed.pairings,
    ...completed.pairings.slice(0, 4).map((pairing, index) => ({
      ...pairing,
      id: `round-2-pairing-${index + 1}`,
      roundNumber: 2,
    })),
  ];
  assert.equal(pairingsForRound(archivedPairings, 1).length, 32);
  assert.equal(pairingsForRound(archivedPairings, 2).length, 4);
});
