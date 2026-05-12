/**
 * Architectural / CI-gate assertions for the markdown-rendering-layer spec.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/markdown-rendering-layer.spec.md
 *
 * Task 18 covers three invariants — any reintroduction fails the build:
 *
 *   (a) No SKILL.md autonomously invokes `adev status --render`. The render
 *       flag is operator-on-demand. Skills MAY surface `adev status --pipeline`
 *       for read.
 *   (b) `lib/lifecycle-state.mjs::renderMarkdown` source contains no executable
 *       reference to `lib/domains/domain-config.mjs` (severity is pre-stamped
 *       on each event; no domain-config lookup at render time).
 *   (c) No non-atomic writes to rendered files (`tasks.md`, `<slug>.md`) in
 *       `lib/issues/render-markdown.mjs`. The renderer must use the
 *       temp-then-rename primitive only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

function read(path) {
  return readFileSync(path, "utf-8");
}

/**
 * Walk a directory tree collecting paths matching the predicate.
 */
function collect(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and .git for hygiene.
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      collect(full, pred, acc);
    } else if (entry.isFile() && pred(full, entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("architectural — markdown-rendering-layer (Task 18)", () => {
  // ── (a) No autonomous render in any SKILL.md ──────────────────────────────
  it("no SKILL.md invokes `adev status --render` autonomously", () => {
    const skillsRoot = join(REPO_ROOT, "skills");
    const skillFiles = collect(skillsRoot, (p) => p.endsWith("SKILL.md"));
    if (skillFiles.length === 0) {
      // adev-test does not house the canonical skills; the test passes
      // vacuously when no SKILL.md files exist in this repo.
      return;
    }
    const offenders = [];
    for (const f of skillFiles) {
      const src = read(f);
      // Allow `adev status --pipeline` (read-only) and documentary
      // references; flag executable autonomous render invocations.
      // Heuristic: a line containing `adev status --render` that is NOT
      // inside an obvious documentation/example block. We treat any
      // bare occurrence as a violation per the spec (skills must not
      // autonomously trigger the render).
      if (/adev status\s+(--[a-z-]+\s+)*--render\b/.test(src)) {
        offenders.push(f);
      }
    }
    assert.equal(
      offenders.length,
      0,
      `SKILL.md files autonomously invoke \`adev status --render\`:\n${offenders.join("\n")}`,
    );
  });

  // ── (b) renderMarkdown body has no executable domain-config reference ─────
  it("lifecycle-state.mjs::renderMarkdown body has no domain-config call/import", () => {
    const src = read(join(REPO_ROOT, "lib/lifecycle-state.mjs"));
    const start = src.indexOf("export function renderMarkdown");
    assert.ok(start >= 0, "renderMarkdown must exist");
    const nextExport = src.indexOf("\nexport function ", start + 30);
    const body = nextExport >= 0 ? src.slice(start, nextExport) : src.slice(start);

    // Strip comments so we don't flag the deliberate "no domain-config lookup"
    // documentation. We look for actual executable references.
    const stripped = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => {
        const idx = l.indexOf("//");
        return idx >= 0 ? l.slice(0, idx) : l;
      })
      .join("\n");

    assert.ok(
      !stripped.includes("loadDomainConfig("),
      "renderMarkdown must not call loadDomainConfig",
    );
    assert.ok(
      !/import\s*\(.*domain-config/.test(stripped),
      "renderMarkdown must not dynamic-import domain-config",
    );
    assert.ok(
      !/from\s*['"][^'"]*domain-config[^'"]*['"]/.test(stripped),
      "renderMarkdown body must not contain a `from '...domain-config'` source import",
    );
  });

  // ── (c) No non-atomic writes to rendered files ────────────────────────────
  it("lib/issues/render-markdown.mjs writes rendered files ONLY via temp-then-rename", () => {
    const src = read(join(REPO_ROOT, "lib/issues/render-markdown.mjs"));
    // The only writeFileSync call must target a temp file (suffix `.tmp`).
    // We grep for any writeFileSync invocation whose first argument looks
    // like a rendered-file target (`.md`).
    const writes = [];
    const re = /writeFileSync\s*\(\s*([^,)]+)/g;
    let m;
    while ((m = re.exec(src))) {
      writes.push(m[1].trim());
    }
    // Every writeFileSync must target a `tmp` variable (the temp-file
    // primitive), not a `.md` literal or a target path.
    for (const arg of writes) {
      assert.ok(
        /tmp/i.test(arg),
        `non-atomic write detected: writeFileSync(${arg}) — must use temp-then-rename`,
      );
    }
  });
});
