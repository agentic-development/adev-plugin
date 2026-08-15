// tests/cli/heuristics.test.mjs
//
// Tests for `adev heuristics extract` (lib/cli/heuristics.mjs).
//
// Covers Task 1 of the inline-Node extraction sweep — the extraction of
// Check 13 (Success Heuristic Extraction) from skills/validate/SKILL.md
// into a callable CLI verb.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Plan: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md (Task 1)
// Source SKILL.md behavior: skills/validate/SKILL.md "Check 13: Success Heuristic Extraction"
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP (this is an observational helper inside
//     the validate step, not a lifecycle step itself).
//   - Exit codes per Check 13: ALWAYS 0 (SKIP and success both exit 0;
//     Check 13 is observational and never blocks validation).
//   - Stdout line on success: `Check 13: Success Heuristic Extracted — <id> (scope: <scope>, confidence: <confidence>)`
//   - Stdout line on skip:    `Check 13: SKIP — <reason>`
//
// CLI surface:
//   adev heuristics extract --spec <p> --report <p> [--pattern "..."] [--source <golden|adr|spec|default>] [--success-factor "..."]
//   adev heuristics --help  → prints usage
//
// Tests cover:
//   - module exports run + help, no LIFECYCLE_STEP
//   - missing args → exit 1 with usage
//   - spec containment (out-of-bounds path → exit 1)
//   - missing spec file → exit 1
//   - successful extraction → exit 0, stdout has success line, heuristic file written
//   - spec without charter: → exit 0, stdout "SKIP — no charter scope"
//   - spec with charter not in manifest modules[] → falls back to `_global`
//   - id derivation rule (spec-slug + 8-char SHA-256 hex)
//   - pattern derivation: default vs --pattern override
//   - invalid (empty) spec slug → SKIP "invalid spec slug"
//   - report path is required
//   - `--help` prints usage and exits 0

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject({ manifestModules = [] } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-heuristics-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  mkdirSync(join(dir, ".context-index", "heuristics"), { recursive: true });
  let manifestBody = 'project:\n  name: t\n  adev_version: "0.22.0"\n';
  if (manifestModules.length > 0) {
    manifestBody += "modules:\n";
    for (const m of manifestModules) {
      manifestBody += `  - slug: ${m}\n    name: ${m}\n`;
    }
  }
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifestBody);
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function writeSpec(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/heuristics.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/heuristics.mjs does NOT export LIFECYCLE_STEP (observational helper)", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev heuristics with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|extract/i);
  } finally {
    cleanup(dir);
  }
});

test("adev heuristics extract without --spec exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "extract", "--report", "x"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev heuristics extract without --report exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "extract", "--spec", "x"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--report|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev heuristics extract with out-of-bounds --spec path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        "../../../etc/passwd",
        "--report",
        ".context-index/specs/features/m/x.validate.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});

test("adev heuristics extract with missing --spec file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        ".context-index/specs/features/m/does-not-exist.spec.md",
        "--report",
        ".context-index/specs/features/m/x.validate.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/i);
  } finally {
    cleanup(dir);
  }
});

