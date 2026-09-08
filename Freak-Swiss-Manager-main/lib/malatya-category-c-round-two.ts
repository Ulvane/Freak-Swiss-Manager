import { createSwissPairings, hydratePairingPlayers } from "@/lib/pairing-engine";
import {
  MALATYA_C_PLAYERS,
  MALATYA_C_ROUND_ONE,
} from "@/lib/malatya-category-c-benchmark";
import type { OfficialBenchmarkPairing } from "@/lib/malatya-benchmark";

export const MALATYA_C_ROUND_TWO_SOURCE_URL =
  "https://malatyaopen.tsf.org.tr/en/component/turnuva/?kid=299&task=fileview";

export const MALATYA_C_ROUND_TWO_UNPAIRED_SEEDS = [148] as const;

export const MALATYA_C_ROUND_TWO: OfficialBenchmarkPairing[] = [
  { board: 1, whiteSeed: 76, blackSeed: 1, result: "1-0" },
  { board: 2, whiteSeed: 2, blackSeed: 77, result: "1-0" },
  { board: 3, whiteSeed: 78, blackSeed: 5, result: "½-½" },
  { board: 4, whiteSeed: 6, blackSeed: 79, result: "1-0" },
  { board: 5, whiteSeed: 80, blackSeed: 7, result: "½-½" },
  { board: 6, whiteSeed: 8, blackSeed: 81, result: "1-0" },
  { board: 7, whiteSeed: 82, blackSeed: 9, result: "1-0" },
  { board: 8, whiteSeed: 10, blackSeed: 83, result: "1-0" },
  { board: 9, whiteSeed: 12, blackSeed: 85, result: "1-0" },
  { board: 10, whiteSeed: 84, blackSeed: 13, result: "0-1" },
  { board: 11, whiteSeed: 14, blackSeed: 89, result: "0-1" },
  { board: 12, whiteSeed: 88, blackSeed: 15, result: "0-1" },
  { board: 13, whiteSeed: 16, blackSeed: 91, result: "0-1" },
  { board: 14, whiteSeed: 90, blackSeed: 17, result: "0-1" },
  { board: 15, whiteSeed: 18, blackSeed: 93, result: "1-0" },
  { board: 16, whiteSeed: 92, blackSeed: 19, result: "1-0" },
  { board: 17, whiteSeed: 21, blackSeed: 95, result: "1-0" },
  { board: 18, whiteSeed: 94, blackSeed: 23, result: "1-0" },
  { board: 19, whiteSeed: 96, blackSeed: 25, result: "0-1" },
  { board: 20, whiteSeed: 28, blackSeed: 97, result: "1-0" },
  { board: 21, whiteSeed: 30, blackSeed: 99, result: "0-1" },
  { board: 22, whiteSeed: 100, blackSeed: 31, result: "0-1" },
  { board: 23, whiteSeed: 32, blackSeed: 103, result: "1-0" },
  { board: 24, whiteSeed: 102, blackSeed: 33, result: "0-1" },
  { board: 25, whiteSeed: 34, blackSeed: 105, result: "½-½" },
  { board: 26, whiteSeed: 104, blackSeed: 35, result: "0-1" },
  { board: 27, whiteSeed: 36, blackSeed: 107, result: "1-0" },
  { board: 28, whiteSeed: 106, blackSeed: 37, result: "0-1" },
  { board: 29, whiteSeed: 38, blackSeed: 109, result: "1-0" },
  { board: 30, whiteSeed: 40, blackSeed: 111, result: "1-0" },
  { board: 31, whiteSeed: 110, blackSeed: 41, result: "0-1" },
  { board: 32, whiteSeed: 112, blackSeed: 43, result: "0-1" },
  { board: 33, whiteSeed: 44, blackSeed: 113, result: "1-0" },
  { board: 34, whiteSeed: 114, blackSeed: 45, result: "1-0" },
  { board: 35, whiteSeed: 46, blackSeed: 115, result: "1-0" },
  { board: 36, whiteSeed: 116, blackSeed: 47, result: "½-½" },
  { board: 37, whiteSeed: 48, blackSeed: 117, result: "1-0" },
  { board: 38, whiteSeed: 118, blackSeed: 49, result: "1-0" },
  { board: 39, whiteSeed: 50, blackSeed: 119, result: "0-1" },
  { board: 40, whiteSeed: 121, blackSeed: 51, result: "0-1" },
  { board: 41, whiteSeed: 122, blackSeed: 53, result: "1-0" },
  { board: 42, whiteSeed: 54, blackSeed: 123, result: "1-0" },
  { board: 43, whiteSeed: 124, blackSeed: 55, result: "1-0" },
  { board: 44, whiteSeed: 56, blackSeed: 125, result: "1-0" },
  { board: 45, whiteSeed: 126, blackSeed: 57, result: "1-0" },
  { board: 46, whiteSeed: 58, blackSeed: 127, result: "0-1" },
  { board: 47, whiteSeed: 130, blackSeed: 59, result: "0-1" },
  { board: 48, whiteSeed: 60, blackSeed: 147, result: "½-½" },
  { board: 49, whiteSeed: 149, blackSeed: 61, result: "0-1" },
  { board: 50, whiteSeed: 153, blackSeed: 63, result: "0-1" },
  { board: 51, whiteSeed: 64, blackSeed: 179, result: "1-0" },
  { board: 52, whiteSeed: 156, blackSeed: 65, result: "1-0" },
  { board: 53, whiteSeed: 66, blackSeed: 189, result: "1-0" },
  { board: 54, whiteSeed: 200, blackSeed: 67, result: "0-1" },
  { board: 55, whiteSeed: 68, blackSeed: 214, result: "1-0" },
  { board: 56, whiteSeed: 213, blackSeed: 69, result: "0-1" },
  { board: 57, whiteSeed: 70, blackSeed: 249, result: "1-0" },
  { board: 58, whiteSeed: 215, blackSeed: 71, result: "0-1" },
  { board: 59, whiteSeed: 72, blackSeed: 257, result: "½-½" },
  { board: 60, whiteSeed: 230, blackSeed: 75, result: "0-1" },
  { board: 61, whiteSeed: 4, blackSeed: 151, result: "1-0" },
  { board: 62, whiteSeed: 154, blackSeed: 11, result: "0-1" },
  { board: 63, whiteSeed: 24, blackSeed: 131, result: "0-1" },
  { board: 64, whiteSeed: 166, blackSeed: 27, result: "0-1" },
  { board: 65, whiteSeed: 138, blackSeed: 39, result: "½-½" },
  { board: 66, whiteSeed: 42, blackSeed: 201, result: "0F-1F" },
  { board: 67, whiteSeed: 74, blackSeed: 169, result: "0-1" },
  { board: 68, whiteSeed: 98, blackSeed: 237, result: "1-0" },
  { board: 69, whiteSeed: 108, blackSeed: 227, result: "1-0" },
  { board: 70, whiteSeed: 188, blackSeed: 3, result: "0-1" },
  { board: 71, whiteSeed: 20, blackSeed: 190, result: "1-0" },
  { board: 72, whiteSeed: 22, blackSeed: 191, result: "1-0" },
  { board: 73, whiteSeed: 26, blackSeed: 192, result: "1-0" },
  { board: 74, whiteSeed: 194, blackSeed: 29, result: "0-1" },
  { board: 75, whiteSeed: 52, blackSeed: 193, result: "1-0" },
  { board: 76, whiteSeed: 62, blackSeed: 195, result: "1-0" },
  { board: 77, whiteSeed: 196, blackSeed: 73, result: "0-1" },
  { board: 78, whiteSeed: 86, blackSeed: 197, result: "1-0" },
  { board: 79, whiteSeed: 198, blackSeed: 87, result: "0-1" },
  { board: 80, whiteSeed: 202, blackSeed: 101, result: "0-1" },
  { board: 81, whiteSeed: 120, blackSeed: 199, result: "0-1" },
  { board: 82, whiteSeed: 128, blackSeed: 203, result: "1-0" },
  { board: 83, whiteSeed: 204, blackSeed: 129, result: "0-1" },
  { board: 84, whiteSeed: 132, blackSeed: 205, result: "1-0" },
  { board: 85, whiteSeed: 206, blackSeed: 133, result: "0-1" },
  { board: 86, whiteSeed: 134, blackSeed: 207, result: "½-½" },
  { board: 87, whiteSeed: 208, blackSeed: 135, result: "0-1" },
  { board: 88, whiteSeed: 136, blackSeed: 209, result: "1-0" },
  { board: 89, whiteSeed: 210, blackSeed: 137, result: "0-1" },
  { board: 90, whiteSeed: 212, blackSeed: 139, result: "0-1" },
  { board: 91, whiteSeed: 140, blackSeed: 211, result: "1-0" },
  { board: 92, whiteSeed: 216, blackSeed: 141, result: "0-1" },
  { board: 93, whiteSeed: 142, blackSeed: 217, result: "1-0" },
  { board: 94, whiteSeed: 218, blackSeed: 143, result: "0-1" },
  { board: 95, whiteSeed: 144, blackSeed: 219, result: "0-1" },
  { board: 96, whiteSeed: 220, blackSeed: 145, result: "0-1" },
  { board: 97, whiteSeed: 146, blackSeed: 221, result: "0-1" },
  { board: 98, whiteSeed: 150, blackSeed: 222, result: "0-1" },
  { board: 99, whiteSeed: 152, blackSeed: 223, result: "0-1" },
  { board: 100, whiteSeed: 224, blackSeed: 155, result: "0-1" },
  { board: 101, whiteSeed: 226, blackSeed: 157, result: "1-0" },
  { board: 102, whiteSeed: 158, blackSeed: 225, result: "0-1" },
  { board: 103, whiteSeed: 228, blackSeed: 159, result: "1-0" },
  { board: 104, whiteSeed: 160, blackSeed: 229, result: "1-0" },
  { board: 105, whiteSeed: 232, blackSeed: 161, result: "0-1" },
  { board: 106, whiteSeed: 162, blackSeed: 231, result: "1-0" },
  { board: 107, whiteSeed: 234, blackSeed: 163, result: "0-1" },
  { board: 108, whiteSeed: 164, blackSeed: 233, result: "½-½" },
  { board: 109, whiteSeed: 236, blackSeed: 165, result: "1-0" },
  { board: 110, whiteSeed: 238, blackSeed: 167, result: "0-1" },
  { board: 111, whiteSeed: 168, blackSeed: 235, result: "1-0" },
  { board: 112, whiteSeed: 170, blackSeed: 239, result: "1-0" },
  { board: 113, whiteSeed: 240, blackSeed: 171, result: "0-1" },
  { board: 114, whiteSeed: 172, blackSeed: 241, result: "1-0" },
  { board: 115, whiteSeed: 242, blackSeed: 173, result: "0F-1F" },
  { board: 116, whiteSeed: 174, blackSeed: 243, result: "1-0" },
  { board: 117, whiteSeed: 244, blackSeed: 175, result: "0-1" },
  { board: 118, whiteSeed: 176, blackSeed: 245, result: "0-1" },
  { board: 119, whiteSeed: 246, blackSeed: 177, result: "0-1" },
  { board: 120, whiteSeed: 178, blackSeed: 247, result: "1-0" },
  { board: 121, whiteSeed: 180, blackSeed: 248, result: "1F-0F" },
  { board: 122, whiteSeed: 250, blackSeed: 181, result: "0-1" },
  { board: 123, whiteSeed: 182, blackSeed: 251, result: "1-0" },
  { board: 124, whiteSeed: 252, blackSeed: 183, result: "0-1" },
  { board: 125, whiteSeed: 184, blackSeed: 253, result: "0-1" },
  { board: 126, whiteSeed: 254, blackSeed: 185, result: "1-0" },
  { board: 127, whiteSeed: 186, blackSeed: 255, result: "1-0" },
  { board: 128, whiteSeed: 256, blackSeed: 187, result: "0-1" },
];

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

