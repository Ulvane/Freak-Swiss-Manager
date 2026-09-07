import type {
  Pairing,
  Player,
  ResultCode,
  RoundStatusRecord,
  Standing,
} from "./tournament-types";

export type CrosstableCell = {
  kind: "game" | "bye" | "skip" | "withdrawn" | "empty";
  label: string;
  title: string;
};

export type CrosstableRow = {
  standing: Standing;
  player: Player;
  rounds: CrosstableCell[];
};

function playerResult(result: ResultCode, isWhite: boolean) {
  if (result === "1-0") return isWhite ? "1" : "0";
  if (result === "0-1") return isWhite ? "0" : "1";
  if (result === "½-½") return "½";
  if (result === "1F-0F") return isWhite ? "1F" : "0F";
  if (result === "0F-1F") return isWhite ? "0F" : "1F";
  if (result === "0F-0F") return "0F";
  return "·";
}

export function createCrosstableRows(
  players: Player[],
  pairings: Pairing[],
  standings: Standing[],
  roundStatuses: RoundStatusRecord[],
  currentRound: number,
): CrosstableRow[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const pairingByPlayerRound = new Map<string, Pairing>();
  for (const pairing of pairings) {
    if (pairing.whitePlayerId) {
      pairingByPlayerRound.set(
        `${pairing.whitePlayerId}:${pairing.roundNumber}`,
        pairing,
      );
    }
    if (pairing.blackPlayerId) {
      pairingByPlayerRound.set(
        `${pairing.blackPlayerId}:${pairing.roundNumber}`,
        pairing,
      );
    }
  }
  const statusByPlayerRound = new Map(
    roundStatuses.map((status) => [
      `${status.playerId}:${status.roundNumber}`,
      status.status,
    ]),
  );

  return standings.flatMap((standing) => {
    const player = playerById.get(standing.playerId);
    if (!player) return [];
    const rounds = Array.from({ length: currentRound }, (_, index) => {
      const roundNumber = index + 1;
      const pairing = pairingByPlayerRound.get(`${player.id}:${roundNumber}`);
      if (pairing) {
        if (!pairing.blackPlayerId || pairing.result === "1-BYE") {
          return {
            kind: "bye",
            label: "BYE",
            title: `Round ${roundNumber}: one-point bye`,
          } satisfies CrosstableCell;
        }
        const isWhite = pairing.whitePlayerId === player.id;
        const opponentId = isWhite
          ? pairing.blackPlayerId
          : pairing.whitePlayerId;
        const opponent = opponentId ? playerById.get(opponentId) : null;
        const color = isWhite ? "W" : "B";
        const result = playerResult(pairing.result, isWhite);
        return {
          kind: "game",
          label: `${opponent?.seed ?? "—"}${color} ${result}`,
          title: `Round ${roundNumber}: ${color === "W" ? "White" : "Black"} vs ${opponent?.name ?? "unknown"}, ${result}`,
        } satisfies CrosstableCell;
      }

      const status = statusByPlayerRound.get(`${player.id}:${roundNumber}`);
      if (status === "bye") {
        return {
          kind: "bye",
          label: "BYE",
          title: `Round ${roundNumber}: one-point bye`,
        } satisfies CrosstableCell;
      }
      if (status === "skip") {
        return {
          kind: "skip",
          label: "SKIP",
          title: `Round ${roundNumber}: did not play`,
        } satisfies CrosstableCell;
      }
      if (
        player.withdrawn &&
        player.withdrawnFromRound !== null &&
        roundNumber >= player.withdrawnFromRound
      ) {
        return {
          kind: "withdrawn",
          label: "WD",
          title: `Round ${roundNumber}: withdrawn`,
        } satisfies CrosstableCell;
      }
      return {
        kind: "empty",
        label: "—",
        title: `Round ${roundNumber}: no pairing`,
      } satisfies CrosstableCell;
    });
    return [{ standing, player, rounds }];
  });
}
