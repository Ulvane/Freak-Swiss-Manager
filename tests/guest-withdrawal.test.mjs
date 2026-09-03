import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const guestPlayers = await vite.ssrLoadModule("/lib/guest-players.ts");

test("creates guest ownership tokens with 256 bits of entropy", () => {
  const token = guestPlayers.createGuestPlayerToken();
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 40, "token should encode 32 random bytes");
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(token, guestPlayers.createGuestPlayerToken());
});

test("hashes guest tokens deterministically without storing raw values", async () => {
  const first = await guestPlayers.hashGuestPlayerToken("guest-token-value");
  const second = await guestPlayers.hashGuestPlayerToken("guest-token-value");
  const other = await guestPlayers.hashGuestPlayerToken("another-token-value");

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, other);
  assert.ok(!first.includes("guest-token-value"));
});

test("parses only well-formed guest player cookies", () => {
  const parsed = guestPlayers.parseGuestPlayerCookie(
    "tournament-123.Abcd1234_efgh-5678_ijkl",
  );
  assert.deepEqual(parsed, {
    tournamentId: "tournament-123",
    token: "Abcd1234_efgh-5678_ijkl",
  });

  assert.equal(guestPlayers.parseGuestPlayerCookie(null), null);
  assert.equal(guestPlayers.parseGuestPlayerCookie(""), null);
  assert.equal(guestPlayers.parseGuestPlayerCookie("no-separator"), null);
  assert.equal(guestPlayers.parseGuestPlayerCookie(".tokenonlyvalue123456"), null);
  assert.equal(
    guestPlayers.parseGuestPlayerCookie("tournament-123.short"),
    null,
  );
  assert.equal(
    guestPlayers.parseGuestPlayerCookie("tournament-123.has space inside it nope"),
    null,
  );
});

test("builds a scoped HttpOnly guest player cookie", () => {
  const secureCookie = guestPlayers.guestPlayerCookie("raw-token", "tournament-1", true);
  assert.match(secureCookie, /freak_swiss_guest=tournament-1\.raw-token/);
  assert.match(secureCookie, /HttpOnly/);
  assert.match(secureCookie, /SameSite=Lax/);
  assert.match(secureCookie, /Secure/);
  assert.match(secureCookie, /Path=\//);

  const insecureCookie = guestPlayers.guestPlayerCookie("raw-token", "tournament-1", false);
  assert.doesNotMatch(insecureCookie, /Secure/);
});

test("guest cookie value round-trips through the parser", () => {
  const token = guestPlayers.createGuestPlayerToken();
  const value = guestPlayers.guestPlayerCookieValue("tournament-xyz", token);
  assert.deepEqual(guestPlayers.parseGuestPlayerCookie(value), {
    tournamentId: "tournament-xyz",
    token,
  });
});

test("allows accountless guest join only through a valid join code", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /guestActions: ReadonlySet<string> = new Set\(\["join_tournament"\]\)/);
  assert.match(route, /WHERE id = \? AND UPPER\(join_code\) = \?/);
  assert.match(route, /Set-Cookie": guestPlayerCookie/);
  assert.match(route, /guest_expires_at,\s*\n\s*guest_token_hash, created_at/);
  // Guests can never register with a bare tournament id.
  assert.match(route, /else if \(directId && user\)/);
});

test("enforces registration rules server-side for every join", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /!tournament\.registrationOpen \|\|/);
  assert.match(route, /Number\(tournament\.currentRound\) > 0 \|\|/);
  assert.match(route, /tournament\.status === "archived" \|\|/);
  assert.match(route, /tournament\.status === "completed"/);
  assert.match(route, /Player name is too short/);
});

test("treats repeat joins as duplicates instead of creating new entries", async () => {
  const route = await source("app/api/manager/route.ts");

  // Account-based duplicate guard.
  assert.match(
    route,
    /SELECT id FROM players WHERE tournament_id = \? AND account_email = \?/,
  );
  // Guest duplicate guard reuses the cookie-bound token hash.
  assert.match(
    route,
    /WHERE tournament_id = \? AND guest_token_hash = \? AND account_email IS NULL/,
  );
});

