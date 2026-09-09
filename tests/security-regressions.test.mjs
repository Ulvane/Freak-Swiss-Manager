import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { createServer } from 'vite';

// Exercise real handlers and SQL against an isolated, fully migrated database.
const root = fileURLToPath(new URL('..', import.meta.url));
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for (const file of (await readdir(`${root}/drizzle`)).filter(f => f.endsWith('.sql')).sort()) {
  db.exec(await readFile(`${root}/drizzle/${file}`, 'utf8'));
}
function prepare(sql, args = []) {
  const syncRun = () => ({ success: true, meta: db.prepare(sql).run(...args) });
  return {
    bind: (...values) => prepare(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args), success: true }),
    run: async () => syncRun(), syncRun,
  };
}
globalThis.__securityDatabase = {
  prepare,
  async batch(statements) {
    db.exec('BEGIN');
    try {
      const results = statements.map(statement => statement.syncRun());
      db.exec('COMMIT');
      return results;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const cookies = new AsyncLocalStorage();
globalThis.__securityCookies = cookies;
const vite = await createServer({
  configFile: false, root, appType: 'custom',
  resolve: { alias: { '@': root, 'next/headers': '/__security_headers__.ts' } },
  server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: 'security-route-runtime', enforce: 'pre',
    resolveId(id) { if (id === '/__security_headers__.ts') return '\0security-headers'; },
    load(id) {
      if (id === '\0security-headers') return 'export async function cookies() { return {get: name => {const value = globalThis.__securityCookies.getStore()?.get(name); return value ? {value} : undefined;}}; }';
      if (id === `${root}db/raw.ts` || id === `${root}/db/raw.ts`) return 'export function getDatabase() { return globalThis.__securityDatabase; }';
    },
  }],
});
const previousSuperadmin = process.env.SUPERADMIN_EMAIL;
after(async () => {
  await vite.close(); db.close();
  delete globalThis.__securityDatabase; delete globalThis.__securityCookies;
  if (previousSuperadmin === undefined) delete process.env.SUPERADMIN_EMAIL;
  else process.env.SUPERADMIN_EMAIL = previousSuperadmin;
});
const register = await vite.ssrLoadModule('/app/api/auth/register/route.ts');
const login = await vite.ssrLoadModule('/app/api/auth/login/route.ts');
const logout = await vite.ssrLoadModule('/app/api/auth/logout/route.ts');
const manager = await vite.ssrLoadModule('/app/api/manager/route.ts');
const legacyJoin = await vite.ssrLoadModule('/app/api/guest/join-tournament/route.ts');
async function post(route, body, cookie = '', headers = {}) {
  const store = new Map(cookie.split(';').filter(Boolean).map(p => p.trim().split('=')));
  const response = await cookies.run(store, () => route.POST(new Request('https://test.invalid/api/test', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify(body),
  })));
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', data: await response.json() };
}
async function account(label) {
  const email = `${label}@example.test`;
  const result = await post(register, { displayName: label, email, password: 'secure-test-password' });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { email, cookie: result.cookie };
}
async function event(label, limit = 2) {
  const owner = await account(label);
  const result = await post(manager, { action: 'create_tournament', name: label, playerLimit: limit }, owner.cookie);
  assert.equal(result.status, 201);
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.data.tournamentId);
}

