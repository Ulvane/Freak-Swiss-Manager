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
const { standingAward, StandingMarker } = await vite.ssrLoadModule("/components/standing-marker.tsx");
const final = { status: "completed", currentRound: 3, rounds: 3 };
const props = { rank: 1, tournament: final, hasResults: true, saving: false };

test("awards follow final standings only after the final result is saved", () => {
  assert.deepEqual([1, 2, 3, 4].map(rank => standingAward({ ...props, rank })), ["gold", "silver", "bronze", null]);
  assert.equal(standingAward({ ...props, saving: true }), "leader");
  assert.equal(standingAward({ ...props, rank: 2, saving: true }), null);
  assert.equal(standingAward({ ...props, tournament: { ...final, status: "active" } }), "leader");
  assert.equal(standingAward({ ...props, tournament: { ...final, currentRound: 2 } }), "leader");
});

test("an unplayed or draft tournament has no leader or podium", () => {
  assert.equal(standingAward({ ...props, hasResults: false }), null);
  assert.equal(standingAward({ ...props, tournament: { ...final, currentRound: 0, status: "draft" } }), null);
});

test("pixel awards retain accessible names and sharp edges", () => {
  for (const [rank, label] of [[1, "Tournament champion"], [2, "Second place"], [3, "Third place"]]) {
    const html = renderToStaticMarkup(React.createElement(StandingMarker, { ...props, rank }));
    assert.ok(html.includes(label));
    assert.match(html, /role="img"/);
    assert.match(html, /shape-rendering="crispEdges"/);
  }
});
