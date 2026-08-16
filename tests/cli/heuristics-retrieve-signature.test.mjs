// tests/cli/heuristics-retrieve-signature.test.mjs
//
// Tests for `--signature` on `adev heuristics retrieve` (lib/cli/heuristics.mjs).
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
// Task 7 — expose the library's `opts.signature` on the CLI verb. The ranking,
// low-floor exemption and budget allocation all live in
// lib/heuristics.mjs::retrieveHeuristics and are covered by
// tests/lib/heuristics-signature-retrieval.test.mjs. This suite covers the
// CLI boundary only: forwarding, degradation, and the two emit shapes.
//
// TWO EMIT SHAPES, DELIBERATELY DIFFERENT — do not collapse them:
//   ordinary empty result → {"count":0,"rendered":""}                  (2 keys)
//   retrieval threw       → {"count":0,"rendered":"","error":"<msg>"}  (3 keys)
//
// Which shape a BROKEN STORE produces is the two-key one. retrieveHeuristics
// swallows both readHeuristics failures in bare `catch {}`, so no filesystem
// condition reaches the CLI's catch — verified here by exhausting the obvious
// techniques (store dir as a file, a directory where a scope file belongs, the
// same for _global.md, chmod 000); every one emitted two keys at exit 0. The
// spec's Error Cases row is therefore correct about observable behavior, and
// the three-key shape is defensive coverage for an unexpected throw rather than
// the store-failure contract.
//
// The three-key shape is still pinned, because deleting a live emit site is a
// regression whether or not production currently reaches it. Reaching it needs
// a module customization hook (Node built-ins only) that shadows
// retrieveHeuristics. Both shapes are pinned below with SEPARATE assertions so
// neither can be collapsed into the other.
//
// FORWARDING IS NOT VALIDATION. `--signature` has no argument-error branch: a
// whitespace-only or otherwise malformed value is simply not forwarded, so the
// library sees no signature and the run degrades to "no match" at exit 0.
// Turning a no-match into an exit 1 would make an unfindable heuristic look
// like operator error.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const HEURISTICS_LIB_URL = pathToFileURL(join(PLUGIN_ROOT, "lib", "heuristics.mjs")).href;

const SIGNATURE = "validate-a15235f5";
const OTHER_SIGNATURE = "recover-b26346a6";

function makeTempProject() {
  const dir = createTempDir();
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  return dir;
}

const cleanup = cleanupTempDir;

