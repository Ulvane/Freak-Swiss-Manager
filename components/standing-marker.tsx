import type { Tournament } from "@/lib/tournament-types";

type Props = {
  rank: number;
  tournament: Pick<Tournament, "status" | "currentRound" | "rounds">;
  hasResults: boolean;
  saving: boolean;
};

export function standingAward({ rank, tournament, hasResults, saving }: Props) {
  if (!hasResults || tournament.currentRound < 1 || rank < 1) return null;
  const finished = tournament.status === "completed" &&
    tournament.currentRound >= tournament.rounds && !saving;
  if (!finished) return rank === 1 ? "leader" : null;
  return rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;
}

const labels = {
  leader: "Current leader / Güncel lider",
  gold: "Tournament champion / Turnuva şampiyonu",
  silver: "Second place / İkinci",
  bronze: "Third place / Üçüncü",
};

export function StandingMarker(props: Props) {
  const award = standingAward(props);
  if (!award) return null;
  const metal = award === "silver" ? "#c3ced9" : "#ce8549";
  const shadow = award === "silver" ? "#64748b" : "#884a27";
  return (
    <svg
      className={`standing-marker standing-marker-${award}`}
      viewBox="0 0 16 16"
      role="img"
      aria-label={labels[award]}
      shapeRendering="crispEdges"
    >
      <title>{labels[award]}</title>
      {award === "leader" ? (
        <path fill="currentColor" d="M7 1h2v2h1v2h1v2h1v2h1v2h1v2h1v2h-4v-2h-1v-2H9V9H7v2H6v2H5v2H1v-2h1v-2h1V9h1V7h1V5h1V3h1z" />
      ) : award === "gold" ? (
        <>
          <path fill="currentColor" d="M3 1h10v1h3v6h-2v2h-3v1H9v2h3v2H4v-2h3v-2H5v-1H2V8H0V2h3z" />
          <path fill="#e4a313" d="M4 2h8v5h-1v2H9v2H7V9H5V7H4zM1 3h2v2H2v2h2v1H2V7H1zM13 3h2v4h-1v1h-2V7h2V5h-1zM7 11h2v2H7zM5 13h6v1H5z" />
          <path fill="#ffe17a" d="M5 2h6v1H5zM5 3h2v3H6v1H5zM6 13h4v1H6z" />
          <path fill="#ac6d08" d="M10 4h2v3h-1v2H9V8h1z" />
        </>
      ) : (
        <>
          <path fill="currentColor" d="M2 0h5v2h2V0h5v5h-2v2h1v2h1v4h-2v2H4v-2H2V9h1V7h1V5H2z" />
          <path fill="#a12b3b" d="M3 1h3v2h1v3H5V4H3zM10 1h3v3h-2v2H9V3h1z" />
          <path fill={shadow} d="M5 6h6v2h2v4h-2v2H5v-2H3V8h2z" />
          <path fill={metal} d="M5 7h6v1h1v4h-2v1H6v-1H4V8h1z" />
          <path fill={shadow} d={award === "silver" ? "M6 8h4v3H7v1h3v1H6v-3h3V9H6z" : "M6 8h4v5H6v-1h3v-1H7v-1h2V9H6z"} />
        </>
      )}
    </svg>
  );
}
