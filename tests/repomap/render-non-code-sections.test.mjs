/**
 * Tests for repo-map.md rendering of the three non-code-reference sections
 * (Behavior 6 of non-code-reference-detection.spec.md):
 *
 *   - "Doc-reference inbound summary" (top 10 by distinct source skill count)
 *   - "Public API surface" (every public-api-entry file with its exports key)
 *   - "Missing doc-reference targets" (source:line → ref)
 *
 * These run against the live orchestrator (lib/repomap/index.mjs) via a small
 * tmpdir fixture project, ensuring the renderer wires the data through in both
 * tree-sitter and regex modes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "..", "..", "lib", "repomap", "index.mjs");

function makeFixture() {
  const tmp = mkdtempSync(join(tmpdir(), "repomap-render-"));
  mkdirSync(join(tmp, "lib"), { recursive: true });
  mkdirSync(join(tmp, "cli"), { recursive: true });
  mkdirSync(join(tmp, "skills/skill-a"), { recursive: true });
  mkdirSync(join(tmp, "skills/skill-b"), { recursive: true });
  mkdirSync(join(tmp, ".context-index"), { recursive: true });

  writeFileSync(
    join(tmp, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        type: "module",
        exports: { ".": "./cli/index.mjs" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(tmp, ".context-index/manifest.yaml"),
    [
      "modules:",
      "  - slug: lib",
      "    paths:",
      "      - lib",
      "  - slug: cli",
      "    paths:",
      "      - cli",
      "",
    ].join("\n"),
  );

  writeFileSync(join(tmp, "cli/index.mjs"), "export function main() {}\n");
  writeFileSync(join(tmp, "lib/helper.mjs"), "export function helper() {}\n");

  // skill-a references helper.mjs and cli/index.mjs
  writeFileSync(
    join(tmp, "skills/skill-a/SKILL.md"),
    "Use `lib/helper.mjs` and `cli/index.mjs`.\nAlso refers to `lib/missing.mjs`.\n",
  );
  // skill-b references helper.mjs only — should contribute to inbound count
  writeFileSync(
    join(tmp, "skills/skill-b/SKILL.md"),
    "Skill B uses `lib/helper.mjs` for stuff.\n",
  );

  return tmp;
}

function cleanup(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {}
}

test("tree-sitter mode renders all three sections", () => {
  const root = makeFixture();
  try {
    execFileSync("node", [SCRIPT_PATH, "--root", root], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const repoMap = readFileSync(
      join(root, ".context-index/hygiene/repo-map.md"),
      "utf-8",
    );
    assert.ok(repoMap.includes("## Doc-reference inbound summary"));
    assert.ok(repoMap.includes("## Public API surface"));
    assert.ok(repoMap.includes("## Missing doc-reference targets"));
    // helper.mjs is referenced by 2 skill docs → must appear in top summary
    assert.ok(
      /lib\/helper\.mjs ← 2 skill docs/.test(repoMap),
      "doc-reference inbound count should be 2 for helper.mjs",
    );
    // public api surface lists cli/index.mjs with the . key
    assert.ok(/cli\/index\.mjs.*key.*`\.`/.test(repoMap));
    // missing target appears with line number
    assert.ok(/skills\/skill-a\/SKILL\.md:\d+ → lib\/missing\.mjs/.test(repoMap));
  } finally {
    cleanup(root);
  }
});

test("regex mode also renders the three sections; no JSON artifacts", () => {
  const root = makeFixture();
  try {
    execFileSync("node", [SCRIPT_PATH, "--root", root, "--mode", "regex"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const repoMap = readFileSync(
      join(root, ".context-index/hygiene/repo-map.md"),
      "utf-8",
    );
    assert.ok(repoMap.includes("Parser: regex"));
    assert.ok(repoMap.includes("## Doc-reference inbound summary"));
    assert.ok(repoMap.includes("## Public API surface"));
    assert.ok(repoMap.includes("## Missing doc-reference targets"));
    // No JSON artifacts in regex mode
    assert.ok(
      !existsSync(join(root, ".context-index/hygiene/dependency-graph.json")),
      "dependency-graph.json must not exist in regex mode",
    );
    assert.ok(
      !existsSync(join(root, ".context-index/hygiene/symbol-ranks.json")),
      "symbol-ranks.json must not exist in regex mode",
    );
  } finally {
    cleanup(root);
  }
});

test("missing-targets section omitted when none", () => {
  const tmp = mkdtempSync(join(tmpdir(), "repomap-no-missing-"));
  try {
    mkdirSync(join(tmp, "lib"), { recursive: true });
    mkdirSync(join(tmp, "skills/skill-a"), { recursive: true });
    writeFileSync(join(tmp, "lib/helper.mjs"), "export const x = 1;\n");
    writeFileSync(
      join(tmp, "skills/skill-a/SKILL.md"),
      "Use `lib/helper.mjs`.\n",
    );
    execFileSync("node", [SCRIPT_PATH, "--root", tmp], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const repoMap = readFileSync(
      join(tmp, ".context-index/hygiene/repo-map.md"),
      "utf-8",
    );
    assert.ok(!repoMap.includes("## Missing doc-reference targets"));
  } finally {
    cleanup(tmp);
  }
});
