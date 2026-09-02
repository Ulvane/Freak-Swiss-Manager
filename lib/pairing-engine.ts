import {
  pair as createDutchPairings,
  type CompletedRound,
  type Game,
  type Player as DutchPlayer,
} from "@echecs/swiss/dutch";

import type { ResultCode } from "./tournament-types";

export type PairingPlayer = {
  id: string;
  name: string;
  rating: number;
  seed: number;
  score: number;
  opponents: Set<string>;
  colors: Array<"W" | "B">;
  hadBye: boolean;
  /** Shared, immutable tournament history used by the Dutch bracket engine. */
  history: HistoricalPairing[];
};

export type HistoricalPairing = {
  roundNumber?: number;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  result: ResultCode;
};

export type EnginePairing = {
  whitePlayerId: string;
  blackPlayerId: string | null;
  result: ResultCode;
};

export type PairingOptions = {
  expectedRounds?: number;
};

export function resultPoints(result: ResultCode, side: "white" | "black") {
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

export function isPlayedResult(result: ResultCode) {
  return result === "1-0" || result === "0-1" || result === "½-½";
}

export function isForfeitResult(result: ResultCode) {
  return result === "1F-0F" || result === "0F-1F" || result === "0F-0F";
}

export function hydratePairingPlayers(
  players: Array<{ id: string; name: string; rating: number; seed: number }>,
  history: HistoricalPairing[],
): PairingPlayer[] {
  const state = new Map(
    players.map((player) => [
      player.id,
      {
        ...player,
        score: 0,
        opponents: new Set<string>(),
        colors: [] as Array<"W" | "B">,
        hadBye: false,
        history,
      },
    ]),
  );

  for (const pairing of history) {
    const white = pairing.whitePlayerId
      ? state.get(pairing.whitePlayerId)
      : undefined;
    const black = pairing.blackPlayerId
      ? state.get(pairing.blackPlayerId)
      : undefined;

    if (white) {
      white.score += resultPoints(pairing.result, "white");
      if (black && isPlayedResult(pairing.result)) {
        white.opponents.add(black.id);
        white.colors.push("W");
      } else if (pairing.result === "1-BYE" || pairing.result === "1F-0F") {
        white.hadBye = true;
      }
    }

    if (black && white) {
      black.score += resultPoints(pairing.result, "black");
      if (isPlayedResult(pairing.result)) {
        black.opponents.add(white.id);
        black.colors.push("B");
      } else if (pairing.result === "0F-1F") {
        black.hadBye = true;
      }
    }
  }

  return [...state.values()];
}

function gameFromHistory(pairing: HistoricalPairing): Game | null {
  const white = pairing.whitePlayerId;
  const black = pairing.blackPlayerId;
  if (!white || !black || pairing.result === "*" || pairing.result === "1-BYE") {
    return null;
  }

  switch (pairing.result) {
    case "1-0":
      return { white, black, result: "white" };
    case "0-1":
      return { white, black, result: "black" };
    case "½-½":
      return { white, black, result: "draw" };
    case "1F-0F":
      return { white, black, result: "white", forfeit: "black" };
    case "0F-1F":
      return { white, black, result: "black", forfeit: "white" };
    case "0F-0F":
      return { white, black, result: "none", forfeit: "both" };
  }
}

function completedRounds(history: HistoricalPairing[]): CompletedRound[] {
  const completed = history.filter((pairing) => pairing.result !== "*");
  const lastRound = completed.reduce(
    (maximum, pairing) => Math.max(maximum, pairing.roundNumber ?? 1),
    0,
  );
  const rounds: CompletedRound[] = Array.from({ length: lastRound }, () => ({
    byes: [],
    games: [],
  }));

  for (const pairing of completed) {
    const round = rounds[(pairing.roundNumber ?? 1) - 1];
    if (pairing.result === "1-BYE" && pairing.whitePlayerId) {
      round.byes.push({ player: pairing.whitePlayerId, kind: "pairing" });
      continue;
    }
    const game = gameFromHistory(pairing);
    if (game) round.games.push(game);
  }

  return rounds;
}

/**
 * Generates a FIDE C.04.3 Dutch pairing using the complete 2026 criteria.
 *
 * The underlying engine evaluates brackets, MDPs, downfloaters, remainder
 * pairings, colour preferences and float history together. This replaces the
 * former single-downfloater approximation and its global greedy fallback.
 */
export function createSwissPairings(
  players: PairingPlayer[],
  options: PairingOptions = {},
): EnginePairing[] {
  if (players.length === 0) return [];
  if (players.length === 1) {
    return [
      {
        whitePlayerId: players[0].id,
        blackPlayerId: null,
        result: "1-BYE",
      },
    ];
  }

  const ranked = [...players].sort(
    (first, second) => second.score - first.score || first.seed - second.seed,
  );
  const dutchPlayers: DutchPlayer[] = ranked.map((player, index) => ({
    id: player.id,
    name: player.name,
    points: player.score,
    rank: index + 1,
    rating: player.rating,
    startingRank: player.seed,
  }));
  const history = players[0]?.history ?? [];
  const rounds = completedRounds(history);
  const generated = createDutchPairings(dutchPlayers, rounds, {
    expectedRounds: options.expectedRounds ?? rounds.length + 1,
  });

  return [
    ...generated.games.map((pairing) => ({
      whitePlayerId: pairing.white,
      blackPlayerId: pairing.black,
      result: "*" as const,
    })),
    ...generated.byes.map((bye) => ({
      whitePlayerId: bye.player,
      blackPlayerId: null,
      result: "1-BYE" as const,
    })),
  ];
}
