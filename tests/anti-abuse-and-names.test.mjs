import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
for (const file of (await readdir(`${root}/drizzle`)).filter((f) => f.endsWith(".sql")).sort()) {
  db.exec(await readFile(`${root}/drizzle/${file}`, "utf8"));
}

function prepare(sql, args = []) {
  const syncRun = () => ({ success: true, meta: db.prepare(sql).run(...args) });
  return {
    bind: (...values) => prepare(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args), success: true }),
    run: async () => syncRun(),
    syncRun,
  };
}

globalThis.__antiAbuseDb = {
  prepare,
  async batch(statements) {
    db.exec("BEGIN");
    try {
      const results = statements.map((st) => st.syncRun());
      db.exec("COMMIT");
      return results;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};

const cookiesStorage = new AsyncLocalStorage();
globalThis.__antiAbuseCookies = cookiesStorage;

const vite = await createServer({
  configFile: false,
  root,
  appType: "custom",
  resolve: { alias: { "@": root, "next/headers": "/__anti_abuse_headers__.ts" } },
  server: { middlewareMode: true, hmr: false },
  plugins: [
    {
      name: "anti-abuse-route-runtime",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__anti_abuse_headers__.ts") return "\0anti-abuse-headers";
      },
      load(id) {
        if (id === "\0anti-abuse-headers") {
          return `
            export async function cookies() {
              return {
                get: (name) => {
                  const val = globalThis.__antiAbuseCookies.getStore()?.get(name);
                  return val ? { value: val } : undefined;
                }
              };
            }
            export async function headers() {
              return {
                get: (name) => null
              };
            }
          `;
        }
        if (id === `${root}db/raw.ts` || id === `${root}/db/raw.ts`) {
          return "export function getDatabase() { return globalThis.__antiAbuseDb; }";
        }
      },
    },
  ],
});

after(async () => {
  await vite.close();
  db.close();
  delete globalThis.__antiAbuseDb;
  delete globalThis.__antiAbuseCookies;
});

const {
  isValidPersonName,
  normalizePersonName,
  PERSON_NAME_ERROR,
} = await vite.ssrLoadModule("/lib/person-name.ts");

const {
  BROWSER_ID_COOKIE,
  createBrowserToken,
  hashBrowserToken,
  isValidBrowserToken,
  cleanupExpiredAntiAbuse,
  getClientIp,
  recordVisitorLog,
} = await vite.ssrLoadModule("/lib/anti-abuse.ts");

const { BannedScreen } = await vite.ssrLoadModule("/components/banned-screen.tsx");

const register = await vite.ssrLoadModule("/app/api/auth/register/route.ts");
const login = await vite.ssrLoadModule("/app/api/auth/login/route.ts");
const manager = await vite.ssrLoadModule("/app/api/manager/route.ts");
const guestJoin = await vite.ssrLoadModule("/app/api/guest/join-tournament/route.ts");

async function post(route, body, cookie = "", headers = {}) {
  const store = new Map(
    cookie
      .split(";")
      .filter(Boolean)
      .map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k, v.join("=")];
      }),
  );
  const response = await cookiesStorage.run(store, () =>
    route.POST(
      new Request("https://test.invalid/api/test", {
        method: "POST",
        headers: { "content-type": "application/json", cookie, ...headers },
        body: JSON.stringify(body),
      }),
    ),
  );
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
    cookies: response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean),
  };
}

// ----------------------------------------------------------------------------
// 1. Name Validation Unit Tests
// ----------------------------------------------------------------------------
test("Name validation accepts valid Unicode names, Turkish letters, and normal spaces", () => {
  assert.equal(isValidPersonName("BLabla BLaBla bLa"), true);
  assert.equal(isValidPersonName("Çağrı Şahin"), true);
  assert.equal(isValidPersonName("İpek Öztürk"), true);
  assert.equal(isValidPersonName("Al"), true);
  assert.equal(isValidPersonName("Ömer Faruk"), true);
  assert.equal(isValidPersonName("Gülşen Çetin"), true);

  // Normalizing spaces
  const normalized = normalizePersonName("   Çağrı    Şahin   ");
  assert.equal(normalized, "Çağrı Şahin");
  assert.equal(isValidPersonName(normalized), true);
});

