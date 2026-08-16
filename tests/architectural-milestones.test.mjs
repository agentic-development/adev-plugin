/**
 * Architectural / CI-gate assertions for the milestones-migration spec.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/milestones-migration.spec.md
 *
 * Covered task:
 *   12. Architectural tests — assert that `lib/milestones.mjs` has dropped the
 *       parseYaml import and YAML serialization, that no code path writes to
 *       `.context-index/milestones.yaml` after the migration, and that direct
 *       writes to `milestones.json` only happen through `lib/milestones.mjs`.
 *
 * Each assertion is a CI gate: reintroducing a banned pattern fails the build.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

/** Read a file's content as utf-8. */
function read(path) {
  return readFileSync(path, "utf-8");
}

/**
 * Walk a directory tree, returning all `.mjs` source files (excludes node_modules,
 * test files, and the migration-tool scope which is exempted by the spec).
 */
function collectLibFiles(rootRelative, opts = {}) {
  const { excludeMigrationTool = true } = opts;
  const out = [];
  const root = join(REPO_ROOT, rootRelative);
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules") continue;
        // Migration tool scope is allowed to read legacy `.yaml` files
        if (excludeMigrationTool && ent.name === "migration-tool") continue;
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".mjs")) {
        // Skip files that look like migration tools
        if (excludeMigrationTool && /migrate/i.test(ent.name)) continue;
        out.push(full);
      }
    }
  }
  if (statSync(root).isDirectory()) walk(root);
  return out;
}

describe("architectural: milestones JSON migration (Task 12)", () => {
  // NARROWED (issue-525). These two assertions used to ban the `parseYaml`
  // symbol and the profiles/yaml import outright. That was a PROXY for the real
  // Task 12 invariant — "the milestone DOCUMENT is JSON, never YAML" — and the
  // proxy became wrong once milestones.mjs had to read governance gates from
  // `.context-index/governance/gates.yaml`, which is legitimately YAML and is
  // read the same way by every other gate consumer.
  //
  // The document invariant itself is unaffected and is still enforced, three
  // ways: the `milestones.yaml` ban below, the handcrafted-YAML-serialization
  // check, and the "only milestones.mjs writes milestones.json" check. So this
  // now asserts the intent directly: a YAML parser may be imported ONLY to read
  // governance config, and never to read or write the milestone document.
  it("lib/milestones.mjs YAML-parses governance config only, never the milestone document", () => {
    const content = read(join(REPO_ROOT, "lib", "milestones.mjs"));
    const usesYaml =
      /parseYaml/.test(content) || /from\s+["'][^"']*profiles\/yaml/.test(content);

    if (usesYaml) {
      assert.ok(
        /governance[/\\]?["',\s)]|gates\.yaml/.test(content),
        "lib/milestones.mjs imports a YAML parser but does not read governance " +
          "config — the only sanctioned YAML source here. If the milestone " +
          "document is being YAML-parsed again, that is the Task 12 regression " +
          "this test exists to catch."
      );
    }

    assert.ok(
      !/milestones\.yaml/.test(content),
      "lib/milestones.mjs must never reference the legacy milestones.yaml path"
    );
  });

  it("lib/milestones.mjs contains no handcrafted YAML serialization (look for telltale patterns)", () => {
    const content = read(join(REPO_ROOT, "lib", "milestones.mjs"));
    // YAML serialization typically writes lines like `'milestones:\n'` or
    // ` - name: ${name}\n`. Look for the common indented-list patterns that
    // were used in the prior implementation.
    const yamlListPattern = /["']\s+-\s+name:/;
    const yamlHeaderPattern = /["']milestones:["']\s*\+\s*["']/;
    assert.ok(!yamlListPattern.test(content),
      "lib/milestones.mjs must not contain YAML-list serialization literals");
    assert.ok(!yamlHeaderPattern.test(content),
      "lib/milestones.mjs must not contain YAML-header serialization literals");
  });

  it("no lib/*.mjs file writes to `.context-index/milestones.yaml` (legacy path)", () => {
    // Scan every .mjs under lib/ for writes to milestones.yaml.
    // Allowed in: migration-tool scope (excluded above).
    const offenders = [];
    for (const file of collectLibFiles("lib")) {
      const content = read(file);
      // Match writeFileSync/writeFile/rename targeting milestones.yaml
      // (path literal or path-join with 'milestones.yaml' string)
      if (/milestones\.yaml/.test(content)) {
        // Allow string mentions in comments only if we can detect them?
        // Conservative: any mention is a violation, since lib/ no longer reads YAML.
        // Exception: lib/milestones.mjs may not even reference the legacy filename.
        offenders.push(file.replace(REPO_ROOT + "/", ""));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "no lib/*.mjs may reference `milestones.yaml`; offenders:\n" + offenders.join("\n")
    );
  });

  it("only `lib/milestones.mjs` writes to `milestones.json`", () => {
    // Look for `writeFileSync(...milestones.json...)` patterns in lib/ outside
    // of lib/milestones.mjs itself. Any other lib file that writes to
    // milestones.json bypasses the atomic-write + path-safety contract.
    const writePattern = /writeFileSync\s*\([^)]*milestones\.json/;
    const renamePattern = /renameSync\s*\([^)]*milestones\.json/;
    const offenders = [];
    for (const file of collectLibFiles("lib")) {
      if (file.endsWith(join("lib", "milestones.mjs"))) continue;
      const content = read(file);
      if (writePattern.test(content) || renamePattern.test(content)) {
        offenders.push(file.replace(REPO_ROOT + "/", ""));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "only lib/milestones.mjs may write milestones.json; offenders:\n" + offenders.join("\n")
    );
  });

  it("lib/milestones.mjs writes JSON only via `JSON.stringify(..., null, 2) + \"\\n\"`", () => {
    const content = read(join(REPO_ROOT, "lib", "milestones.mjs"));
    // Confirm the canonical serialization is present
    assert.ok(
      /JSON\.stringify\([^)]*null,\s*2\)\s*\+\s*["']\\n["']/.test(content),
      "lib/milestones.mjs must serialize via JSON.stringify(data, null, 2) + \"\\n\""
    );
  });
});
