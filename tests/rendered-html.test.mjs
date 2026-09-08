import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("emits a Cloudflare Worker entrypoint", async () => {
  const workerPath = fileURLToPath(
    new URL("../dist/server/index.js", import.meta.url),
  );
  const source = await readFile(workerPath, "utf8");

  assert.match(source, /from ["']cloudflare:workers["']/);
  assert.match(source, /async fetch\(request, env, ctx\)/);
  assert.match(source, /export \{ [^}]+ as default \}/);
});
