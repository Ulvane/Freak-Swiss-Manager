import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom", configFile: false, root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());

const { getPlayerHistory } = await vite.ssrLoadModule("/lib/player-history.ts");
const { PixelArrow } = await vite.ssrLoadModule("/components/pixel-arrow.tsx");
const { SmoothAccordion } = await vite.ssrLoadModule("/components/smooth-accordion.tsx");
const { translateText } = await vite.ssrLoadModule("/lib/i18n.ts");

test("getPlayerHistory calculates round-by-round pairings, opponents, colors, and results", () => {
  const players = [
    { id: "p1", name: "Alice", rating: 2000, seed: 1, withdrawn: false, withdrawnFromRound: null, checkedIn: true, nextRoundStatus: "active", isYou: false },
    { id: "p2", name: "Bob", rating: 1900, seed: 2, withdrawn: false, withdrawnFromRound: null, checkedIn: true, nextRoundStatus: "active", isYou: false },
    { id: "p3", name: "Charlie", rating: 1800, seed: 3, withdrawn: false, withdrawnFromRound: null, checkedIn: true, nextRoundStatus: "active", isYou: false },
  ];

  const pairings = [
    { id: "pair-1", roundNumber: 1, boardNumber: 1, whitePlayerId: "p1", blackPlayerId: "p2", result: "1-0", whiteName: "Alice", blackName: "Bob" },
    { id: "pair-2", roundNumber: 2, boardNumber: 1, whitePlayerId: "p3", blackPlayerId: "p1", result: "½-½", whiteName: "Charlie", blackName: "Alice" },
    { id: "pair-3", roundNumber: 3, boardNumber: 1, whitePlayerId: "p1", blackPlayerId: null, result: "1-BYE", whiteName: "Alice", blackName: null },
  ];

  const standings = [
    { rank: 1, playerId: "p1", name: "Alice", rating: 2000, score: 2.5, buchholz: 1.5, sonnebornBerger: 1.5 },
    { rank: 2, playerId: "p2", name: "Bob", rating: 1900, score: 1.0, buchholz: 2.5, sonnebornBerger: 0.5 },
    { rank: 3, playerId: "p3", name: "Charlie", rating: 1800, score: 0.5, buchholz: 2.5, sonnebornBerger: 1.25 },
  ];

  const history = getPlayerHistory("p1", players, pairings, standings, [], 3);
  assert.ok(history);
  assert.equal(history.player.name, "Alice");
  assert.equal(history.wins, 2); // 1-0 and 1-BYE
  assert.equal(history.draws, 1);
  assert.equal(history.losses, 0);
  assert.equal(history.totalScore, 2.5);
  assert.equal(history.matches.length, 3);

  // Round 1: Alice played White vs Bob, won 1-0
  assert.equal(history.matches[0].roundNumber, 1);
  assert.equal(history.matches[0].color, "white");
  assert.equal(history.matches[0].opponentName, "Bob");
  assert.equal(history.matches[0].opponentRank, 2);
  assert.equal(history.matches[0].result, "1-0");
  assert.equal(history.matches[0].outcome, "win");
  assert.equal(history.matches[0].pointsEarned, 1);
  assert.equal(history.matches[0].runningTotal, 1);

  // Round 2: Alice played Black vs Charlie, drew 1/2-1/2
  assert.equal(history.matches[1].roundNumber, 2);
  assert.equal(history.matches[1].color, "black");
  assert.equal(history.matches[1].opponentName, "Charlie");
  assert.equal(history.matches[1].opponentRank, 3);
  assert.equal(history.matches[1].result, "½-½");
  assert.equal(history.matches[1].outcome, "draw");
  assert.equal(history.matches[1].pointsEarned, 0.5);
  assert.equal(history.matches[1].runningTotal, 1.5);

  // Round 3: Alice had a 1-BYE
  assert.equal(history.matches[2].roundNumber, 3);
  assert.equal(history.matches[2].color, null);
  assert.equal(history.matches[2].opponentName, "BYE");
  assert.equal(history.matches[2].outcome, "bye");
  assert.equal(history.matches[2].pointsEarned, 1);
  assert.equal(history.matches[2].runningTotal, 2.5);
});

test("PixelArrow renders sharp 8-bit svg with currentColor", () => {
  const html = renderToStaticMarkup(React.createElement(PixelArrow, { direction: "down" }));
  assert.match(html, /shape-rendering="crispEdges"/);
  assert.match(html, /viewBox="0 0 20 9"/);
  assert.match(html, /fill="currentColor"/);
});

