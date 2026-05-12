/**
 * Architectural / CI-gate assertions for the execution-state-migration spec.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 *
 * Covered tasks:
 *  12. Architectural tests (no inline YAML, no inline grep, stderr discard,
 *      single-helper design, no legacy `.execution-state.md` writes).
 *
 * Each assertion is a CI gate: any reintroduction of the banned pattern fails
 * the build.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

/**
 * Collect every `*.sh` file under `hooks/`.
 */
function collectHookShellFiles() {
  const hooksDir = join(REPO_ROOT, "hooks");
  return readdirSync(hooksDir)
    .filter((f) => f.endsWith(".sh"))
    .map((f) => ({ name: f, path: join(hooksDir, f) }));
}

/**
 * Read a file's content as utf-8 string.
 */
function read(path) {
  return readFileSync(path, "utf-8");
}

describe("architectural: execution-state migration", () => {
  it("no shell hook file parses YAML frontmatter inline", () => {
    // Per spec AC line 126: grep `hooks/*.sh` for `match\(\/\^---` or
    // `meta\.status` (the two regex tokens the legacy inline parser used).
    const frontmatterMatchPattern = /match\(\s*\/\^---/;
    const metaStatusPattern = /\bmeta\.status\b/;
    const offenders = [];
    for (const { name, path } of collectHookShellFiles()) {
      const content = read(path);
      if (frontmatterMatchPattern.test(content)) {
        offenders.push(`${name}: contains 'match(/^---' frontmatter parser`);
      }
      if (metaStatusPattern.test(content)) {
        offenders.push(`${name}: contains 'meta.status' (legacy YAML parser field)`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "no shell hook may inline-parse YAML/markdown frontmatter; offenders:\n" +
        offenders.join("\n")
    );
  });

  it('no shell hook file uses `grep -E "^status:"` (inline gate parsing)', () => {
    const pattern = /grep\s+-E\s+"\^status:"/;
    const offenders = [];
    for (const { name, path } of collectHookShellFiles()) {
      if (pattern.test(read(path))) {
        offenders.push(name);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "no shell hook may inline-parse execution-state status via grep; offenders: " +
        offenders.join(", ")
    );
  });

  it("every invocation of `_execution-state.mjs` from a shell hook is followed by `2>/dev/null`", () => {
    // Spec CON-4 SEC-4: helper stderr MUST be discarded by every shell-side
    // invocation. We grep each .sh file for lines that *invoke* the helper
    // (i.e. contain both `node` and `_execution-state.mjs`, excluding comment
    // lines starting with `#`). Such lines must include `2>/dev/null`.
    const offenders = [];
    for (const { name, path } of collectHookShellFiles()) {
      const content = read(path);
      const lines = content.split("\n");
      let i = 0;
      while (i < lines.length) {
        let logical = lines[i];
        // Combine continuation lines (ending in `\`).
        while (logical.endsWith("\\") && i + 1 < lines.length) {
          i += 1;
          logical = logical.slice(0, -1) + lines[i];
        }
        const trimmed = logical.trim();
        // Skip pure comment lines.
        if (trimmed.startsWith("#")) {
          i += 1;
          continue;
        }
        if (
          logical.includes("_execution-state.mjs") &&
          /\bnode\b/.test(logical)
        ) {
          if (!logical.includes("2>/dev/null")) {
            offenders.push(`${name}:${i + 1}: ${trimmed}`);
          }
        }
        i += 1;
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "every shell-side helper invocation must include `2>/dev/null`; offenders:\n" +
        offenders.join("\n")
    );
  });

  it("hooks/_render-resume-block.mjs does NOT exist (single-helper design)", () => {
    const renderHelperPath = join(REPO_ROOT, "hooks", "_render-resume-block.mjs");
    assert.ok(
      !existsSync(renderHelperPath),
      "single-helper design requires hooks/_render-resume-block.mjs to NOT exist"
    );
  });

  it("no `.execution-state.md` references in lib/ or hooks/ (migration tool excluded)", () => {
    // Per spec AC: no writes or reads of the legacy `.md` path may remain
    // EXCEPT in the one-shot migration tool (`lib/migrate-state-artifacts.mjs`),
    // which is the documented sole write-side consumer of legacy formats
    // (spec one-shot-migration-tool, Behavioral Contract).
    const allowedExceptions = new Set([
      "lib/migrate-state-artifacts.mjs",
    ]);
    const offenders = [];
    function walk(dir) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (!(entry.endsWith(".mjs") || entry.endsWith(".sh") || entry.endsWith(".js"))) {
          continue;
        }
        const content = read(full);
        if (content.includes(".execution-state.md")) {
          const rel = full.replace(REPO_ROOT + "/", "");
          if (!allowedExceptions.has(rel)) {
            offenders.push(rel);
          }
        }
      }
    }
    walk(join(REPO_ROOT, "lib"));
    walk(join(REPO_ROOT, "hooks"));
    assert.deepEqual(
      offenders,
      [],
      "no .mjs / .sh / .js file in lib/ or hooks/ may reference `.execution-state.md` (except the migration tool); offenders:\n" +
        offenders.join("\n")
    );
  });

  it("lib/execution-state.mjs contains no YAML serialization vestiges", () => {
    const content = read(join(REPO_ROOT, "lib", "execution-state.mjs"));
    // Spec AC: no `yaml` / `YAML` token (case-insensitive) — except the
    // unavoidable `manifest.yaml` filename references used by the
    // path-containment check. Strip those before grepping.
    const stripped = content.replace(/manifest\.yaml/g, "<manifest-file>");
    assert.ok(
      !/yaml/i.test(stripped),
      "lib/execution-state.mjs must not contain 'yaml' / 'YAML' tokens (other than manifest.yaml filename references)"
    );
    assert.ok(
      !/\^---/.test(content),
      "lib/execution-state.mjs must not contain `^---` frontmatter regex"
    );
    // Sanitize-field vestige removed (JSON encoding handles escaping).
    assert.ok(
      !/function\s+sanitizeField/.test(content),
      "lib/execution-state.mjs must not contain a `sanitizeField` function"
    );
  });

  it("hooks/hooks.json does not register the helper as an entry point", () => {
    const hooksJsonPath = join(REPO_ROOT, "hooks", "hooks.json");
    const content = read(hooksJsonPath);
    // The helper is invoked from within registered entry points; it must not
    // appear in the hooks.json registration map.
    assert.ok(
      !content.includes("_execution-state.mjs"),
      "hooks/hooks.json must not register _execution-state.mjs as a hook entry"
    );
  });
});
