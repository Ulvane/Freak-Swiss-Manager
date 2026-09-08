import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('translation settles without observer loops and preserves changing React text', () => {
  const provider = readFileSync(new URL('../app/language-provider.tsx', import.meta.url), 'utf8');
  let source = provider.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  source = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  let active = false;
  let pending = false;
  let callback;
  let language = 'en';
  let cleanup;
  let writes = 0;
  const node = {
    value: 'Round 1', parentElement: { closest: () => false },
    get data() { return this.value; },
    set data(value) { this.value = value; writes++; if (active) pending = true; },
  };
  const context = vm.createContext({
    React: { createElement: () => null },
    createContext: () => ({ Provider: {} }),
    useState: () => [language, () => {}],
    useMemo: fn => fn(),
    useEffect: fn => { cleanup = fn(); },
    readLanguage: () => language,
    translateText: (text, lang) => lang === 'tr' ? text.replace('Round', 'Tur') : text,
    document: { body: {}, documentElement: {}, createTreeWalker: () => { let done = false; return { nextNode: () => done ? null : (done = true, node) }; } },
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(fn) { callback = fn; }
      observe() { active = true; }
      disconnect() { active = false; pending = false; }
    },
  });
  vm.runInContext(source, context);
  const mount = () => vm.runInContext('LanguageProvider({children: null})', context);
  const flush = () => {
    let turns = 0;
    while (pending && turns++ < 5) { pending = false; callback(); }
    assert.equal(pending, false, 'observer must settle instead of starving rendering');
  };
  mount();
  assert.equal(writes, 0, 'English must not rewrite unchanged text');
  pending = true; flush();
  assert.equal(writes, 0);
  cleanup(); language = 'tr'; mount();
  assert.equal(node.data, 'Tur 1');
  node.data = 'Round 2'; flush();
  assert.equal(node.data, 'Tur 2', 'new React text must replace cached source');
  cleanup(); language = 'en'; mount();
  assert.equal(node.data, 'Round 2', 'switching back must restore current source');
  pending = true; flush();
});
