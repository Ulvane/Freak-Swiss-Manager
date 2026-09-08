import type {
  Pairing,
  Player,
  ResultCode,
  Standing,
} from "./tournament-types";

function resultPoints(result: ResultCode, side: "white" | "black") {
  if (result === "1-BYE") return side === "white" ? 1 : 0;
  if (result === "1-0" || result === "1F-0F") {
    return side === "white" ? 1 : 0;
  }
  if (result === "0-1" || result === "0F-1F") {
    return side === "black" ? 1 : 0;
  }
  if (result === "½-½") return 0.5;
  return 0;
}

function isPlayedResult(result: ResultCode) {
  return result === "1-0" || result === "0-1" || result === "½-½";
}

export function calculateStandings(
  players: Player[],
  pairings: Pairing[],
): Standing[] {
  const scores = new Map(players.map((player) => [player.id, 0]));
  const opponents = new Map<
    string,
    Array<{ opponentId: string; earned: number }>
  >(players.map((player) => [player.id, []]));

  for (const pairing of pairings) {
    if (pairing.result === "*") continue;
    if (pairing.whitePlayerId) {
      const earned = resultPoints(pairing.result, "white");
      scores.set(
        pairing.whitePlayerId,
        (scores.get(pairing.whitePlayerId) ?? 0) + earned,
      );
      if (pairing.blackPlayerId && isPlayedResult(pairing.result)) {
        opponents
          .get(pairing.whitePlayerId)
          ?.push({ opponentId: pairing.blackPlayerId, earned });
      }
    }
    if (pairing.blackPlayerId && pairing.whitePlayerId) {
      const earned = resultPoints(pairing.result, "black");
      scores.set(
        pairing.blackPlayerId,
        (scores.get(pairing.blackPlayerId) ?? 0) + earned,
      );
      if (isPlayedResult(pairing.result)) {
        opponents
          .get(pairing.blackPlayerId)
          ?.push({ opponentId: pairing.whitePlayerId, earned });
      }
    }
  }

  const rows = players.map((player) => {
    const history = opponents.get(player.id) ?? [];
    return {
      playerId: player.id,
      name: player.name,
      rating: player.rating,
      score: scores.get(player.id) ?? 0,
      buchholz: history.reduce(
        (sum, game) => sum + (scores.get(game.opponentId) ?? 0),
        0,
      ),
      sonnebornBerger: history.reduce(
        (sum, game) =>
          sum + game.earned * (scores.get(game.opponentId) ?? 0),
        0,
      ),
      seed: player.seed,
    };
  });
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.buchholz - a.buchholz ||
      b.sonnebornBerger - a.sonnebornBerger ||
      b.rating - a.rating ||
      a.seed - b.seed,
  );
  return rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.playerId,
    name: row.name,
    rating: row.rating,
    score: row.score,
    buchholz: row.buchholz,
    sonnebornBerger: row.sonnebornBerger,
  }));
}
