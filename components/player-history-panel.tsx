import type { PlayerHistory } from "@/lib/player-history";
import { useLanguage } from "@/app/language-provider";

type Props = {
  history: PlayerHistory;
};

function formatScore(val: number) {
  return val.toFixed(1);
}

export function PlayerHistoryPanel({ history }: Props) {
  const { matches, wins, draws, losses, totalScore } = history;
  const { language } = useLanguage();
  const isTr = language === "tr";

  return (
    <div className="player-history-card">
      <div className="player-history-header">
        <div className="player-history-title-group">
          <span className="player-history-heading">
            {isTr ? "MAÇ & EŞLENDİRME GEÇMİŞİ" : "MATCH & PAIRING HISTORY"}
          </span>
        </div>
        <div className="player-history-stats">
          <span className="history-stat stat-score">
            {formatScore(totalScore)} {isTr ? "Pn" : "Pts"}
          </span>
          <span className="history-stat stat-record">
            <strong className="stat-w">{wins}{isTr ? "G" : "W"}</strong>
            <span className="stat-sep">-</span>
            <strong className="stat-d">{draws}{isTr ? "B" : "D"}</strong>
            <span className="stat-sep">-</span>
            <strong className="stat-l">{losses}{isTr ? "M" : "L"}</strong>
          </span>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="player-history-empty">
          {isTr ? "Henüz tur oynanmadı." : "No rounds played yet."}
        </div>
      ) : (
        <div className="player-history-scroll" tabIndex={0}>
          <table className="player-history-table">
            <thead>
              <tr>
                <th>{isTr ? "TUR" : "ROUND"}</th>
                <th>{isTr ? "MASA" : "BOARD"}</th>
                <th>{isTr ? "RENK" : "COLOR"}</th>
                <th>{isTr ? "RAKİP" : "OPPONENT"}</th>
                <th>{isTr ? "RAKİP ELO" : "OPP. ELO"}</th>
                <th>{isTr ? "SONUÇ" : "RESULT"}</th>
                <th>{isTr ? "PUAN" : "EARNED"}</th>
                <th>{isTr ? "TOPLAM" : "TOTAL"}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const opponentDisplay =
                  m.opponentName === "BYE" && isTr
                    ? "BAY"
                    : m.opponentName;

                return (
                  <tr key={m.roundNumber} className={`outcome-row outcome-${m.outcome}`}>
                    <td className="col-round">{isTr ? `T${m.roundNumber}` : `R${m.roundNumber}`}</td>
                    <td className="col-board">
                      {m.boardNumber !== null ? (isTr ? `Masa ${m.boardNumber}` : `Board ${m.boardNumber}`) : "—"}
                    </td>
                    <td className="col-color">
                      {m.color === "white" ? (
                        <span className="color-badge badge-white" title={isTr ? "Beyaz" : "White"}>
                          ⚪ {isTr ? "Beyaz" : "White"}
                        </span>
                      ) : m.color === "black" ? (
                        <span className="color-badge badge-black" title={isTr ? "Siyah" : "Black"}>
                          ⚫ {isTr ? "Siyah" : "Black"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="col-opponent">
                      {m.opponentRank && (
                        <span className="opp-rank">#{m.opponentRank} </span>
                      )}
                      <span className="opp-name">{opponentDisplay}</span>
                    </td>
                    <td className="col-opp-rating">
                      {m.opponentRating ? m.opponentRating : "—"}
                    </td>
                    <td className="col-result">
                      <span className={`result-tag tag-${m.outcome}`}>
                        {m.result}
                      </span>
                    </td>
                    <td className="col-earned font-mono">
                      {m.pointsEarned !== null ? `+${formatScore(m.pointsEarned)}` : "—"}
                    </td>
                    <td className="col-total font-mono font-bold">
                      {m.runningTotal !== null ? formatScore(m.runningTotal) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