test("adev heuristics --help exits 0 and prints usage", () => {
  const r = spawnSync("node", [CLI, "heuristics", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /heuristics extract/i);
});

// ── Happy path: extraction success ────────────────────────────────────────

test("extracts a success heuristic from a spec with charter scope", () => {
  const dir = makeTempProject({ manifestModules: ["m"] });
  try {
    const specRel = ".context-index/specs/features/m/foo-spec.spec.md";
    writeSpec(
      dir,
      specRel,
      "---\ncharter: m\nstatus: review-passed\n---\n# Live Spec: Foo Spec\n\nBody.\n",
    );
    const reportRel = ".context-index/specs/features/m/foo-spec.validate.md";
    writeSpec(dir, reportRel, "# Validation Report\n\nPASS\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
      ],
      { encoding: "utf8", cwd: dir },
    );

    assert.strictEqual(
      r.status,
      0,
      `expected 0, got ${r.status}: stderr=${r.stderr} stdout=${r.stdout}`,
    );
    assert.match(
      r.stdout,
      /Check 13: Success Heuristic Extracted — .+ \(scope: m, confidence: .+\)/,
    );

    // Heuristic file should exist at the canonical HEURISTICS_DIR path
    // (.context-index/memory/heuristics/<scope>.md per lib/heuristics.mjs).
    const heuristicsFile = join(
      dir,
      ".context-index",
      "memory",
      "heuristics",
      "m.md",
    );
    assert.ok(
      existsSync(heuristicsFile),
      "memory/heuristics/m.md should be written",
    );
    const content = readFileSync(heuristicsFile, "utf8");
    // Spec basename (sans .md) is "foo-spec.spec" → slugged to "foo-spec-spec".
    // This matches skills/validate/SKILL.md Spec-Slug Derivation Rule which
    // strips only the `.md` extension, not `.spec.md`.
    assert.match(content, /id: foo-spec-spec-[0-9a-f]{8}/);
    assert.match(content, /scope: m/);
    assert.match(content, /confidence: medium/);
    assert.match(content, /title: First-run PASS: Foo Spec/);
  } finally {
    cleanup(dir);
  }
});

test("id is deterministic per spec-slug + path + pattern (SHA-256, first 8 hex)", () => {
  const dir = makeTempProject({ manifestModules: ["m"] });
  try {
    const specRel = ".context-index/specs/features/m/bar-spec.spec.md";
    writeSpec(
      dir,
      specRel,
      "---\ncharter: m\n---\n# Live Spec: Bar Spec\n",
    );
    const reportRel = ".context-index/specs/features/m/bar-spec.validate.md";
    writeSpec(dir, reportRel, "# r\n");

    const r1 = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r1.status, 0);

    // Run again — id must be identical, and the heuristic file must still
    // contain exactly one entry for that id (merge path, not new).
    const r2 = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r2.status, 0);

    // Extract the id from each stdout
    const id1 = r1.stdout.match(/Extracted — (\S+)/)?.[1];
    const id2 = r2.stdout.match(/Extracted — (\S+)/)?.[1];
    assert.ok(id1, `failed to extract id from: ${r1.stdout}`);
    assert.strictEqual(id1, id2, "id must be deterministic across invocations");

    // Spec-slug derived from filename: basename(p, ".md") = "bar-spec.spec"
    // then slugged → "bar-spec-spec".
    assert.match(id1, /^bar-spec-spec-[0-9a-f]{8}$/);
  } finally {
    cleanup(dir);
  }
});

