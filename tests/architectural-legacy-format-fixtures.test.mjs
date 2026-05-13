/**
 * Architectural / CI-gate assertions for the test-migration spec.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
 *
 * Covered behaviors:
 *  - Behaviors row 5 / AC #4 / Error Cases row 4: no `1[234]-column` idiom
 *    outside the allowed legacy-read regression block.
 *  - Behaviors row 6 / Postconditions / AC #5 / Error Cases row 5: no legacy
 *    storage-format string (.execution-state.md, milestones.yaml, the
 *    pre-rename build-state/ path) outside allowed paths.
 *
 * Each assertion is a CI gate: any reintroduction of the banned pattern
 * fails the build.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const SCAN_DIRS = ["tests", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

/**
 * Recursively yield every `*.mjs` / `*.js` file under `dir`, skipping the
 * directory names listed in `SKIP_DIRS`.
 */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (stat.isFile() && (entry.endsWith(".mjs") || entry.endsWith(".js"))) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Task 4 — column-variant idiom guard
// ---------------------------------------------------------------------------

const COLUMN_PATTERN = /\b1[234]-column\b/;
const ALLOWED_COLUMN_FILES = new Set([
  // Sunset regression block; the column-variant tests live here until
  // tasks.backend: "file" is removed from lib/issues/registry.mjs (charter
  // agent-reliable-state-artifacts, line 59).
  "tests/lib/issues/markdown-parser.test.mjs",
  // This file references the pattern in its own assertion source; exclude
  // self-reference.
  "tests/architectural-legacy-format-fixtures.test.mjs",
]);

describe("architectural — no legacy column-variant idioms outside sunset block", () => {
  it("no file under tests/ or lib/ matches /\\b1[234]-column\\b/ outside allowed files", () => {
    const violations = [];
    for (const scanDir of SCAN_DIRS) {
      for (const file of walk(join(REPO_ROOT, scanDir))) {
        const rel = relative(REPO_ROOT, file);
        if (ALLOWED_COLUMN_FILES.has(rel)) continue;
        const content = readFileSync(file, "utf8");
        if (COLUMN_PATTERN.test(content)) {
          violations.push(rel);
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Files with disallowed 1[234]-column references: ${violations.join(", ")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5 — legacy-fixture-leak inventory
// ---------------------------------------------------------------------------

const LEGACY_PATTERNS = [
  /\.execution-state\.md/,
  /milestones\.yaml/,
  /\.context-index\/build-state\//,
];

// Path prefixes whose contents may legitimately reference legacy storage
// formats. The migration tool reads legacy formats by design; the brownfield
// eval fixtures intentionally exercise legacy storage.
const ALLOWED_DIR_PREFIXES = [
  "tests/lib/migrate-state-artifacts",
  "tests/evals/",
];

// Files that name the legacy strings *in their own patterns / assertions* and
// must be exempt from the leak inventory or they would always self-fail.
//
// SA-4 (test-migration.spec review): the inventory is substring-based; tests
// that legitimately name a legacy string in their assertions cannot be told
// apart from leaked fixtures by content alone. Each entry below is reviewed
// and named explicitly with a one-line rationale.
const ALLOWED_FILES_SELF_REFERENCE = new Set([
  // The architectural guards themselves name the legacy strings in their own
  // pattern definitions.
  "tests/architectural-legacy-format-fixtures.test.mjs",
  "tests/architectural-execution-state.test.mjs",
  "tests/architectural-milestones.test.mjs",
  // Production code legitimately reads the legacy `.context-index/build-state/`
  // path during the pre-rename fallback window. Its tests assert that fallback
  // and the "new path wins over legacy" precedence — they name the legacy
  // directory in setup, not as authoritative on-disk shape.
  "tests/lib/build-state.test.mjs",
  // Production code legitimately checks for / refuses to write the legacy
  // `.execution-state.md` path. Its test asserts the *negative* — that the
  // legacy markdown sibling file is not written — which requires naming the
  // legacy path in the assertion.
  "tests/lib/execution-state.test.mjs",
]);

describe("architectural — no legacy storage-format assertions outside allowed paths", () => {
  it("no file under tests/lib/ asserts against legacy markdown/YAML state artifact shapes", () => {
    const violations = [];
    for (const file of walk(join(REPO_ROOT, "tests", "lib"))) {
      const rel = relative(REPO_ROOT, file);
      if (ALLOWED_DIR_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (ALLOWED_FILES_SELF_REFERENCE.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      const hits = LEGACY_PATTERNS.filter((p) => p.test(content));
      if (hits.length > 0) {
        violations.push({ file: rel, patterns: hits.map((p) => p.source) });
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Files with disallowed legacy-format references:\n${JSON.stringify(violations, null, 2)}`,
    );
  });
});
