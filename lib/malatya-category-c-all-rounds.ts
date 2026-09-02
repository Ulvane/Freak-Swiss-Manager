import { createSwissPairings, hydratePairingPlayers } from "@/lib/pairing-engine";
import { MALATYA_C_PLAYERS } from "@/lib/malatya-category-c-benchmark";
import {
  MALATYA_C_ALL_ROUNDS,
  type MalatyaCategoryCRoundData,
} from "@/lib/malatya-category-c-all-round-data";

function playerId(seed: number) {
  return `seed-${seed}`;
}

function seedFromPlayerId(id: string | null) {
  return id ? Number(id.replace("seed-", "")) : null;
}

function pairingKey(whiteSeed: number, blackSeed: number | null) {
  if (blackSeed === null) return `bye:${whiteSeed}`;
  return [whiteSeed, blackSeed].sort((a, b) => a - b).join(":");
}

function roundData(round: number): MalatyaCategoryCRoundData {
  const data = MALATYA_C_ALL_ROUNDS.find((item) => item.round === round);
  if (!data) throw new Error(`Official Category C round ${round} is unavailable.`);
  return data;
}

export function createMalatyaCategoryCRoundAudit(round: number) {
  const current = roundData(round);
  const history = MALATYA_C_ALL_ROUNDS
    .filter((item) => item.round < round)
    .flatMap((item) =>
      item.pairings.map((pairing) => ({
        ...pairing,
        roundNumber: item.round,
      })),
    );
  const activeSeeds = new Set(
    current.pairings.flatMap((pairing) =>
      pairing.blackSeed === null
        ? [pairing.whiteSeed]
        : [pairing.whiteSeed, pairing.blackSeed],
    ),
  );
  const officialBye = current.pairings.find(
    (pairing) => pairing.blackSeed === null,
  );

  // Hydrate everybody first so an active player's history is retained even
  // when a previous opponent later withdrew.
  const hydrated = hydratePairingPlayers(
    MALATYA_C_PLAYERS.map((player) => ({
      id: playerId(player.seed),
      name: player.name,
      rating: player.rating,
      seed: player.seed,
    })),
    history.map((pairing) => ({
      roundNumber: pairing.roundNumber,
      whitePlayerId: playerId(pairing.whiteSeed),
      blackPlayerId:
        pairing.blackSeed === null ? null : playerId(pairing.blackSeed),
      result: pairing.result,
    })),
  );
  const activePlayers = hydrated.filter(
    (player) =>
      activeSeeds.has(player.seed) && player.seed !== officialBye?.whiteSeed,
  );

  const generated = createSwissPairings(activePlayers, { expectedRounds: 9 }).map((pairing, index) => ({
    board: index + 1,
    whiteSeed: seedFromPlayerId(pairing.whitePlayerId)!,
    blackSeed: seedFromPlayerId(pairing.blackPlayerId),
  }));
  if (officialBye) {
    generated.push({
      board: generated.length + 1,
      whiteSeed: officialBye.whiteSeed,
      blackSeed: null,
    });
  }

  const generatedByKey = new Map(
    generated.map((pairing) => [
      pairingKey(pairing.whiteSeed, pairing.blackSeed),
      pairing,
    ]),
  );
  const rows = current.pairings.map((official, index) => {
    const sameBoard = generated[index];
    const matchup = generatedByKey.get(
      pairingKey(official.whiteSeed, official.blackSeed),
    );
    const sameBoardOpponents =
      sameBoard !== undefined &&
      pairingKey(sameBoard.whiteSeed, sameBoard.blackSeed) ===
        pairingKey(official.whiteSeed, official.blackSeed);
    const exactColors =
      sameBoard?.whiteSeed === official.whiteSeed &&
      sameBoard?.blackSeed === official.blackSeed;
    const status = exactColors
      ? "exact"
      : sameBoardOpponents
        ? "colors-reversed"
        : matchup
          ? "different-board"
          : "different-matchup";
    return { official, generated: sameBoard, matchup, status } as const;
  });

  return {
    round,
    sourceUrl: current.sourceUrl,
    activePlayerCount: activeSeeds.size,
    unpairedSeeds: current.unpairedSeeds,
    officialByeSeed: officialBye?.whiteSeed ?? null,
    generated,
    rows,
    stats: {
      exactBoardAndColors: rows.filter((row) => row.status === "exact").length,
      sameOpponentsSameBoard: rows.filter(
        (row) => row.status === "exact" || row.status === "colors-reversed",
      ).length,
      sameMatchupAnywhere: rows.filter((row) => row.matchup).length,
      differentMatchups: rows.filter((row) => !row.matchup).length,
    },
  };
}