/** Run `adev heuristics retrieve ...`, optionally with extra `node` arguments. */
function runRetrieveIn(dir, args, nodeArgs = []) {
  const r = spawnSync("node", [...nodeArgs, CLI, "heuristics", "retrieve", ...args], {
    encoding: "utf8",
    cwd: dir,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Serialize one entry in the format lib/heuristics.mjs::parseHeuristicsFile reads. */
function makeEntry({
  id,
  scope = "m",
  title = "Test heuristic",
  pattern = "Do the thing",
  confidence = "low",
  signature,
  created = "2026-05-15",
  updated = "2026-05-15",
}) {
  const lines = [
    "---",
    `id: ${id}`,
    `scope: ${scope}`,
    `title: ${title}`,
    `pattern: ${pattern}`,
    `confidence: ${confidence}`,
  ];
  if (signature !== undefined) lines.push(`signature: ${signature}`);
  lines.push(`created: ${created}`, `updated: ${updated}`, "evidence: []", "---");
  return lines.join("\n");
}

/** Write a scope file containing `entries` into a project's heuristic store. */
function seedScope(dir, scope, entries) {
  const dirPath = join(dir, ".context-index", "memory", "heuristics");
  mkdirSync(dirPath, { recursive: true });
  const body = `# Heuristics (scope: ${scope})\n\n${entries.join("\n\n")}\n`;
  writeFileSync(join(dirPath, `${scope}.md`), body);
}

/**
 * Install a module-customization hook that makes `retrieveHeuristics` throw,
 * and return the `node` arguments that activate it.
 *
 * This machinery exists because NO filesystem corruption can reach
 * `runRetrieve`'s catch block: `retrieveHeuristics` wraps both of its
 * `readHeuristics` calls in bare `catch {}`, so a missing directory, a file
 * where the store directory belongs, a directory where a scope file belongs,
 * and a chmod-000 store ALL produce the ordinary two-key empty result. The
 * hook is the only way to exercise the three-key shape from the CLI boundary,
 * and it uses node built-ins only (`node:module`'s `register`).
 *
 * The generated module re-exports the real library and shadows exactly one
 * export — `export *` skips names the shadowing module exports locally — so
 * every other import in lib/cli/heuristics.mjs still resolves to real code.
 */
function throwingRetrievalNodeArgs(dir, message) {
  const hookSource = [
    `const TARGET = ${JSON.stringify(HEURISTICS_LIB_URL)};`,
    `const MESSAGE = ${JSON.stringify(message)};`,
    "export async function load(url, context, nextLoad) {",
    "  if (url !== TARGET) return nextLoad(url, context);",
    "  const source = [",
    '    "export * from " + JSON.stringify(TARGET + "?real") + ";",',
    '    "export async function retrieveHeuristics() { throw new Error(" +',
    "      JSON.stringify(MESSAGE) + '); }',",
    '  ].join("\\n");',
    '  return { format: "module", source, shortCircuit: true };',
    "}",
  ].join("\n");
  writeFileSync(join(dir, "hooks.mjs"), hookSource);
  writeFileSync(
    join(dir, "register.mjs"),
    'import { register } from "node:module";\nregister("./hooks.mjs", import.meta.url);\n',
  );
  return ["--import", pathToFileURL(join(dir, "register.mjs")).href];
}

// ── Forwarding (Case 1) ──────────────────────────────────────────────────

test("--signature returns the matched entry in the default json format", () => {
  const dir = makeTempProject();
  try {
    // Deliberately `low`: the match must arrive through the library's low-floor
    // exemption, so a run that silently dropped the flag would return 0, not 1.
    seedScope(dir, "m", [makeEntry({ id: "sig-aaaaaaa1", signature: SIGNATURE })]);

    const r = runRetrieveIn(dir, ["--module", "m", "--signature", SIGNATURE]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.count, 1, r.stdout);
  } finally {
    cleanup(dir);
  }
});

test("the same store without --signature returns nothing — the flag is what matched", () => {
  // Pins that Case 1's count comes from the forwarded signature and not from
  // an entry that ordinary retrieval would have returned anyway.
  const dir = makeTempProject();
  try {
    seedScope(dir, "m", [makeEntry({ id: "sig-aaaaaaa1", signature: SIGNATURE })]);

    const r = runRetrieveIn(dir, ["--module", "m"]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).count, 0, r.stdout);
  } finally {
    cleanup(dir);
  }
});

test("a non-matching --signature returns nothing and still exits 0", () => {
  const dir = makeTempProject();
  try {
    seedScope(dir, "m", [makeEntry({ id: "sig-aaaaaaa1", signature: SIGNATURE })]);

    const r = runRetrieveIn(dir, ["--module", "m", "--signature", OTHER_SIGNATURE]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).count, 0, r.stdout);
  } finally {
    cleanup(dir);
  }
});

// ── Text format on an empty result (Case 2) ──────────────────────────────

test("--format text on an empty result prints exactly __NONE__", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, [
      "--module",
      "m",
      "--format",
      "text",
      "--signature",
      SIGNATURE,
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, "__NONE__\n");
  } finally {
    cleanup(dir);
  }
});

// ── Emit shape 1 of 2: the ORDINARY empty result (Case 3) ────────────────

test("an ordinary empty result emits EXACTLY the two-key shape", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--signature", SIGNATURE]);
    assert.strictEqual(r.status, 0, r.stderr);
    // deepEqual, not a key subset: an `error` key must NOT appear here, or the
    // operator can no longer tell an empty store from a broken one.
    assert.deepEqual(JSON.parse(r.stdout), { count: 0, rendered: "" });
  } finally {
    cleanup(dir);
  }
});

