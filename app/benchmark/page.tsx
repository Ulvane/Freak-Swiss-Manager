import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";

import {
  categoryCPlayer,
  MALATYA_C_CHESS_RESULTS_URL,
  MALATYA_C_EVENT,
  MALATYA_C_PLAYERS,
} from "@/lib/malatya-category-c-benchmark";
import { MALATYA_C_ALL_ROUNDS } from "@/lib/malatya-category-c-all-round-data";
import { createMalatyaCategoryCRoundAudit } from "@/lib/malatya-category-c-all-rounds";
import {
  createMalatyaRoundOneAudit,
  MALATYA_EVENT,
  MALATYA_ROUND_ONE,
  MALATYA_SOURCE_URL,
} from "@/lib/malatya-benchmark";
import type { ResultCode } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

function resultLabel(result: ResultCode) {
  if (result === "1-BYE") return "Bye · 1 point";
  if (result === "1F-0F") return "White forfeit win";
  if (result === "0F-1F") return "Black forfeit win";
  if (result === "0F-0F") return "Double forfeit";
  return result.replaceAll("-", "–");
}

function playerLabel(seed: number | null | undefined) {
  const player = categoryCPlayer(seed ?? null);
  if (!player) return "—";
  return `#${player.seed} ${player.name}`;
}

function statusCopy(status: string, matchupBoard?: number) {
  if (status === "exact") return "Exact board + colors";
  if (status === "colors-reversed") return "Same board, colors reversed";
  if (status === "different-board") {
    return `Same matchup on Freak Swiss board ${matchupBoard}`;
  }
  return "Different matchup";
}

function selectedRound(value: string | undefined) {
  const parsed = Number(value ?? "2");
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9 ? parsed : 2;
}

