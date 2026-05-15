// tests/cli-driver-pattern.test.mjs
//
// Pattern enforcement for the driver-substrate contract:
//   - every lib/cli/*.mjs exports `run` and `help`
//   - any module that exports LIFECYCLE_STEP must have requireGate(...) as the
//     first executable statement of run()
//
// Detector uses regex/source-text analysis — no JS parser dependency per
// Constitution Principle 1 (zero external deps).
//
// Fixture-driven assertions verify the detector itself works (catches missing
// run exports and missing requireGate-first calls in LIFECYCLE_STEP-bound
// modules).

import { test } from "node:test";
import assert from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const CLI_LIB_DIR = resolve(PROJECT_ROOT, "lib", "cli");
const FIXTURES_DIR = resolve(PROJECT_ROOT, "tests", "fixtures", "cli");

function listCliModules(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => ({
      file: f,
      path: join(dir, f),
      src: readFileSync(join(dir, f), "utf8"),
    }));
}

// Detects whether `src` exports a named binding via any common form.
function hasExport(src, name) {
  const re = new RegExp(
    "export\\s+(?:async\\s+)?function\\s+" + name + "\\b" + // export function name | export async function name
      "|export\\s*\\{[^}]*\\b" + name + "\\b" + // export { name, ... }
      "|export\\s+(?:async\\s+)?const\\s+" + name + "\\b" + // export const name | export async const (rare)
      "|export\\s+let\\s+" + name + "\\b" +
      "|export\\s+var\\s+" + name + "\\b",
  );
  return re.test(src);
}

// Reads a LIFECYCLE_STEP string literal: `export const LIFECYCLE_STEP = '...'`.
function getLifecycleStep(src) {
  const m = src.match(
    /export\s+const\s+LIFECYCLE_STEP\s*=\s*['"]([^'"]+)['"]/,
  );
  return m ? m[1] : null;
}

// Extracts the first executable statement (trimmed) of the run() function body.
// Strips leading whitespace, single-line `// ...` comments, and block `/* ... */`
// comments (multi-line). Returns null if run() cannot be located.
function firstStatementOfRun(src) {
  const m = src.match(/export\s+(?:async\s+)?function\s+run\s*\([^)]*\)\s*\{/);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  // Naive brace matching — fine for the constrained shapes we accept.
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  let body = src.slice(bodyStart, i - 1);

  // Strip /* ... */ block comments (possibly multi-line).
  body = body.replace(/\/\*[\s\S]*?\*\//g, "");

  const lines = body.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t === "") continue;
    if (t.startsWith("//")) continue;
    return t;
  }
  return null;
}

// ── Assertions against the real lib/cli/*.mjs tree ───────────────────────────

test("every lib/cli/*.mjs exports run and help", () => {
  const modules = listCliModules(CLI_LIB_DIR);
  if (modules.length === 0) {
    // No real modules yet — vacuously passes. The fixture-driven tests below
    // still exercise the detector.
    return;
  }
  for (const { file, src } of modules) {
    assert.ok(hasExport(src, "run"), `${file} missing run export`);
    assert.ok(hasExport(src, "help"), `${file} missing help export`);
  }
});

test("LIFECYCLE_STEP-bound modules have requireGate as first executable statement of run", () => {
  for (const { file, src } of listCliModules(CLI_LIB_DIR)) {
    const step = getLifecycleStep(src);
    if (!step) continue; // not lifecycle-bound; skip
    const first = firstStatementOfRun(src);
    assert.ok(
      first && /^(await\s+)?requireGate\s*\(/.test(first),
      `${file} declares LIFECYCLE_STEP='${step}' but first statement of run() is not requireGate(...) (got: ${first})`,
    );
  }
});

// ── Fixture-driven assertions: verify the detector itself works ──────────────

test("detector flags fixture missing run export", () => {
  const src = readFileSync(
    join(FIXTURES_DIR, "non-conforming-no-run.mjs"),
    "utf8",
  );
  assert.strictEqual(hasExport(src, "run"), false);
  assert.strictEqual(hasExport(src, "help"), true);
});

test("detector flags LIFECYCLE_STEP-bound fixture without requireGate-first", () => {
  const src = readFileSync(
    join(FIXTURES_DIR, "non-conforming-no-gate.mjs"),
    "utf8",
  );
  assert.strictEqual(getLifecycleStep(src), "plan");
  const first = firstStatementOfRun(src);
  assert.ok(
    first && !/^(await\s+)?requireGate\s*\(/.test(first),
    `fixture should not have requireGate first (got: ${first})`,
  );
});

test("detector accepts conforming fixture", () => {
  const src = readFileSync(join(FIXTURES_DIR, "conforming.mjs"), "utf8");
  assert.ok(hasExport(src, "run"));
  assert.ok(hasExport(src, "help"));
  assert.strictEqual(getLifecycleStep(src), "plan");
  const first = firstStatementOfRun(src);
  assert.ok(
    first && /^(await\s+)?requireGate\s*\(/.test(first),
    `conforming fixture should have requireGate first (got: ${first})`,
  );
});