test("Name validation rejects numbers, symbols, punctuation, emoji, and short names", () => {
  assert.equal(isValidPersonName("A"), false); // too short
  assert.equal(isValidPersonName(""), false);
  assert.equal(isValidPersonName("   "), false);
  assert.equal(isValidPersonName("Çağrı 123"), false); // numbers
  assert.equal(isValidPersonName("Çağrı_Şahin"), false); // underscore
  assert.equal(isValidPersonName("Çağrı?"), false); // question mark
  assert.equal(isValidPersonName("Çağrı=Şahin"), false); // equals
  assert.equal(isValidPersonName("Çağrı 😀"), false); // emoji
  assert.equal(isValidPersonName("Çağrı ♟"), false); // emoji/chess symbol
  assert.equal(isValidPersonName("Çağrı-Şahin"), false); // hyphen punctuation
  assert.equal(isValidPersonName("Çağrı.Şahin"), false); // dot punctuation
  assert.equal(isValidPersonName("Çağrı\tŞahin"), false); // control char tab
  assert.equal(isValidPersonName("Çağrı\x00Şahin"), false); // control char null
  assert.equal(isValidPersonName("A".repeat(81), 80), false); // exceeds max length
});

test("Account registration rejects invalid names and accepts valid Turkish names", async () => {
  const badRes = await post(register, {
    displayName: "Hacker_123",
    email: "hacker@example.test",
    password: "secure-password-123",
  });
  assert.equal(badRes.status, 400);
  assert.equal(badRes.data.error, PERSON_NAME_ERROR);

  const goodRes = await post(register, {
    displayName: "  Çağrı    Şahin  ",
    email: "cagri@example.test",
    password: "secure-password-123",
  });
  assert.equal(goodRes.status, 200);
  const account = db.prepare("SELECT display_name FROM user_accounts WHERE email = ?").get("cagri@example.test");
  assert.equal(account.display_name, "Çağrı Şahin");
});

test("Guest registration enforces valid personal names", async () => {
  // Create a tournament
  const ownerRes = await post(register, {
    displayName: "Tournament Organizer",
    email: "organizer@example.test",
    password: "secure-password-123",
  });
  const ownerCookie = ownerRes.cookies[0]?.split(";")[0];
  const tRes = await post(manager, { action: "create_tournament", name: "Spring Open", rounds: 5 }, ownerCookie);
  assert.equal(tRes.status, 201);
  const tournamentId = tRes.data.tournamentId;

  // Invalid guest names
  assert.equal((await post(guestJoin, { tournamentId, name: "Guest_1" })).status, 400);
  assert.equal((await post(guestJoin, { tournamentId, name: "X" })).status, 400);
  assert.equal((await post(guestJoin, { tournamentId, name: "Guest?" })).status, 400);

  // Valid guest name with Turkish letters
  const validGuest = await post(guestJoin, { tournamentId, name: "  İpek    Öztürk " });
  assert.equal(validGuest.status, 201);
  const player = db.prepare("SELECT name FROM players WHERE id = ?").get(validGuest.data.playerId);
  assert.equal(player.name, "İpek Öztürk");
});

// ----------------------------------------------------------------------------
// 2. Anti-Abuse Browser Token & Hashing Tests
// ----------------------------------------------------------------------------
test("Browser identifier tokens are strong random tokens and only stored hashed in DB", async () => {
  const token = createBrowserToken();
  assert.equal(isValidBrowserToken(token), true);
  assert.equal(token.length, 43);

  const tokenHash = await hashBrowserToken(token);
  assert.equal(tokenHash.length, 64); // 256 bits hex
  assert.match(tokenHash, /^[0-9a-f]{64}$/);

  // When a user registers/logs in with a browser token, only browser_hash is saved in account_browser_links, never the raw token
  const testEmail = "browser-user@example.test";
  const regRes = await post(register, { displayName: "Browser User", email: testEmail, password: "secure-password-123" }, `${BROWSER_ID_COOKIE}=${token}`);
  assert.equal(regRes.status, 200);

  const storedLink = db.prepare("SELECT browser_hash FROM account_browser_links WHERE email = ?").get(testEmail);
  assert.equal(storedLink.browser_hash, tokenHash);
  // Verify raw token is NOT in the database
  const searchRaw = db.prepare("SELECT COUNT(*) as n FROM account_browser_links WHERE browser_hash = ?").get(token);
  assert.equal(searchRaw.n, 0);
});