test("custom --pattern overrides default success-factor pattern", () => {
  const dir = makeTempProject({ manifestModules: ["m"] });
  try {
    const specRel = ".context-index/specs/features/m/baz.spec.md";
    writeSpec(
      dir,
      specRel,
      "---\ncharter: m\n---\n# Live Spec: Baz\n",
    );
    const reportRel = ".context-index/specs/features/m/baz.validate.md";
    writeSpec(dir, reportRel, "# r\n");
    const customPattern =
      "Apply ADR-0003 review.yaml schema for new diagnostic registries";

    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
        "--pattern",
        customPattern,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}, stdout: ${r.stdout}`);

    const content = readFileSync(
      join(dir, ".context-index", "memory", "heuristics", "m.md"),
      "utf8",
    );
    assert.match(content, new RegExp(customPattern.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")));
  } finally {
    cleanup(dir);
  }
});

// ── SKIP semantics ────────────────────────────────────────────────────────

test("SKIP when spec has no charter field (no charter scope)", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/no-charter.spec.md";
    writeSpec(dir, specRel, "---\nstatus: draft\n---\n# Live Spec: No Charter\n");
    const reportRel = ".context-index/specs/features/m/no-charter.validate.md";
    writeSpec(dir, reportRel, "# r\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Check 13: SKIP — no charter scope/);

    // No heuristic file should be created in either layout (defensive)
    const newDir = join(dir, ".context-index", "memory", "heuristics");
    const legacyDir = join(dir, ".context-index", "heuristics");
    const newEntries = readDirSafe(newDir).filter((f) => f.endsWith(".md"));
    const legacyEntries = readDirSafe(legacyDir).filter((f) => f.endsWith(".md"));
    assert.strictEqual(newEntries.length + legacyEntries.length, 0);
  } finally {
    cleanup(dir);
  }
});

test("falls back to _global scope when charter not in manifest modules[]", () => {
  const dir = makeTempProject({ manifestModules: ["other-module"] });
  try {
    const specRel = ".context-index/specs/features/m/unknown-charter.spec.md";
    writeSpec(
      dir,
      specRel,
      "---\ncharter: not-in-manifest\n---\n# Live Spec: Unknown\n",
    );
    const reportRel =
      ".context-index/specs/features/m/unknown-charter.validate.md";
    writeSpec(dir, reportRel, "# r\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /scope: _global/);
    assert.ok(
      existsSync(
        join(dir, ".context-index", "memory", "heuristics", "_global.md"),
      ),
      "_global.md must be written for fallback scope",
    );
  } finally {
    cleanup(dir);
  }
});

test("SKIP when validation report already exists (not first run)", () => {
  // Per spec: "A validation is first run if and only if no file matching
  // <spec-slug>.validate.md exists in the same directory as the target spec."
  // The CLI verb accepts a --report path; if that file already exists at
  // call time AND the caller passes --check-first-run, we SKIP.
  //
  // Design note: the SKILL.md skill is responsible for first-run detection
  // logic (because it controls the report path lifecycle). The CLI helper
  // exposes the same SKIP path via an explicit flag so callers in tests +
  // automation can opt into first-run gating. The flag is opt-in to keep
  // the helper deterministic and the skill in control.
  const dir = makeTempProject({ manifestModules: ["m"] });
  try {
    const specRel = ".context-index/specs/features/m/qux.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# Live Spec: Qux\n");
    // First-run marker: <spec-slug>.validate.md where spec-slug is the
    // basename minus .md then slug-normalised. For qux.spec.md the slug is
    // "qux-spec", so the marker file lives at qux-spec.validate.md.
    const markerRel =
      ".context-index/specs/features/m/qux-spec.validate.md";
    writeSpec(dir, markerRel, "# already exists\n");
    // The --report argument is the *evidence* path; it can differ from
    // the first-run marker. Use a separate filename so we are sure the
    // SKIP fires off the slug-derived marker, not the --report argument.
    const reportRel = ".context-index/specs/features/m/qux-evidence.md";
    writeSpec(dir, reportRel, "# r\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
        "--check-first-run",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Check 13: SKIP — not first-run PASS/);
  } finally {
    cleanup(dir);
  }
});

test("SKIP with invalid spec slug (e.g., dotfile filename produces empty slug)", () => {
  const dir = makeTempProject({ manifestModules: ["m"] });
  try {
    // A filename of "--.md" — basename minus .md is "--", which after
    // slug normalisation (collapse + trim leading/trailing `-`) becomes "".
    const specRel = ".context-index/specs/features/m/--.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# Live Spec\n");
    const reportRel = ".context-index/specs/features/m/--.validate.md";
    writeSpec(dir, reportRel, "# r\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "extract",
        "--spec",
        specRel,
        "--report",
        reportRel,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Check 13: SKIP — invalid spec slug/);
  } finally {
    cleanup(dir);
  }
});

// ── Helper: read directory entries safely (returns [] for ENOENT) ────────

import { readdirSync } from "node:fs";
function readDirSafe(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PR 8-9 subcommands: retrieve + write
// ─────────────────────────────────────────────────────────────────────────

// Helper: write a heuristic file directly so retrieve has something to find.
function seedHeuristic(dir, scope, body) {
  const dirPath = join(dir, ".context-index", "memory", "heuristics");
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, `${scope}.md`), body);
}

// Minimal heuristic markdown block (matches lib/heuristics.mjs::serializeHeuristic format).
function makeHeuristicBody({
  id = "test-deadbeef",
  scope = "m",
  title = "Test heuristic",
  pattern = "Do the thing",
  confidence = "medium",
  created = "2026-05-15",
  updated = "2026-05-15",
} = {}) {
  return `# Heuristics (scope: ${scope})\n\n---\nid: ${id}\nscope: ${scope}\ntitle: ${title}\npattern: ${pattern}\nconfidence: ${confidence}\ncreated: ${created}\nupdated: ${updated}\nevidence: []\n---\n`;
}

// ── retrieve subcommand ──────────────────────────────────────────────────

test("heuristics retrieve without --module exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics", "retrieve"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--module|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve with invalid --injection-limit exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "retrieve",
        "--module",
        "m",
        "--injection-limit",
        "not-a-number",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--injection-limit|integer/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve with invalid --tier exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m", "--tier", "bogus"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--tier|index|summary|full/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve with no heuristics returns {count:0,rendered:''}", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.count, 0);
    assert.strictEqual(parsed.rendered, "");
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve --format text returns '__NONE__' when empty", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m", "--format", "text"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "__NONE__");
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve returns seeded heuristics (json)", () => {
  const dir = makeTempProject();
  seedHeuristic(
    dir,
    "m",
    makeHeuristicBody({ id: "m-aaaa1111", scope: "m", title: "Module heuristic" }),
  );
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.count, 1);
    assert.match(parsed.rendered, /Module heuristic|m-aaaa1111/);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve --format text returns rendered markdown", () => {
  const dir = makeTempProject();
  seedHeuristic(
    dir,
    "m",
    makeHeuristicBody({ id: "m-bbbb2222", title: "Text heuristic" }),
  );
  try {
    const r = spawnSync(
      "node",
      [CLI, "heuristics", "retrieve", "--module", "m", "--format", "text"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.notStrictEqual(r.stdout.trim(), "__NONE__");
    assert.match(r.stdout, /Text heuristic|m-bbbb2222/);
  } finally {
    cleanup(dir);
  }
});

