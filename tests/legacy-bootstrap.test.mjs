import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const repair = await readFile(new URL('scripts/database/repair-empty-legacy-schema.sql', root), 'utf8');
function prototypeDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, rounds INTEGER DEFAULT 5 NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL);
    CREATE TABLE auth_credentials (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, credential_id TEXT NOT NULL, public_key TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));`);
  return db;
}
test('empty prototype repair retains original tables and allows the complete migration chain', async () => {
  const db = prototypeDatabase();
  try {
    db.exec(`BEGIN; ${repair} COMMIT;`);
    for (const f of (await readdir(new URL('drizzle/',root))).filter(f=>f.endsWith('.sql')).sort()) db.exec(await readFile(new URL(`drizzle/${f}`, root), 'utf8'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM legacy_empty_tournaments_20260907').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM legacy_empty_auth_credentials_20260907').get().n,0);
    db.prepare('SELECT password_hash,password_iterations FROM auth_credentials LIMIT 0').all();
    db.prepare('SELECT visibility,archived_at,owner_email FROM tournaments LIMIT 0').all();
    db.prepare('SELECT token_hash FROM guest_tokens LIMIT 0').all();
    db.prepare('SELECT token_hash FROM player_sessions LIMIT 0').all();
  } finally {db.close();}
});
test('prototype repair refuses nonempty tables without losing their records', () => {
  const db = prototypeDatabase();
  try {
    db.exec("INSERT INTO tournaments(name) VALUES ('Preserve me'); BEGIN;");
    assert.throws(()=>db.exec(repair), /CHECK constraint failed/);
    db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT name FROM tournaments').get().name,'Preserve me');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'legacy_empty_%'").get().n,0);
  } finally {db.close();}
});