test("identifies guest entries by cookie token hash, never by client id", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /resolveGuestPlayerId\(request, tournamentId\)/);
  assert.match(route, /parseGuestPlayerCookie\(cookieValue\(request, GUEST_PLAYER_COOKIE\)\)/);
  assert.match(route, /hashGuestPlayerToken\(parsed\.token\)/);
  // The withdrawal action resolves the player server-side; the request body
  // for it carries no playerId field at all.
  const withdrawAction = route.match(
    /action: "withdraw_player";\s*\n\s*tournamentId\?: string;\s*\n\s*status\?: "withdraw" \| "skip" \| "active";\s*\n\s*\}/,
  );
  assert.ok(withdrawAction, "withdraw_player accepts only tournamentId and status");
});

test("withdraw_player is authorized to the viewer's own entry only", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /if \(body\.action === "withdraw_player"\)/);
  assert.match(route, /You can only update your own player entry/);
  assert.match(
    route,
    /SELECT id FROM players WHERE tournament_id = \? AND account_email = \?/,
  );
});

test("self-withdrawal preserves history and only blocks future pairings", async () => {
  const route = await source("app/api/manager/route.ts");
  const schema = await source("db/schema.ts");

  // Historical rows live in dedicated tables that withdrawal never touches.
  assert.match(schema, /playerRoundStatuses = sqliteTable/);
  assert.match(schema, /pairings = sqliteTable/);
  // Withdrawal flips a flag and clears only future one-round statuses.
  assert.match(route, /UPDATE players SET withdrawn = 1, checked_in = 0/);
  assert.match(route, /DELETE FROM player_round_statuses\s*\n\s*WHERE tournament_id = \? AND player_id = \? AND round_number > \?/);
  // The pairing generator already filters withdrawn players out.
  assert.match(route, /const activePlayers = allPlayers\.filter\(\(player\) => !player\.withdrawn\)/);
});

test("keeps one-round skip and permanent withdrawal as distinct actions", async () => {
  const route = await source("app/api/manager/route.ts");

  const skipInsert = route.match(
    /INSERT INTO player_round_statuses\s*\n\s*\(id, tournament_id, player_id, round_number, status, created_at\)\s*\n\s*VALUES \(\?, \?, \?, \?, 'skip', \?\)/,
  );
  assert.ok(skipInsert, "self skip stores a one-round player_round_statuses row");
  assert.match(route, /status === "skip" \|\| status === "active"/);
  assert.match(route, /status === "withdraw"/);
});

test("keeps organizer restore and one-round controls intact", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /if \(body\.action === "set_player_withdrawn"\)/);
  assert.match(route, /UPDATE players SET withdrawn = \?, checked_in = 0/);
  assert.match(route, /if \(body\.action === "set_player_next_round_status"\)/);
});

test("tournament owners control their own tournament without site-wide rights", async () => {
  const route = await source("app/api/manager/route.ts");

  // Owner emails are resolved as tournament controllers.
  assert.match(route, /SELECT id, owner_email AS controller_email FROM tournaments/);
  // Any signed-in user may create a tournament.
  assert.match(route, /Sign in to create a tournament/);
  assert.doesNotMatch(route, /Only the configured superadmin can create tournaments/);
  // The creator is auto-assigned as a tournament-scoped moderator only.
  assert.match(route, /INSERT INTO tournament_moderators/);
  assert.match(route, /globalRole === "superadmin" \? "FEATURED" : "COMMUNITY"/);
  assert.match(route, /canCreateTournament: Boolean\(viewerEmail\)/);
});

test("guests are promoted to permanent records when round one starts", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /UPDATE players SET guest_expires_at = NULL/);
});

test("manager payloads expose join and withdraw capabilities", async () => {
  const route = await source("app/api/manager/route.ts");
  const types = await source("lib/tournament-types.ts");

  assert.match(types, /canWithdraw: boolean/);
  assert.match(route, /canWithdraw: Boolean\(/);
  assert.match(route, /canJoin: Boolean\(/);
  // Guests may join; a join no longer requires a signed-in viewer.
  assert.doesNotMatch(route, /canJoin: Boolean\(\s*\n?\s*viewerEmail &&/);
});

test("includes visibility in tournament reads with a COMMUNITY fallback", async () => {
  const route = await source("app/api/manager/route.ts");

  assert.match(route, /COALESCE\(visibility, 'COMMUNITY'\) AS visibility/);
  assert.match(route, /COALESCE\(t\.visibility, 'COMMUNITY'\) AS visibility/);
});
