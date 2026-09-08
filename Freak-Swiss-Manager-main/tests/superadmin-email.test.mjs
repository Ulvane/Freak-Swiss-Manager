import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("assigns superadmin access by configured email without a setup code", async () => {
  const [authServer, registrationRoute, authPanel, environmentExample] =
    await Promise.all([
      source("app/auth-server.ts"),
      source("app/api/auth/register/route.ts"),
      source("app/auth/auth-panel.tsx"),
      source(".dev.vars.example"),
    ]);

  assert.match(authServer, /process\.env\.SUPERADMIN_EMAIL/);
  assert.doesNotMatch(authServer, /SUPERADMIN_SETUP_SECRET/);
  assert.doesNotMatch(registrationRoute, /setupCode|setup code/i);
  assert.doesNotMatch(authPanel, /setupCode|setup code/i);
  assert.doesNotMatch(environmentExample, /SUPERADMIN_SETUP_SECRET/);
});
