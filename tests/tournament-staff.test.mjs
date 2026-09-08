import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("tournament pages show organizer and moderator names", async () => {
  const [route, manager, types, css] = await Promise.all([
    readFile(`${root}/app/api/manager/route.ts`, "utf8"),
    readFile(`${root}/app/tournament-manager.tsx`, "utf8"),
    readFile(`${root}/lib/tournament-types.ts`, "utf8"),
    readFile(`${root}/app/globals.css`, "utf8"),
  ]);

  assert.match(route, /SELECT display_name AS displayName FROM user_accounts WHERE email = \?/);
  assert.match(route, /organizerName: organizerRow\?\.displayName \?\? null/);
  assert.match(types, /organizerName: string \| null;/);
  assert.match(manager, /TOURNAMENT STAFF/);
  assert.match(manager, /<strong>Organizer<\/strong>[\s\S]*snapshot\.organizerName/);
  assert.match(manager, /<strong>Moderators<\/strong>[\s\S]*snapshot\.moderators\.map/);
  assert.match(css, /\.staff-line\s*\{[\s\S]*flex-wrap:\s*wrap/);
});