export function createMalatyaCategoryCRoundTwoAudit() {
  const unpaired = new Set<number>(MALATYA_C_ROUND_TWO_UNPAIRED_SEEDS);
  const activePlayers = MALATYA_C_PLAYERS.filter(
    (player) => !unpaired.has(player.seed),
  );
  const generated = createSwissPairings(
    hydratePairingPlayers(
      activePlayers.map((player) => ({
        id: playerId(player.seed),
        name: player.name,
        rating: player.rating,
        seed: player.seed,
      })),
      MALATYA_C_ROUND_ONE.map((pairing) => ({
        roundNumber: 1,
        whitePlayerId: playerId(pairing.whiteSeed),
        blackPlayerId:
          pairing.blackSeed === null ? null : playerId(pairing.blackSeed),
        result: pairing.result,
      })),
    ),
    { expectedRounds: 9 },
  ).map((pairing, index) => ({
    board: index + 1,
    whiteSeed: seedFromPlayerId(pairing.whitePlayerId)!,
    blackSeed: seedFromPlayerId(pairing.blackPlayerId),
  }));

  const generatedByKey = new Map(
    generated.map((pairing) => [
      pairingKey(pairing.whiteSeed, pairing.blackSeed),
      pairing,
    ]),
  );
  const rows = MALATYA_C_ROUND_TWO.map((official, index) => {
    const sameBoard = generated[index];
    const matchup = generatedByKey.get(
      pairingKey(official.whiteSeed, official.blackSeed),
    );
    const sameBoardOpponents =
      pairingKey(sameBoard.whiteSeed, sameBoard.blackSeed) ===
      pairingKey(official.whiteSeed, official.blackSeed);
    const exactColors =
      sameBoard.whiteSeed === official.whiteSeed &&
      sameBoard.blackSeed === official.blackSeed;
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
    activePlayerCount: activePlayers.length,
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
