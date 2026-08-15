// Every identifier called inside cli/index.mjs must actually be bound.
//
// WHY THIS EXISTS. A rebase conflict resolution deleted
// `migrateLegacyGateCommands()` while keeping its call site in `cmdUpgrade()`.
// The module still imported and loaded cleanly — a ReferenceError inside a
// function body is a runtime error, not a parse error — so every existing test
// passed. `adev upgrade` would have thrown for every user, aborting before git
// hooks, session capture, and the managed gitignore block.
//
// No test drives cmdUpgrade() end to end (it prompts), so nothing caught it.
// This check is static and cheap: parse the module, collect declared names, and
// assert every locally-called identifier resolves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "cli", "index.mjs"), "utf8");

/** Names declared in the module: functions, consts, lets, imports, classes. */
function declaredNames(text) {
  const names = new Set();
  for (const re of [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  ]) {
    for (const m of text.matchAll(re)) names.add(m[1]);
  }
  // import { a, b as c } from "…"  /  import d from "…"
  for (const m of text.matchAll(/^import\s+([^;]+?)\s+from\s+["']/gm)) {
    const clause = m[1];
    for (const inner of clause.matchAll(/\{([^}]*)\}/g)) {
      for (const part of inner[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    const bare = clause.replace(/\{[^}]*\}/g, "").replace(/,/g, "").trim();
    if (bare && /^[A-Za-z_$][\w$]*$/.test(bare)) names.add(bare);
  }
  // Destructured bindings from a dynamic import:
  //   const { migrateAll } = await import("…")
  for (const m of text.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(":").pop().trim().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }

  // Renamed destructured parameters:
  //   async function f({ ask: askFn = ask } = {}) {…}
  for (const m of text.matchAll(/\{[^}]*?:\s*([A-Za-z_$][\w$]*)\s*(?:=[^,}]*)?[,}]/g)) {
    names.add(m[1]);
  }

  return names;
}

test("every locally-called identifier in cli/index.mjs is bound", () => {
  const declared = declaredNames(src);

  // Globals and built-ins that are legitimately unbound in the module text.
  const ambient = new Set([
    "require", "import", "process", "console", "JSON", "Object", "Array", "String",
    "Number", "Boolean", "Math", "Date", "Promise", "Error", "Map", "Set", "RegExp",
    "Buffer", "URL", "TextEncoder", "TextDecoder", "structuredClone", "fetch",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
    "parseInt", "parseFloat", "isNaN", "encodeURIComponent", "decodeURIComponent",
    "if", "for", "while", "switch", "catch", "return", "typeof", "await", "function",
    "super", "this", "new", "delete", "void", "do", "else", "try", "finally", "yield",
  ]);

  // Only `await name(` — a call the module makes on its own bindings. This is
  // deliberately narrow: it is the exact shape the deleted function was called
  // with, and it cannot be confused with shell text inside template literals,
  // function parameters, or method calls.
  //
  // Template literals are stripped first: cli/index.mjs emits bash containing
  // constructs like `adev_require_hook "$X"` that are not JS calls.
  const withoutTemplates = src.replace(/`(?:[^`\\]|\\.)*`/gs, "``");

  const called = new Set();
  for (const m of withoutTemplates.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    called.add(m[1]);
  }

  const unbound = [...called].filter((n) => !declared.has(n) && !ambient.has(n)).sort();

  assert.deepEqual(
    unbound,
    [],
    "identifiers called but never declared or imported in cli/index.mjs — " +
      "a ReferenceError waiting for the code path that reaches them:\n  " +
      unbound.join("\n  "),
  );
});