test('public registration cannot claim the configured superadmin email', async () => {
  process.env.SUPERADMIN_EMAIL = 'reserved-admin@example.test';
  const result = await post(register, { email: process.env.SUPERADMIN_EMAIL, displayName: 'Impostor', password: 'attacker-password' });
  assert.equal(result.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_credentials WHERE email = ?').get(process.env.SUPERADMIN_EMAIL).n, 0);
  delete process.env.SUPERADMIN_EMAIL;
});

test('an existing identity without credentials cannot be reclaimed through registration', async () => {
  db.prepare('INSERT INTO user_accounts VALUES (?, ?, ?, ?)').run('legacy-owner@example.test', 'Original owner', '2026-01-01', '2026-01-01');
  const result = await post(register, { email: 'legacy-owner@example.test', displayName: 'Impostor', password: 'attacker-password' });
  assert.equal(result.status, 409);
  assert.equal(db.prepare('SELECT display_name FROM user_accounts WHERE email = ?').get('legacy-owner@example.test').display_name, 'Original owner');
});

test('login and mutations reject cross-origin requests and form-compatible content types', async () => {
  const owner = await account('csrf-owner');
  const credentials = { email: owner.email, password: 'secure-test-password' };
  assert.equal((await post(login, credentials, '', { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post(login, credentials, '', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post(manager, { action: 'create_tournament', name: 'Injected tournament' }, owner.cookie, { origin: 'https://sibling.test.invalid' })).status, 403);
  assert.equal((await post(login, credentials, '', { origin: 'https://test.invalid' })).status, 200);
});

test('GET logout cannot delete a session', async () => {
  const owner = await account('logout-owner');
  const before = db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n;
  const response = await logout.GET(new Request('https://test.invalid/api/auth/logout', { headers: { cookie: owner.cookie } }));
  assert.equal(response.status, 405);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, before);
});

test('legacy guest registration enforces the same player limit as the main endpoint', async () => {
  const tournament = await event('capacity-legacy');
  for (let i = 0; i < 2; i++) assert.equal((await post(manager, { action: 'join_tournament', tournamentId: tournament.id, name: `Player ${i}` })).status, 201);
  assert.equal((await post(manager, { action: 'join_tournament', tournamentId: tournament.id, name: 'Blocked player' })).status, 409);
  assert.equal((await post(legacyJoin, { tournamentId: tournament.id, name: 'Bypass player' })).status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players WHERE tournament_id = ?').get(tournament.id).n, 2);
});

test('simultaneous registrations cannot overfill a tournament', async () => {
  const tournament = await event('capacity-race');
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => post(manager, { action: 'join_tournament', tournamentId: tournament.id, name: `Concurrent ${i}` })));
  assert.equal(results.filter(r => r.status === 201).length, 2);
  assert.ok(results.every(r => r.status === 201 || r.status === 409));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players WHERE tournament_id = ?').get(tournament.id).n, 2);
});


test('concurrent bad passwords cannot bypass the seven-attempt lockout', async () => {
  const owner = await account('login-race');
  const results = await Promise.all(Array.from({ length: 16 }, () => post(login, { email: owner.email, password: 'wrong-password' })));
  assert.equal(results.filter(r => r.status === 401).length, 7);
  assert.equal(results.filter(r => r.status === 429).length, 9);
  assert.equal((await post(login, { email: owner.email, password: 'secure-test-password' })).status, 429);
  db.prepare('UPDATE auth_credentials SET locked_until = ? WHERE email = ?').run('2000-01-01T00:00:00.000Z', owner.email);
  assert.equal((await post(login, { email: owner.email, password: 'secure-test-password' })).status, 200);
});

test('large request bodies are rejected before registering an account', async () => {
  const result = await post(register, { email: 'oversize@example.test', displayName: 'A'.repeat(70000), password: 'secure-test-password' });
  assert.equal(result.status, 413);
});

test('an attacker-chosen but unissued player cookie is replaced', async () => {
  const tournament = await event('session-fixation');
  const planted = `freak_swiss_player_session=${'A'.repeat(43)}`;
  const result = await post(manager, { action: 'join_tournament', tournamentId: tournament.id, name: 'Guest player' }, planted);
  assert.equal(result.status, 201);
  assert.notEqual(result.cookie, planted);
  assert.equal((await post(manager, { action: 'self_withdraw', tournamentId: tournament.id }, planted)).status, 403);
  assert.equal((await post(manager, { action: 'self_withdraw', tournamentId: tournament.id }, result.cookie)).status, 200);
});

test('private links are intentionally public to link holders but exclude contact emails and join codes', async () => {
  const owner = await account('private-owner');
  const made = await post(manager, { action: 'create_tournament', name: 'Private linked event', visibility: 'private' }, owner.cookie);
  const response = await cookies.run(new Map(), () => manager.GET(new Request(`https://test.invalid/api/manager?t=${made.data.tournamentId}`)));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.snapshot.tournament.joinCode, null);
  assert.equal(payload.snapshot.canEdit, false);
  assert.ok(!JSON.stringify(payload).includes(owner.email));
});

test('return paths cannot redirect through backslashes, whitespace or foreign origins', async () => {
  const { safeReturnPath } = await vite.ssrLoadModule('/lib/safe-return-path.ts');
  for (const input of ['https://attacker.invalid', '//attacker.invalid', '/\\attacker.invalid', '/\t/attacker.invalid', 'javascript:alert(1)', ['//attacker.invalid']]) {
    assert.equal(safeReturnPath(input), '/', String(input));
  }
  assert.equal(safeReturnPath('/?t=event#round'), '/?t=event#round');
});

test('edge protection rejects bursts and unavailable limiters before routing', async () => {
  const { guardApiRequest } = await vite.ssrLoadModule('/lib/edge-security.ts');
  const calls = [];
  const limiter = { limit: async ({ key }) => { calls.push(key); return { success: calls.length <= 2 }; } };
  const env = { AUTH_RATE_LIMITER: limiter, WRITE_RATE_LIMITER: limiter, READ_RATE_LIMITER: limiter };
  const request = new Request('https://test.invalid/api/auth/login', { method: 'POST', headers: { 'cf-connecting-ip': '192.0.2.1', origin: 'https://test.invalid' } });
  assert.equal(await guardApiRequest(request, env), null);
  assert.equal(await guardApiRequest(request, env), null);
  const limited = await guardApiRequest(request, env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.deepEqual(calls, Array(3).fill('freak-swiss:192.0.2.1'));
  assert.equal((await guardApiRequest(request, {})).status, 503);
  assert.equal(await guardApiRequest(new Request('https://test.invalid/favicon.svg'), {}), null);
});

test('sensitive responses are not cached or frameable and keep stricter image policies', async () => {
  const { withSecurityHeaders } = await vite.ssrLoadModule('/lib/edge-security.ts');
  const response = withSecurityHeaders(new Request('https://test.invalid/api/manager'), new Response('{}', {
    headers: { 'content-security-policy': "script-src 'none'; sandbox", 'set-cookie': 'session=test; HttpOnly' },
  }));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /script-src 'none'; sandbox/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('set-cookie'), 'session=test; HttpOnly');
});