test("heuristics retrieve --injection-limit 0 returns empty result", () => {
  const dir = makeTempProject();
  seedHeuristic(dir, "m", makeHeuristicBody({ id: "m-cccc3333" }));
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "retrieve",
        "--module",
        "m",
        "--injection-limit",
        "0",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.count, 0);
  } finally {
    cleanup(dir);
  }
});

// ── write subcommand ─────────────────────────────────────────────────────

test("heuristics write without required flags exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "heuristics", "write"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /missing|--id|--scope|--title|--pattern/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with invalid --confidence exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "x-12345678",
        "--scope",
        "m",
        "--title",
        "T",
        "--pattern",
        "P",
        "--confidence",
        "ultra",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--confidence|low|medium|high/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with partial evidence flags exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "x-12345678",
        "--scope",
        "m",
        "--title",
        "T",
        "--pattern",
        "P",
        "--evidence-source",
        "recovery",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /evidence/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write succeeds and emits success line", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "missing-context-aaaa1111",
        "--scope",
        "_global",
        "--title",
        "Missing context: cache layer assumptions",
        "--pattern",
        "Include cache invalidation docs in context packets for hook tasks",
        "--confidence",
        "low",
        "--evidence-source",
        "recovery",
        "--evidence-path",
        ".context-index/hygiene/recoveries/2026-05-15-x.md",
        "--evidence-date",
        "2026-05-15",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Heuristic written: missing-context-aaaa1111/);
    // Verify the file was created.
    const path = join(dir, ".context-index", "memory", "heuristics", "_global.md");
    assert.ok(existsSync(path), "heuristic file should be written");
    const body = readFileSync(path, "utf8");
    assert.match(body, /missing-context-aaaa1111/);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with schema error degrades to stderr + exit 0", () => {
  const dir = makeTempProject();
  try {
    // Empty id triggers HEURISTICS_SCHEMA_ERROR from validateEntry.
    const r = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "write",
        "--id",
        "x",
        "--scope",
        "m",
        "--title",
        "T",
        "--pattern",
        "P",
        "--confidence",
        "low",
      ],
      { encoding: "utf8", cwd: dir },
    );
    // Either succeeds (if validateEntry accepts the short id) or degrades to
    // exit 0 with stderr note. Both are acceptable per write subcommand spec.
    assert.strictEqual(r.status, 0);
  } finally {
    cleanup(dir);
  }
});