export default async function BenchmarkPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const round = selectedRound((await searchParams).round);
  const audit = createMalatyaCategoryCRoundAudit(round);
  const categoryAAudit = createMalatyaRoundOneAudit();
  const officialCount = audit.rows.length;
  const passed = audit.stats.exactBoardAndColors === officialCount;
  const unpairedSet = new Set(audit.unpairedSeeds);

  return (
    <div className="app-shell benchmark-app">
      <aside className="brand-rail" aria-label="Freak Swiss Manager">
        <span className="brand-monogram">FS</span>
        <span className="brand-index">LAB</span>
        <span className="brand-vertical">PAIRING ENGINE AUDIT / MALATYA 2026</span>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <Link className="wordmark" href="/">
            Freak<span>Swiss</span> Manager
          </Link>
          <div className="topbar-meta">
            <span className="beta-tag">CATEGORY C · ALL 9 ROUNDS</span>
            <a
              className="text-link"
              href={audit.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Round {round} source <ArrowUpRight className="inline-icon" />
            </a>
          </div>
        </header>

        <main className="benchmark-main">
          <section className="benchmark-hero benchmark-hero-compact">
            <div>
              <Link className="back-link" href="/">
                <ArrowLeft /> Back to manager
              </Link>
              <p className="section-code">CATEGORY C / ROUNDS 01–09 AUDIT</p>
              <h1>Every round,<br />side by side.</h1>
            </div>
            <div className="benchmark-brief">
              <FlaskConical />
              <h2>{MALATYA_C_EVENT.name}</h2>
              <p>
                Select any round to compare every official Swiss-Manager board
                against Freak Swiss. Each run loads the complete official history
                and removes only the players published as not paired in that round.
              </p>
              <dl>
                <div><dt>Starters</dt><dd>{MALATYA_C_EVENT.playerCount}</dd></div>
                <div><dt>Rounds</dt><dd>{MALATYA_C_EVENT.rounds}</dd></div>
                <div><dt>Selected</dt><dd>Round {round}</dd></div>
                <div><dt>Compared</dt><dd>{officialCount} allocations</dd></div>
              </dl>
            </div>
          </section>

          <nav className="round-switcher" aria-label="Select benchmark round">
            {MALATYA_C_ALL_ROUNDS.map((item) => (
              <Link
                key={item.round}
                href={`/benchmark?round=${item.round}`}
                className={item.round === round ? "is-active" : undefined}
                aria-current={item.round === round ? "page" : undefined}
              >
                <span>R{String(item.round).padStart(2, "0")}</span>
                <small>{MALATYA_C_EVENT.playerCount - item.unpairedSeeds.length} players</small>
              </Link>
            ))}
          </nav>

          <section
            className={`audit-verdict ${passed ? "audit-verdict-pass" : ""}`}
            aria-label={`Category C round ${round} audit verdict`}
          >
            <div className="audit-verdict-mark">
              {passed ? <Check /> : <CircleAlert />}
            </div>
            <div>
              <p className="section-code">
                ROUND {String(round).padStart(2, "0")} VERDICT /{" "}
                {passed ? "EXACT FIXTURE" : "DIFFERENCES FOUND"}
              </p>
              <h2>
                {audit.stats.sameMatchupAnywhere} of {officialCount} official
                matchups are reproduced.
              </h2>
              <p>
                {audit.unpairedSeeds.length === 0
                  ? "No player was published as skipped or withdrawn for this round."
                  : `${audit.unpairedSeeds.length} published not-paired player${audit.unpairedSeeds.length === 1 ? " was" : "s were"} excluded before generation.`}
                {audit.officialByeSeed
                  ? ` The official one-point bye for seed #${audit.officialByeSeed} is locked so the table measures the remaining opponent and color choices.`
                  : " No pairing-allocated bye was published for this round."}
              </p>
            </div>
          </section>

          <section
            className="audit-metrics"
            aria-label={`Category C round ${round} comparison summary`}
          >
            <article><span>01</span><p>Players paired</p><strong>{audit.activePlayerCount}</strong></article>
            <article><span>02</span><p>Exact board + colors</p><strong>{audit.stats.exactBoardAndColors}</strong></article>
            <article><span>03</span><p>Same opponents / board</p><strong>{audit.stats.sameOpponentsSameBoard}</strong></article>
            <article><span>04</span><p>Same matchup anywhere</p><strong>{audit.stats.sameMatchupAnywhere}</strong></article>
            <article className="audit-metric-alert"><span>05</span><p>Skipped / withdrawn</p><strong>{audit.unpairedSeeds.length}</strong></article>
          </section>

          <section className="round-availability" aria-label="Skipped and withdrawn players">
            <div>
              <p className="section-code">ROUND {String(round).padStart(2, "0")} AVAILABILITY</p>
              <h2>Skipped or withdrawn</h2>
            </div>
            {audit.unpairedSeeds.length ? (
              <div className="availability-list">
                {audit.unpairedSeeds.map((seed) => (
                  <span key={seed}>{playerLabel(seed)}</span>
                ))}
              </div>
            ) : (
              <p className="availability-empty">All 257 starters were allocated.</p>
            )}
          </section>

          <section className="benchmark-section">
            <div className="benchmark-section-heading">
              <div>
                <p className="section-code">01 / ROUND {String(round).padStart(2, "0")} BOARD AUDIT</p>
                <h2>Official and Freak Swiss</h2>
              </div>
              <p>
                The left side is the published Swiss-Manager round. The right side
                is generated from every earlier official result, opponent, color,
                forfeit and bye, after applying this round&apos;s availability.
              </p>
            </div>

            <div className="benchmark-table-wrap">
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Board</th>
                    <th>Swiss-Manager official</th>
                    <th>Result</th>
                    <th>Freak Swiss output</th>
                    <th>Comparison</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.rows.map((row) => (
                    <tr key={row.official.board}>
                      <td className="board-cell">
                        {row.official.blackSeed === null
                          ? "BYE"
                          : String(row.official.board).padStart(3, "0")}
                      </td>
                      <td>
                        <div className="pairing-stack">
                          <span><i className="color-chip color-white" />{playerLabel(row.official.whiteSeed)}</span>
                          <span><i className="color-chip color-black" />{playerLabel(row.official.blackSeed)}</span>
                        </div>
                      </td>
                      <td className="result-cell">{resultLabel(row.official.result)}</td>
                      <td>
                        <div className="pairing-stack">
                          <span><i className="color-chip color-white" />{playerLabel(row.generated?.whiteSeed)}</span>
                          <span><i className="color-chip color-black" />{playerLabel(row.generated?.blackSeed)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`audit-status status-${row.status}`}>
                          {row.status === "exact" && <Check />}
                          {statusCopy(row.status, row.matchup?.board)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="benchmark-section">
            <div className="benchmark-section-heading">
              <div>
                <p className="section-code">02 / COMPLETE CATEGORY C STARTING LIST</p>
                <h2>All 257 players</h2>
              </div>
              <p>
                The final column shows each player&apos;s published availability
                for the currently selected round.
              </p>
            </div>

            <div className="benchmark-table-wrap">
              <table className="benchmark-table roster-table">
                <thead>
                  <tr><th>Seed</th><th>Player</th><th>FIDE ID</th><th>Rating</th><th>Round {round}</th></tr>
                </thead>
                <tbody>
                  {MALATYA_C_PLAYERS.map((player) => {
                    const hasRating = player.rating > 0;
                    const isBye = player.seed === audit.officialByeSeed;
                    const isUnpaired = unpairedSet.has(player.seed);
                    const state = isUnpaired
                      ? "Not paired"
                      : isBye
                        ? "Pairing bye"
                        : "Paired";
                    const stateClass = isUnpaired
                      ? "withdrawn"
                      : isBye
                        ? "pairing-bye"
                        : "paired";
                    return (
                      <tr key={player.seed}>
                        <td className="board-cell">{String(player.seed).padStart(3, "0")}</td>
                        <td className="player-name-cell">{player.name}</td>
                        <td>{player.fideId}</td>
                        <td>{hasRating ? player.rating : "—"}</td>
                        <td>
                          <span className={`roster-state roster-${stateClass}`}>
                            {state}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="benchmark-section benchmark-reference">
            <div className="benchmark-section-heading">
              <div>
                <p className="section-code">03 / CATEGORY A REFERENCE</p>
                <h2>Baku acceleration explains the earlier result</h2>
              </div>
              <p>
                Category A remains a reference only; the nine-round audit above
                uses the normal-Swiss Category C event.
              </p>
            </div>
            <div className="audit-metrics audit-metrics-reference">
              <article><span>A</span><p>System</p><strong>Baku</strong></article>
              <article><span>01</span><p>Players</p><strong>{MALATYA_EVENT.playerCount}</strong></article>
              <article><span>02</span><p>Boards</p><strong>{MALATYA_ROUND_ONE.length}</strong></article>
              <article><span>03</span><p>Same matchup</p><strong>{categoryAAudit.stats.sameMatchupAnywhere}</strong></article>
              <article className="audit-metric-alert"><span>04</span><p>Different</p><strong>{categoryAAudit.stats.differentMatchups}</strong></article>
            </div>
            <a className="text-link benchmark-source-link" href={MALATYA_SOURCE_URL} target="_blank" rel="noreferrer">
              Open Category A source <ArrowUpRight className="inline-icon" />
            </a>
          </section>

          <footer className="benchmark-footer">
            <p>
              Scope: all nine published Category C rounds, with each round&apos;s
              not-paired players excluded. This is an engineering audit, not FIDE
              certification.
            </p>
            <div className="benchmark-footer-links">
              <a href={audit.sourceUrl} target="_blank" rel="noreferrer">
                Round {round} pairings <ArrowUpRight />
              </a>
              <a href={MALATYA_C_CHESS_RESULTS_URL} target="_blank" rel="noreferrer">
                Chess-Results record <ArrowUpRight />
              </a>
            </div>
          </footer>
        </main>
      </section>
    </div>
  );
}