// ── Emit shape 2 of 2: the UNREADABLE-STORE path (Case 4) ────────────────

test("a throwing retrieval emits the three-key shape, error included, at exit 0", () => {
  const dir = makeTempProject();
  try {
    const nodeArgs = throwingRetrievalNodeArgs(dir, "store unreadable: EACCES");
    const r = runRetrieveIn(dir, ["--module", "m", "--signature", SIGNATURE], nodeArgs);

    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    // Asserted first and on its own: if the technique ever stops reaching the
    // catch block, this fails loudly instead of quietly re-testing Case 3.
    assert.ok(
      Object.prototype.hasOwnProperty.call(out, "error"),
      `the catch block was not reached — got ${r.stdout}`,
    );
    assert.deepEqual(Object.keys(out).sort(), ["count", "error", "rendered"]);
    assert.strictEqual(typeof out.error, "string");
    assert.strictEqual(out.count, 0);
    assert.strictEqual(out.rendered, "");
  } finally {
    cleanup(dir);
  }
});

test("the throwing-retrieval path carries the thrown message through", () => {
  const dir = makeTempProject();
  try {
    const nodeArgs = throwingRetrievalNodeArgs(dir, "store unreadable: EACCES");
    const r = runRetrieveIn(dir, ["--module", "m"], nodeArgs);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).error, "store unreadable: EACCES");
  } finally {
    cleanup(dir);
  }
});

test("--format text on the throwing-retrieval path still prints __NONE__", () => {
  const dir = makeTempProject();
  try {
    const nodeArgs = throwingRetrievalNodeArgs(dir, "store unreadable: EACCES");
    const r = runRetrieveIn(dir, ["--module", "m", "--format", "text"], nodeArgs);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, "__NONE__\n");
  } finally {
    cleanup(dir);
  }
});

test("the two empty shapes are not interchangeable", () => {
  // One test that fails if either emit site is edited to match the other.
  const ordinary = makeTempProject();
  const broken = makeTempProject();
  try {
    const nodeArgs = throwingRetrievalNodeArgs(broken, "store unreadable: EACCES");
    const a = JSON.parse(runRetrieveIn(ordinary, ["--module", "m"]).stdout);
    const b = JSON.parse(runRetrieveIn(broken, ["--module", "m"], nodeArgs).stdout);
    assert.strictEqual(Object.keys(a).length, 2, JSON.stringify(a));
    assert.strictEqual(Object.keys(b).length, 3, JSON.stringify(b));
  } finally {
    cleanup(ordinary);
    cleanup(broken);
  }
});

// ── A malformed --signature is a no-match, NOT an argument error (Case 5) ─

test("a whitespace-only --signature exits 0 rather than failing argument parsing", () => {
  const dir = makeTempProject();
  try {
    seedScope(dir, "m", [makeEntry({ id: "sig-aaaaaaa1", signature: SIGNATURE })]);

    const r = runRetrieveIn(dir, ["--module", "m", "--signature", "   "]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).count, 0, r.stdout);
  } finally {
    cleanup(dir);
  }
});

test("an empty --signature exits 0 rather than failing argument parsing", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--signature", ""]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { count: 0, rendered: "" });
  } finally {
    cleanup(dir);
  }
});

test("a --signature that violates the stored-signature pattern is a no-match, not an error", () => {
  const dir = makeTempProject();
  try {
    seedScope(dir, "m", [makeEntry({ id: "sig-aaaaaaa1", signature: SIGNATURE })]);

    const r = runRetrieveIn(dir, ["--module", "m", "--signature", "NOT A Signature!!"]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).count, 0, r.stdout);
  } finally {
    cleanup(dir);
  }
});

// ── Existing argument errors are UNCHANGED (Case 6) ──────────────────────

test("missing --module still exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, ["--signature", SIGNATURE]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /missing --module/);
  } finally {
    cleanup(dir);
  }
});

test("--format xml still exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--format", "xml"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--format must be one of/);
  } finally {
    cleanup(dir);
  }
});

