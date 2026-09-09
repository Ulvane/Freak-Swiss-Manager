import type {
  Pairing,
  Player,
  ResultCode,
  RoundStatusRecord,
  Standing,
} from "./tournament-types";

export type PlayerMatchRecord = {
  roundNumber: number;
  boardNumber: number | null;
  color: "white" | "black" | null;
  opponentId: string | null;
  opponentName: string;
  opponentRating: number | null;
  opponentRank: number | null;
  result: ResultCode | "BYE" | "SKIP" | "WD" | "—";
  pointsEarned: number | null;
  runningTotal: number | null;
  outcome:
    | "win"
    | "draw"
    | "loss"
    | "bye"
    | "skip"
    | "withdrawn"
    | "pending"
    | "unpaired";
};

export type PlayerHistory = {
  player: Player;
  standing?: Standing;
  matches: PlayerMatchRecord[];
  wins: number;
  draws: number;
  losses: number;
  totalScore: number;
};

export function getPlayerHistory(
  playerId: string,
  players: Player[],
  pairings: Pairing[],
  standings: Standing[],
  roundStatuses: RoundStatusRecord[],
  currentRound: number,
): PlayerHistory | null {
  const player = players.find((p) => p.id === playerId);
  if (!player) return null;

  const playerById = new Map(players.map((p) => [p.id, p]));
  const standingByPlayerId = new Map(standings.map((s) => [s.playerId, s]));
  const statusByPlayerRound = new Map(
    roundStatuses.map((s) => [`${s.playerId}:${s.roundNumber}`, s.status]),
  );

  const pairingByPlayerRound = new Map<number, Pairing>();
  for (const pairing of pairings) {
    if (
      pairing.whitePlayerId === playerId ||
      pairing.blackPlayerId === playerId
    ) {
      pairingByPlayerRound.set(pairing.roundNumber, pairing);
    }
  }

  const matches: PlayerMatchRecord[] = [];
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let totalScore = 0;

  for (let roundNumber = 1; roundNumber <= currentRound; roundNumber++) {
    const pairing = pairingByPlayerRound.get(roundNumber);
    const status = statusByPlayerRound.get(`${playerId}:${roundNumber}`);
    const match: PlayerMatchRecord = {
      roundNumber,
      boardNumber: pairing?.boardNumber ?? null,
      color: null,
      opponentId: null,
      opponentName: "—",
      opponentRating: null,
      opponentRank: null,
      result: "—",
      pointsEarned: null,
      runningTotal: null,
      outcome: "unpaired",
    };

    if (pairing && pairing.blackPlayerId && pairing.result !== "1-BYE") {
      const isWhite = pairing.whitePlayerId === playerId;
      const opponentId = isWhite ? pairing.blackPlayerId : pairing.whitePlayerId;
      const opponent = opponentId ? playerById.get(opponentId) : undefined;
      match.color = isWhite ? "white" : "black";
      match.opponentId = opponentId;
      match.opponentName = opponent?.name ?? (isWhite ? pairing.blackName : pairing.whiteName) ?? "—";
      match.opponentRating = opponent?.rating ?? null;
      match.opponentRank = opponentId ? standingByPlayerId.get(opponentId)?.rank ?? null : null;
      match.result = pairing.result;
      match.outcome = "pending";

      switch (pairing.result) {
        case "1-0":
        case "1F-0F":
          match.pointsEarned = isWhite ? 1 : 0;
          break;
        case "0-1":
        case "0F-1F":
          match.pointsEarned = isWhite ? 0 : 1;
          break;
        case "½-½":
          match.pointsEarned = 0.5;
          break;
        case "0F-0F":
          match.pointsEarned = 0;
          break;
      }
      if (match.pointsEarned !== null) {
        match.outcome = match.pointsEarned === 1 ? "win" : match.pointsEarned === 0.5 ? "draw" : "loss";
      }
    } else if (pairing || status === "bye") {
      match.opponentName = "BYE";
      match.result = "BYE";
      match.pointsEarned = 1;
      match.outcome = "bye";
    } else if (status === "skip") {
      match.opponentName = "Did not play";
      match.result = "SKIP";
      match.pointsEarned = 0;
      match.outcome = "skip";
    } else if (player.withdrawn && player.withdrawnFromRound !== null && roundNumber >= player.withdrawnFromRound) {
      match.opponentName = "Withdrawn";
      match.result = "WD";
      match.pointsEarned = 0;
      match.outcome = "withdrawn";
    }

    if (match.outcome === "win" || match.outcome === "bye") wins++;
    if (match.outcome === "draw") draws++;
    if (match.outcome === "loss") losses++;
    if (match.pointsEarned !== null) {
      totalScore += match.pointsEarned;
      match.runningTotal = totalScore;
    }
    matches.push(match);
  }

  return {
    player,
    standing: standingByPlayerId.get(playerId),
    matches,
    wins,
    draws,
    losses,
    totalScore,
  };
}