// ── write --signature (Behavior 5: recover-side signature persistence) ────

function runWriteCli(dir, extraArgs = [], { id = "missing-context-a1b2c3d4" } = {}) {
  return spawnSync(
    "node",
    [
      CLI,
      "heuristics",
      "write",
      "--id",
      id,
      "--scope",
      "_global",
      "--title",
      "T",
      "--pattern",
      "P",
      ...extraArgs,
    ],
    { encoding: "utf8", cwd: dir },
  );
}

function readGlobalStore(dir) {
  return readFileSync(
    join(dir, ".context-index", "memory", "heuristics", "_global.md"),
    "utf8",
  );
}

test("heuristics write --signature persists the signature field", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, ["--signature", "recover-a1b2c3d4"]);
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.match(body, /^signature: recover-a1b2c3d4$/m);
  } finally {
    cleanup(dir);
  }
});

test("heuristics write without --signature writes no signature field", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, [], { id: "tool-failure-0badc0de" });
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.ok(!/^signature:/m.test(body), "the key is omitted, not written empty");
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with an empty --signature omits the key and exits 0", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, ["--signature", ""], { id: "tool-failure-0badc0de" });
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.ok(!/^signature:/m.test(body), "empty signature must not be serialized");
  } finally {
    cleanup(dir);
  }
});

test("heuristics write with a malformed --signature degrades to stderr + exit 0", () => {
  const dir = makeTempProject();
  try {
    const r = runWriteCli(dir, ["--signature", "Bad Value"], {
      id: "tool-failure-0badc0de",
    });
    assert.strictEqual(r.status, 0);
    assert.match(r.stderr, /extraction skipped/);
    assert.match(r.stderr, /signature/i);
  } finally {
    cleanup(dir);
  }
});

test("heuristics signature output composes into heuristics write --signature", () => {
  const dir = makeTempProject();
  try {
    const sig = spawnSync(
      "node",
      [
        CLI,
        "heuristics",
        "signature",
        "--origin",
        "recover",
        "--text",
        "Timeout waiting for the fixture server on port 8080",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(sig.status, 0, sig.stderr);
    const value = sig.stdout.trim();
    assert.match(value, /^recover-[0-9a-f]{8}$/);

    const r = runWriteCli(dir, ["--signature", value]);
    assert.strictEqual(r.status, 0, r.stderr);
    const body = readGlobalStore(dir);
    assert.match(body, new RegExp(`^signature: ${value}$`, "m"));
  } finally {
    cleanup(dir);
  }
});

test("heuristics write --signature is EXISTING-wins on a re-write of the same id", () => {
  const dir = makeTempProject();
  try {
    const first = runWriteCli(dir, ["--signature", "recover-aaaaaaaa"]);
    assert.strictEqual(first.status, 0, first.stderr);

    const second = runWriteCli(dir, ["--signature", "recover-bbbbbbbb"]);
    assert.strictEqual(second.status, 0, second.stderr);
    assert.match(second.stderr, /signature divergence/);
    assert.match(second.stderr, /recover-aaaaaaaa/);
    assert.match(second.stderr, /recover-bbbbbbbb/);

    const body = readGlobalStore(dir);
    assert.match(body, /^signature: recover-aaaaaaaa$/m);
    assert.ok(
      !/recover-bbbbbbbb/.test(body),
      "the incoming signature must not overwrite the stored one",
    );
  } finally {
    cleanup(dir);
  }
});