// ----------------------------------------------------------------------------
// 3. Seven-Day Ban & Session Termination Tests
// ----------------------------------------------------------------------------
test("Banning an account ends active sessions and blocks matching browser for 7 days", async () => {
  delete process.env.SUPERADMIN_EMAIL;
  await post(register, { displayName: "Super Admin", email: "superadmin@example.test", password: "super-password-123" });
  process.env.SUPERADMIN_EMAIL = "superadmin@example.test";
  const adminLogin = await post(login, { email: "superadmin@example.test", password: "super-password-123" });
  const adminCookie = adminLogin.cookies.find((c) => c.includes("freak_swiss_session"))?.split(";")[0];


  // Create abusive account
  const abuseToken = createBrowserToken();
  const abuseHash = await hashBrowserToken(abuseToken);
  const abuseReg = await post(register, {
    displayName: "Abusive User",
    email: "abuser@example.test",
    password: "abuser-password-123",
  }, `${BROWSER_ID_COOKIE}=${abuseToken}`);
  assert.equal(abuseReg.status, 200);

  // Active session exists before ban
  const sessionBefore = db.prepare("SELECT COUNT(*) as n FROM auth_sessions WHERE email = 'abuser@example.test'").get().n;
  assert.ok(sessionBefore > 0);

  // Superadmin bans the account
  const banRes = await post(manager, {
    action: "set_account_banned",
    email: "abuser@example.test",
    banned: true,
    reason: "Severe abuse",
  }, adminCookie, { "cf-connecting-ip": "198.51.100.99" });
  assert.equal(banRes.status, 200);

  // 1. Active sessions are terminated
  const sessionAfter = db.prepare("SELECT COUNT(*) as n FROM auth_sessions WHERE email = 'abuser@example.test'").get().n;
  assert.equal(sessionAfter, 0);

  // 2. Browser identifier is added to anti_abuse_records with 7-day expiry
  const abuseRecord = db.prepare("SELECT * FROM anti_abuse_records WHERE browser_hash = ?").get(abuseHash);
  assert.ok(abuseRecord);
  assert.equal(abuseRecord.banned_account_email, "abuser@example.test");
  assert.ok(new Date(abuseRecord.expires_at).getTime() > Date.now() + 6 * 24 * 60 * 60 * 1000);

  // 3. Attempting any API call from this banned browser is blocked with 403
  const blockedApi = await post(manager, { action: "create_tournament", name: "Blocked Event" }, `${BROWSER_ID_COOKIE}=${abuseToken}`);
  assert.equal(blockedApi.status, 403);
  assert.equal(blockedApi.data.banned, true);
  assert.equal(blockedApi.data.error, "Your access to this site has been blocked.");
});

test("Attempting to log into a banned account bans the attempting browser and terminates sessions", async () => {
  const freshBrowserToken = createBrowserToken();
  const freshBrowserHash = await hashBrowserToken(freshBrowserToken);

  const loginRes = await post(login, {
    email: "abuser@example.test",
    password: "abuser-password-123",
  }, `${BROWSER_ID_COOKIE}=${freshBrowserToken}`);

  assert.equal(loginRes.status, 403);
  assert.equal(loginRes.data.banned, true);

  // Fresh browser token is now banned for 7 days
  const record = db.prepare("SELECT * FROM anti_abuse_records WHERE browser_hash = ?").get(freshBrowserHash);
  assert.ok(record);
});

test("A wrong password for a banned email does not ban an innocent browser", async () => {
  const innocentToken = createBrowserToken();
  const innocentHash = await hashBrowserToken(innocentToken);
  const response = await post(login, {
    email: "abuser@example.test",
    password: "definitely-the-wrong-password",
  }, `${BROWSER_ID_COOKIE}=${innocentToken}`);

  assert.equal(response.status, 401);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM anti_abuse_records WHERE browser_hash = ?")
      .get(innocentHash).n,
    0,
  );
});

test("A verified banned login sets the identifier cookie that enforces the browser ban", async () => {
  const response = await post(login, {
    email: "abuser@example.test",
    password: "abuser-password-123",
  });

  assert.equal(response.status, 403);
  const cookie = response.cookies.find((value) => value?.startsWith(`${BROWSER_ID_COOKIE}=`));
  assert.ok(cookie);
  const rawToken = cookie.split(";", 1)[0].split("=", 2)[1];
  const browserHash = await hashBrowserToken(rawToken);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM anti_abuse_records WHERE browser_hash = ?")
      .get(browserHash).n,
    1,
  );
});

