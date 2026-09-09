import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("emits a Cloudflare Worker entrypoint", async () => {
  const workerPath = fileURLToPath(
    new URL("../dist/server/index.js", import.meta.url),
  );
  const source = await readFile(workerPath, "utf8");

  // Production minification can remove whitespace and rename parameters.
  const chunksUrl = new URL("../dist/server/_next/static/", import.meta.url);
  const chunks = await Promise.all((await readdir(chunksUrl)).filter(name => name.endsWith('.js'))
    .map(name => readFile(new URL(name, chunksUrl), 'utf8')));
  assert.ok([source, ...chunks].some(chunk => /from\s*["']cloudflare:workers["']/.test(chunk)),
    "worker bundle must import the Cloudflare runtime");
  assert.ok(/async fetch\([^)]*\)/.test(source), "worker must expose a fetch handler");
  assert.ok(/export\s*\{[^}]+ as default\s*\}/.test(source), "worker must have a default export");
});