test("--tier deep still exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--tier", "deep"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--tier must be one of/);
  } finally {
    cleanup(dir);
  }
});

test("--injection-limit -1 still exits 1", () => {
  const dir = makeTempProject();
  try {
    // `=-1`, not `-1`: parseArgs rejects a space-separated dash-leading value
    // as ambiguous before the verb ever sees it, which would exit 1 without
    // exercising the verb's own non-negative-integer check.
    const r = runRetrieveIn(dir, ["--module", "m", "--injection-limit=-1"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--injection-limit must be a non-negative integer/);
  } finally {
    cleanup(dir);
  }
});

test("a valid --signature does not rescue an otherwise invalid argument set", () => {
  const dir = makeTempProject();
  try {
    for (const bad of [
      ["--module", "m", "--format", "xml"],
      ["--module", "m", "--tier", "deep"],
      ["--module", "m", "--injection-limit=-1"],
    ]) {
      const r = runRetrieveIn(dir, [...bad, "--signature", SIGNATURE]);
      assert.strictEqual(r.status, 1, `${bad.join(" ")}: ${r.stdout}`);
      assert.strictEqual(r.stdout, "", bad.join(" "));
    }
  } finally {
    cleanup(dir);
  }
});

// ── Usage surface ────────────────────────────────────────────────────────

test("the retrieve argument-error usage string advertises --signature", () => {
  const dir = makeTempProject();
  try {
    const r = runRetrieveIn(dir, []);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--signature/);
  } finally {
    cleanup(dir);
  }
});

// ── The error-time injection cap (Task 8) ────────────────────────────────
//
// A `--signature` invocation IS by definition an error-time retrieval — no
// entry-time call site passes one — so the verb itself applies the error-time
// default of 3 (`heuristics.error_injection_limit`) instead of the library's
// entry-time default of 8. The cap governs BOTH the signature phase and the
// unmatched-signature fallback.
//
// FIXTURE IS LOAD-BEARING and gets its OWN temp root. The Task 7 fixtures above
// assert `count === 1` on a single-entry store; sharing a root with the 20-entry
// store below would break them.
//
// The store holds, all in scope `m`:
//   10 x low, signature `validate-many`   — the signature-phase population
//    6 x high, no signature               — eligible fallback filler
//    4 x medium, no signature             — eligible fallback filler
//
// The 6+4 unsigned block is what makes the no-signature case observable: the 10
// signature entries are `low`, and the budget loop's low floor drops every one
// of them on any path that does not match them by signature. Without the filler
// the no-signature assertion would read 0 and prove nothing about the default.
//
// Eligible (non-low) entries for the unmatched-signature fallback: 10. That
// exceeds both of the caps exercised below — 3 and 8 — so a cap assertion
// cannot pass merely because the store ran out of entries.

const MANY_SIGNATURE = "validate-many";
const UNMATCHED_SIGNATURE = "validate-nothing";

/** Non-low entries in the error-cap fixture — the fallback-eligible population. */
const ERROR_CAP_ELIGIBLE = 10;

/**
 * Seed a SEPARATE project root for the error-time cap cases.
 *
 * @param {{errorInjectionLimit?: number}} [options] - when
 *   `errorInjectionLimit` is given, the manifest is rewritten to configure
 *   `heuristics.error_injection_limit`.
 * @returns {string} the temp project root
 */
function makeErrorCapProject({ errorInjectionLimit } = {}) {
  const dir = makeTempProject();
  if (errorInjectionLimit !== undefined) {
    writeFixture(
      dir,
      ".context-index/manifest.yaml",
      'project:\n  name: t\n  adev_version: "0.22.0"\n' +
        `heuristics:\n  error_injection_limit: ${errorInjectionLimit}\n`,
    );
  }
  const entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push(
      makeEntry({ id: `many-${i}`, confidence: "low", signature: MANY_SIGNATURE }),
    );
  }
  for (let i = 0; i < 6; i++) {
    entries.push(makeEntry({ id: `high-${i}`, confidence: "high" }));
  }
  for (let i = 0; i < 4; i++) {
    entries.push(makeEntry({ id: `med-${i}`, confidence: "medium" }));
  }
  seedScope(dir, "m", entries);
  return dir;
}