test("Anti-abuse records expire after seven days and are cleaned up", async () => {
  const expiredToken = createBrowserToken();
  const expiredHash = await hashBrowserToken(expiredToken);

  // Insert record expired in the past
  const pastDate = new Date(Date.now() - 1000).toISOString();
  db.prepare(`
    INSERT INTO anti_abuse_records (id, browser_hash, banned_account_email, ip, reason, expires_at, created_at)
    VALUES ('test-exp-1', ?, 'expired@example.test', '127.0.0.1', 'Expired ban', ?, ?)
  `).run(expiredHash, pastDate, pastDate);

  // Run cleanup
  await cleanupExpiredAntiAbuse(globalThis.__antiAbuseDb, new Date());

  // Record is removed
  const check = db.prepare("SELECT COUNT(*) as n FROM anti_abuse_records WHERE id = 'test-exp-1'").get().n;
  assert.equal(check, 0);

  // Browser is no longer blocked
  const res = await post(guestJoin, { joinCode: "NOTFND", name: "Valid Player" }, `${BROWSER_ID_COOKIE}=${expiredToken}`);
  // Returns 404 for missing tournament code instead of 403 ban
  assert.equal(res.status, 404);
});

// ----------------------------------------------------------------------------
// 4. Shared-IP Non-Blocking Tests
// ----------------------------------------------------------------------------
test("Shared-IP non-blocking: another user on the same IP is NOT blocked", async () => {
  const sharedIp = "203.0.113.50";
  const bannedBrowser = createBrowserToken();
  const innocentBrowser = createBrowserToken();

  // Ban user on browser A with sharedIp
  const bannedHash = await hashBrowserToken(bannedBrowser);
  const weekFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO anti_abuse_records (id, browser_hash, banned_account_email, ip, reason, expires_at, created_at)
    VALUES ('shared-ip-ban', ?, 'club-troll@example.test', ?, 'Disruption', ?, ?)
  `).run(bannedHash, sharedIp, weekFuture, new Date().toISOString());

  // Browser A on shared IP is blocked
  const blockedRes = await post(guestJoin, { joinCode: "ANYCODE", name: "Troll User" }, `${BROWSER_ID_COOKIE}=${bannedBrowser}`, { "cf-connecting-ip": sharedIp });
  assert.equal(blockedRes.status, 403);
  assert.equal(blockedRes.data.banned, true);

  // Browser B on the EXACT SAME shared IP is NOT blocked
  const innocentRes = await post(register, {
    displayName: "Innocent Club Member",
    email: "innocent@example.test",
    password: "secure-password-123",
  }, `${BROWSER_ID_COOKIE}=${innocentBrowser}`, { "cf-connecting-ip": sharedIp });
  assert.equal(innocentRes.status, 200);
});

test("Forwarded IP headers are ignored when Cloudflare did not provide an address", () => {
  const request = new Request("https://test.invalid/", {
    headers: {
      "x-forwarded-for": "203.0.113.99",
      "x-real-ip": "203.0.113.98",
    },
  });
  assert.equal(getClientIp(request), "127.0.0.1");
});

test("Repeated blocked requests are logged at most once per IP and path per minute", async () => {
  const telemetry = {
    ip: "198.51.100.42",
    userAgent: "Test Browser",
    method: "GET",
    path: "/blocked",
    referer: null,
    country: null,
    city: null,
    region: null,
    latitude: null,
    longitude: null,
  };
  await recordVisitorLog(globalThis.__antiAbuseDb, telemetry);
  await recordVisitorLog(globalThis.__antiAbuseDb, telemetry);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM visitor_logs WHERE ip = ? AND path = ?")
      .get(telemetry.ip, telemetry.path).n,
    1,
  );
});

test("Kicking an accountless guest bans its linked browser for seven days", async () => {
  const adminLogin = await post(login, {
    email: "superadmin@example.test",
    password: "super-password-123",
  });
  const adminCookie = adminLogin.cookies.find((value) => value?.includes("freak_swiss_session"))?.split(";", 1)[0];
  const event = await post(manager, {
    action: "create_tournament",
    name: "Guest Security Open",
    rounds: 5,
  }, adminCookie);
  assert.equal(event.status, 201);

  const guestToken = createBrowserToken();
  const guestHash = await hashBrowserToken(guestToken);
  const joined = await post(manager, {
    action: "join_tournament",
    tournamentId: event.data.tournamentId,
    name: "Guest Troublemaker",
  }, `${BROWSER_ID_COOKIE}=${guestToken}`);
  assert.equal(joined.status, 201);

  const kicked = await post(manager, {
    action: "kick_guest",
    tournamentId: event.data.tournamentId,
    playerId: joined.data.playerId,
  }, adminCookie);
  assert.equal(kicked.status, 200);
  const record = db.prepare(
    "SELECT expires_at FROM anti_abuse_records WHERE browser_hash = ?",
  ).get(guestHash);
  assert.ok(record);
  assert.ok(new Date(record.expires_at).getTime() > Date.now() + 6 * 24 * 60 * 60 * 1000);
});

// ----------------------------------------------------------------------------
// 5. Banned Screen HTML Content & Privacy Compliance Tests
// ----------------------------------------------------------------------------
test("Banned screen renders required messaging without exposing ban expiry, passwords, or emails", () => {
  const telemetry = {
    ip: "198.51.100.77",
    city: "Istanbul",
    region: "Marmara",
    country: "Turkey",
    latitude: "41.0082",
    longitude: "28.9784",
    path: "/api/manager",
    userAgent: "Mozilla/5.0 TestBrowser",
  };

  const html = renderToStaticMarkup(createElement(BannedScreen, { telemetry }));

  // Required messages
  assert.match(html, /YOU ARE BANNED/);
  assert.match(html, /Your access to this site has been blocked\./);
  assert.match(html, /Current IP:.*198\.51\.100\.77/);
  assert.match(html, /Coordinates:.*41\.0082, 28\.9784/);
  assert.match(html, /Security information may be retained and shared with authorities where legally required\./);

  // Prohibited disclosures
  assert.doesNotMatch(html, /ban.*date/i);
  assert.doesNotMatch(html, /expir/i);
  assert.doesNotMatch(html, /password/i);
  assert.doesNotMatch(html, /@/); // No email exposure
  assert.doesNotMatch(html, /cookie.*consent/i); // No automatic cookie consent popup
});

test("Banned screen escapes displayed security values", () => {
  const html = renderToStaticMarkup(createElement(BannedScreen, {
    telemetry: {
      ip: '<img src=x onerror="alert(1)">',
      city: "<script>alert(1)</script>",
    },
  }));
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img/);
});

test("Unbanning an account deletes the record from moderation_accounts and clears all linked anti-abuse records", async () => {
  const adminLogin = await post(login, { email: "superadmin@example.test", password: "super-password-123" });
  const adminCookie = adminLogin.cookies.find((c) => c.includes("freak_swiss_session"))?.split(";")[0];

  // Verify moderation_accounts has the banned record
  const modBefore = db.prepare("SELECT * FROM moderation_accounts WHERE email = 'abuser@example.test'").get();
  assert.ok(modBefore);
  assert.equal(modBefore.status, "banned");

  // Unban the account
  const unbanRes = await post(manager, {
    action: "set_account_banned",
    email: "abuser@example.test",
    banned: false,
  }, adminCookie);
  assert.equal(unbanRes.status, 200);

  // 1. Record must be completely deleted from moderation_accounts (the ban list)
  const modAfter = db.prepare("SELECT * FROM moderation_accounts WHERE email = 'abuser@example.test'").get();
  assert.equal(modAfter, undefined);

  // 2. Anti-abuse records for the banned account must be deleted
  const antiAbuseAccount = db.prepare("SELECT COUNT(*) as n FROM anti_abuse_records WHERE banned_account_email = 'abuser@example.test'").get().n;
  assert.equal(antiAbuseAccount, 0);

  // 3. Linked browsers are unbanned from anti_abuse_records
  const linkedBrowserBans = db.prepare(`
    SELECT COUNT(*) as n FROM anti_abuse_records
    WHERE browser_hash IN (SELECT browser_hash FROM account_browser_links WHERE email = 'abuser@example.test')
  `).get().n;
  assert.equal(linkedBrowserBans, 0);
});
