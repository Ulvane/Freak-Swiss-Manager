import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Superadmin sections use site-styled controls with a mobile touch layout", async () => {
  const [manager, css] = await Promise.all([
    readFile(`${root}/app/tournament-manager.tsx`, "utf8"),
    readFile(`${root}/app/globals.css`, "utf8"),
  ]);

  for (const section of ["Overview", "Accounts", "Moderators", "Guests", "Tokens", "Activity"]) {
    assert.match(manager, new RegExp(`value=\\"${section.toLowerCase()}\\"[^>]*><span>\\d{2}</span> ${section}`));
  }
  assert.match(css, /\.admin-tabs-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,/);
  assert.match(css, /\.admin-tabs-list \[data-slot="tabs-trigger"\]\[data-state="active"\]\s*\{[\s\S]*background:\s*var\(--red\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.admin-tabs-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /\.admin-tabs-list \[data-slot="tabs-trigger"\]\s*\{[\s\S]*min-height:\s*48px/);
});
