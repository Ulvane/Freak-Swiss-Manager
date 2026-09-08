import type { Pairing, ResultCode } from "./tournament-types";
import { calculateStandings } from "./standings";
import type { TournamentSnapshot } from "./tournament-types";

export const ENTERABLE_RESULTS = ["1-0", "0-1", "½-½"] as const satisfies readonly ResultCode[];

export type EnterableResult = (typeof ENTERABLE_RESULTS)[number];

export function isEnterableResult(value: unknown): value is EnterableResult {
  return ENTERABLE_RESULTS.some((result) => result === value);
}

export function countPendingResults(
  pairings: ReadonlyArray<Pick<Pairing, "result">>,
) {
  return pairings.filter((pairing) => pairing.result === "*").length;
}

export function pairingsForRound(
  pairings: Pairing[],
  roundNumber: number,
) {
  return pairings.filter((pairing) => pairing.roundNumber === roundNumber);
}

export function applyPairingResult(
  snapshot: TournamentSnapshot,
  pairingId: string,
  result: ResultCode,
): TournamentSnapshot {
  if (!snapshot.pairings.some((pairing) => pairing.id === pairingId)) {
    return snapshot;
  }

  const pairings = snapshot.pairings.map((pairing) =>
    pairing.id === pairingId ? { ...pairing, result } : pairing,
  );
  const currentRoundPairings = pairings.filter(
    (pairing) =>
      pairing.roundNumber === snapshot.tournament.currentRound,
  );
  const roundComplete =
    currentRoundPairings.length > 0 &&
    countPendingResults(currentRoundPairings) === 0;
  const status = roundComplete
    ? snapshot.tournament.currentRound >= snapshot.tournament.rounds
      ? "completed"
      : "between_rounds"
    : "active";

  return {
    ...snapshot,
    tournament: { ...snapshot.tournament, status },
    pairings,
    standings: calculateStandings(snapshot.players, pairings),
  };
}