test("SmoothAccordion renders expandable wrapper with transition styles", () => {
  const htmlOpen = renderToStaticMarkup(
    React.createElement(SmoothAccordion, { isOpen: true },
      React.createElement("div", null, "History Content")
    )
  );
  assert.match(htmlOpen, /smooth-accordion/);
  assert.match(htmlOpen, /History Content/);
  assert.match(htmlOpen, /transition-duration:\s*550ms/);

  const htmlClosed = renderToStaticMarkup(
    React.createElement(SmoothAccordion, { isOpen: false },
      React.createElement("div", null, "History Content")
    )
  );
  assert.match(htmlClosed, /aria-hidden="true"/);
  assert.match(htmlClosed, /inert=""/);
  assert.doesNotMatch(htmlClosed, /is-expanded/);
});

test("translateText translates match history headers and result indicators to Turkish", () => {
  assert.equal(translateText("MATCH & PAIRING HISTORY", "tr"), "MAÇ & EŞLENDİRME GEÇMİŞİ");
  assert.equal(translateText("Match & Pairing History", "tr"), "Maç & Eşlendirme Geçmişi");
  assert.equal(translateText("ROUND", "tr"), "TUR");
  assert.equal(translateText("COLOR", "tr"), "RENK");
  assert.equal(translateText("OPPONENT", "tr"), "RAKİP");
  assert.equal(translateText("OPP. ELO", "tr"), "RAKİP ELO");
  assert.equal(translateText("EARNED", "tr"), "PUAN");
  assert.equal(translateText("TOTAL", "tr"), "TOPLAM");
  assert.equal(translateText("4 results remaining", "tr"), "4 sonuç kaldı");
  assert.equal(translateText("1 result remaining", "tr"), "1 sonuç kaldı");
  assert.equal(translateText("Rank #6", "tr"), "Sıra #6");
  assert.equal(translateText("0W - 1D - 0L", "tr"), "0G - 1B - 0M");
  assert.equal(translateText("R1", "tr"), "T1");
  assert.equal(translateText("Board 4", "tr"), "Masa 4");
});



const historyPlayers = [
  { id: "white", name: "White", rating: 2000, withdrawn: false, withdrawnFromRound: null },
  { id: "black", name: "Black", rating: 1900, withdrawn: false, withdrawnFromRound: null },
];

for (const [result, whitePoints, blackPoints] of [
  ["1-0", 1, 0], ["0-1", 0, 1], ["½-½", 0.5, 0.5],
  ["1F-0F", 1, 0], ["0F-1F", 0, 1], ["0F-0F", 0, 0], ["*", null, null],
]) {
  test(`history preserves scoring for both colors: ${result}`, () => {
    const pairings = [{ roundNumber: 1, boardNumber: 1, whitePlayerId: "white", blackPlayerId: "black", result }];
    for (const [id, expected] of [["white", whitePoints], ["black", blackPoints]]) {
      const history = getPlayerHistory(id, historyPlayers, pairings, [], [], 1);
      assert.equal(history.matches[0].pointsEarned, expected);
      assert.equal(history.matches[0].runningTotal, expected);
      assert.equal(history.totalScore, expected ?? 0);
      assert.deepEqual([history.wins, history.draws, history.losses], [Number(expected === 1), Number(expected === 0.5), Number(expected === 0)]);
    }
  });
}

test("history distinguishes byes, skipped rounds, withdrawal, and missing pairings", () => {
  const players = [{ ...historyPlayers[0], withdrawn: true, withdrawnFromRound: 4 }];
  const statuses = [
    { playerId: "white", roundNumber: 1, status: "bye" },
    { playerId: "white", roundNumber: 2, status: "skip" },
  ];
  const history = getPlayerHistory("white", players, [], [], statuses, 4);
  assert.deepEqual(history.matches.map((m) => [m.outcome, m.pointsEarned, m.runningTotal]), [
    ["bye", 1, 1], ["skip", 0, 1], ["unpaired", null, null], ["withdrawn", 0, 1],
  ]);
  assert.deepEqual([history.totalScore, history.wins, history.draws, history.losses], [1, 1, 0, 0]);
  assert.equal(getPlayerHistory("missing", players, [], [], statuses, 4), null);
});

test("recorded games take precedence over a round status or withdrawal", () => {
  const players = historyPlayers.map((p) => ({ ...p, withdrawn: true, withdrawnFromRound: 1 }));
  const pairings = [{ roundNumber: 1, boardNumber: 1, whitePlayerId: "white", blackPlayerId: "black", result: "½-½" }];
  const statuses = [{ playerId: "white", roundNumber: 1, status: "bye" }];
  const history = getPlayerHistory("white", players, pairings, [], statuses, 1);
  assert.equal(history.matches[0].outcome, "draw");
  assert.equal(history.totalScore, 0.5);
  assert.equal(history.wins, 0);
});