test("a --signature retrieval defaults to the error-time cap of 3, not the entry-time 8", () => {
  const dir = makeErrorCapProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--signature", MANY_SIGNATURE]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(
      out.count,
      3,
      `10 entries carry ${MANY_SIGNATURE}; a --signature run with no explicit cap must resolve ` +
        `to the error-time default of 3, not the library's entry-time 8. Got ${out.count}.`,
    );
  } finally {
    cleanup(dir);
  }
});

test("a retrieval with NO signature keeps the entry-time default of 8", () => {
  // The error-time default must not leak onto the eight entry-time call sites.
  const dir = makeErrorCapProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m"]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(
      out.count,
      8,
      `${ERROR_CAP_ELIGIBLE} non-low entries are eligible (6 high + 4 medium); at limit 8 the ` +
        `split is 5 high / 3 medium, so an entry-time call must still return 8. Got ${out.count}.`,
    );
  } finally {
    cleanup(dir);
  }
});

test("an explicit --injection-limit always wins over the error-time default", () => {
  const dir = makeErrorCapProject();
  try {
    const r = runRetrieveIn(dir, [
      "--module",
      "m",
      "--signature",
      MANY_SIGNATURE,
      "--injection-limit",
      "5",
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(
      out.count,
      5,
      `an explicit cap is the caller's decision and must not be overridden by the ` +
        `error-time default. Got ${out.count}.`,
    );
  } finally {
    cleanup(dir);
  }
});

test("an unmatched --signature falls back to module scope but stays under the error-time cap", () => {
  const dir = makeErrorCapProject();
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--signature", UNMATCHED_SIGNATURE]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    // The fallback is the MODAL path — a first occurrence matches no stored
    // signature — so it must not escalate to the entry-time budget of 8.
    assert.ok(
      out.count <= 3,
      `${ERROR_CAP_ELIGIBLE} entries are eligible for the fallback, so the cap genuinely binds: ` +
        `the unmatched-signature fallback must stay at or under 3, got ${out.count}.`,
    );
    assert.ok(
      out.count > 0,
      `the fallback must not blank the context on the modal path, got ${out.count}`,
    );
  } finally {
    cleanup(dir);
  }
});

test("a configured heuristics.error_injection_limit overrides the default of 3", () => {
  // This case exists because of an INSERTION-POINT experiment, not because the
  // plan called for it. Placing the resolver call BEFORE `const absRoot` is a
  // temporal-dead-zone ReferenceError on `loadManifest(absRoot)` — but that
  // throw lands inside the resolver's own defensive try/catch, degrades to an
  // empty manifest, and yields the default 3. Every other case here asserts 3,
  // so all of them pass under the broken placement. Reading a CONFIGURED value
  // off disk is the only assertion that distinguishes "the manifest was read"
  // from "the manifest read failed and we fell back".
  const dir = makeErrorCapProject({ errorInjectionLimit: 2 });
  try {
    const r = runRetrieveIn(dir, ["--module", "m", "--signature", MANY_SIGNATURE]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(
      out.count,
      2,
      `the manifest configures heuristics.error_injection_limit: 2, so the verb must resolve ` +
        `the cap from the manifest rather than from the default of 3 or the entry-time 8. ` +
        `Got ${out.count}.`,
    );
  } finally {
    cleanup(dir);
  }
});

test("help() documents --signature under retrieve", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics", "--help"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0);
    // The write subcommand also documents a --signature, so anchor on the
    // retrieve block: the flag must appear before the signature subcommand.
    const retrieveBlock = r.stdout.slice(0, r.stdout.indexOf("  signature "));
    assert.ok(retrieveBlock.length > 0, "retrieve block not found in help output");
    assert.match(retrieveBlock, /--signature/);
  } finally {
    cleanup(dir);
  }
});
