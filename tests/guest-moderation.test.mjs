import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Superadmin guest controls support safe single and bulk removal", async () => {
  const [route, manager] = await Promise.all([
    readFile(`${root}/app/api/manager/route.ts`, "utf8"),
    readFile(`${root}/app/tournament-manager.tsx`, "utf8"),
  ]);

  assert.match(route, /action: \"bulk_delete_guests\"/);
  assert.match(route, /playerIds = Array\.from\(/);
  assert.match(route, /guest \$\{guest\.id\} removed; historical record preserved/);
  assert.match(route, /guest_expires_at = \?, guest_token_hash = NULL/);
  assert.match(manager, /Select all/);
  assert.match(manager, /Delete \$\{selectedGuests\.length\} selected/);
  assert.match(manager, /className=\"guest-select\"/);
});

test("global staff can opt into or out of a tournament delegation without becoming organizer", async () => {
  const [route, manager] = await Promise.all([
    readFile(`${root}/app/api/manager/route.ts`, "utf8"),
    readFile(`${root}/app/tournament-manager.tsx`, "utf8"),
  ]);

  assert.match(route, /body\.action === \"join_tournament_delegation\"/);
  assert.match(route, /globalRole !== \"superadmin\" && globalRole !== \"moderator\"/);
  assert.match(route, /The organizer is already shown as the tournament owner/);
  assert.match(manager, /Join delegation/);
  assert.match(manager, /Leave delegation/);
  assert.match(manager, /snapshot\.moderators\.map\(\(moderator\) => moderator\.displayName\)/);
});
