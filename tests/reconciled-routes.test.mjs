import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
for (const file of (await readdir(`${root}/drizzle`)).filter(f => f.endsWith('.sql')).sort()) {
  database.exec(await readFile(`${root}/drizzle/${file}`, 'utf8'));
}
function prepare(sql, args = []) {
  return {
    bind: (...values) => prepare(sql, values),
    first: async () => database.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: database.prepare(sql).all(...args), success: true }),
    run: async () => ({ success: true, meta: database.prepare(sql).run(...args) }),
  };
}
globalThis.__freakRouteDatabase = {
  prepare,
  async batch(statements) {
    database.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      database.exec('COMMIT');
      return result;
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  },
};
globalThis.__freakRouteCookies = new Map();
const vite = await createServer({
  configFile: false, root, appType: 'custom',
  resolve: { alias: { '@': root, 'next/headers': '/__freak_test_headers__.ts' } },
  server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: 'route-test-runtime', enforce: 'pre',
    resolveId(id) { if (id === '/__freak_test_headers__.ts') return '\0test-headers'; },
    load(id) {
      if (id === '\0test-headers') return 'export async function cookies() { return {get: name => {const value = globalThis.__freakRouteCookies.get(name); return value ? {value} : undefined;}}; }';
      if (id === `${root}db/raw.ts` || id === `${root}/db/raw.ts`) return 'export function getDatabase() { return globalThis.__freakRouteDatabase; }';
    },
  }],
});
after(async () => { await vite.close(); database.close(); delete globalThis.__freakRouteDatabase; delete globalThis.__freakRouteCookies; });
const register = await vite.ssrLoadModule('/app/api/auth/register/route.ts');
const login = await vite.ssrLoadModule('/app/api/auth/login/route.ts');
const manager = await vite.ssrLoadModule('/app/api/manager/route.ts');
const legacyJoin = await vite.ssrLoadModule('/app/api/guest/join-tournament/route.ts');
const legacyWithdraw = await vite.ssrLoadModule('/app/api/player/withdraw/route.ts');
async function post(route, body, cookie = '') {
  globalThis.__freakRouteCookies = new Map(cookie.split(';').filter(Boolean).map(p => p.trim().split('=')));
  const response = await route.POST(new Request('https://test.invalid/api/manager', {
    method: 'POST', headers: {'content-type': 'application/json', cookie}, body: JSON.stringify(body),
  }));
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', data: await response.json() };
}

test('real registration/login and owner controls work against a fully migrated database', async () => {
  const registration = await post(register, {displayName:'Organizer',email:'owner@example.test',password:'long-test-password'});
  assert.equal(registration.status, 200, JSON.stringify(registration.data));
  assert.match(registration.cookie, /freak_swiss_session=/);
  assert.equal((await post(register, {displayName:'Organizer',email:'owner@example.test',password:'long-test-password'})).status, 409);
  assert.equal((await post(login, {email:'owner@example.test',password:'wrong-password'})).status, 401);
  const signedIn = await post(login, {email:'owner@example.test',password:'long-test-password'});
  assert.equal(signedIn.status, 200);
  const made = await post(manager, {action:'create_tournament',name:'Owner event',rounds:5,visibility:'official'}, signedIn.cookie);
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const event = database.prepare('SELECT * FROM tournaments WHERE id = ?').get(made.data.tournamentId);
  assert.equal(event.visibility, 'community');
  assert.equal(event.owner_email, 'owner@example.test');
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM moderators').get().n, 0);
  assert.equal((await post(manager, {action:'delete_account',email:'someone@example.test'}, signedIn.cookie)).status, 403);
  assert.equal((await post(manager, {action:'set_tournament_archived',tournamentId:event.id,archived:true})).status, 401);
  const other = await post(register, {displayName:'Other',email:'other@example.test',password:'another-test-password'});
  assert.equal((await post(manager, {action:'set_tournament_archived',tournamentId:event.id,archived:true}, other.cookie)).status, 403);

  const guest = await post(manager, {action:'join_tournament',joinCode:event.join_code,name:'Cookie Guest',rating:1500});
  assert.equal(guest.status, 201, JSON.stringify(guest.data));
  assert.match(guest.cookie, /freak_swiss_player_session=/);
  const repeated = await post(manager, {action:'join_tournament',joinCode:event.join_code,name:'Cookie Guest'}, guest.cookie);
  assert.equal(repeated.data.playerId, guest.data.playerId);
  assert.equal((await post(manager, {action:'self_withdraw',tournamentId:event.id})).status, 403);
  assert.equal((await post(manager, {action:'self_withdraw',tournamentId:event.id}, guest.cookie)).status, 200);
  assert.equal(database.prepare('SELECT withdrawn_from_round FROM players WHERE id = ?').get(guest.data.playerId).withdrawn_from_round, 1);

  const oldGuest = await post(legacyJoin, {joinCode:event.join_code,name:'Legacy Guest',rating:1400});
  assert.equal(oldGuest.status, 201, JSON.stringify(oldGuest.data));
  assert.ok(oldGuest.data.guestToken);
  assert.equal((await post(legacyWithdraw, {tournamentId:event.id,guestToken:oldGuest.data.guestToken,confirm:true})).status, 200);
  assert.equal(database.prepare('SELECT withdrawn_from_round FROM players WHERE id = ?').get(oldGuest.data.playerId).withdrawn_from_round, 1);
  assert.equal((await post(manager, {action:'set_tournament_archived',tournamentId:event.id,archived:true}, signedIn.cookie)).status, 200);
  assert.equal((await post(legacyJoin, {joinCode:event.join_code,name:'Too Late'})).status, 409);
  assert.equal((await post(legacyWithdraw, {tournamentId:event.id,guestToken:oldGuest.data.guestToken,confirm:true})).status, 409);
  assert.equal((await post(manager, {action:'join_tournament',joinCode:event.join_code,name:'Too Late'})).status, 409);
});

test('public library separates official/community and never lists private tournaments', async () => {
  const signedIn = await post(login, {email:'owner@example.test',password:'long-test-password'});
  const hidden = await post(manager, {action:'create_tournament',name:'Private event',visibility:'private'}, signedIn.cookie);
  const community = await post(manager, {action:'create_tournament',name:'Community event',visibility:'community'}, signedIn.cookie);
  const archivedCommunity = await post(manager, {action:'create_tournament',name:'Archived community event',visibility:'community'}, signedIn.cookie);
  await post(manager, {action:'set_tournament_archived',tournamentId:archivedCommunity.data.tournamentId,archived:true}, signedIn.cookie);
  globalThis.__freakRouteCookies = new Map();
  const response = await manager.GET(new Request('https://test.invalid/api/manager'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.communityTournaments.some(t=>t.id===community.data.tournamentId));
  assert.ok(data.archivedCommunityTournaments.some(t=>t.id===archivedCommunity.data.tournamentId));
  assert.ok(!data.communityTournaments.some(t=>t.id===archivedCommunity.data.tournamentId));
  assert.ok(data.archivedCommunityTournaments.every(t=>t.visibility==='community' && t.archivedAt));
  assert.ok(data.archivedOfficialTournaments.every(t=>t.visibility==='official' && t.archivedAt));
  assert.ok(!JSON.stringify(data).includes(hidden.data.tournamentId));
  assert.ok(!data.openTournaments.some(t=>t.id===community.data.tournamentId));
});
