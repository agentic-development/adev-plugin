// tests/cli/heuristics-migrate-keys.test.mjs
//
// Tests for `adev heuristics migrate-keys` (lib/cli/heuristics.mjs).
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
// Plan: .context-index/specs/features/heuristics/failure-signature-key.plan.md
//       Task 7 (classification and mapping) and Task 8 (rekey, merge,
//       idempotency, reporting).
//
// ⚠ CARRY-FORWARD REVIEW NOTE (adjudicated `structural-architect:
// mutable-hash-input:a15235f5`, BLOCKER → WARNING, operator-accepted,
// unresolved in the spec text):
//
//   Behavior 8 claims a migrated entry "lands on the id a fresh extraction
//   would produce." That claim is FALSE whenever an entry's stored `pattern`
//   has drifted from the pattern text today's extractor would generate.
//   The contract this migration must satisfy is DETERMINISM and
//   LOCATION-INDEPENDENCE, not equality with a fresh-extraction id.
//   No test in this file may assert `migratedId === freshExtractionId`.
//
// ⚠ Every test here operates on a temp fixture store built with
// `createTempDir()`. Nothing in this file may point at the repository's own
// `.context-index/memory/heuristics/` — that is the operator's real data.
//
// The discriminator keys on WHICH RULE COMPOSED THE ID, read off the id
// itself. Evidence provenance is explicitly the wrong property: /adev:retro
// consolidation can merge entries, so one entry may carry both `validation`
// and `recovery` evidence, and a provenance test would destroy a
// recover-produced id.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import {
  PLUGIN_ROOT,
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";
import { serializeHeuristic, listScopeFiles } from "../../lib/heuristics.mjs";
import {
  classifyForRekey,
  foldEvidenceSource,
  RECOVER_CATEGORY_SLUGS,
} from "../../lib/cli/heuristics.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

/** Run `adev heuristics migrate-keys` against a TEMP fixture store. */
function runMigrate(projectRoot, args = []) {
  writeFixture(
    projectRoot,
    ".context-index/manifest.yaml",
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  const r = spawnSync("node", [CLI, "heuristics", "migrate-keys", ...args], {
    encoding: "utf8",
    cwd: projectRoot,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** A fully-formed entry ready to serialize into a fixture scope file. */
function storeEntry(overrides = {}) {
  return {
    id: "some-spec-a1b2c3d4",
    scope: "validation",
    title: "t",
    pattern: "p",
    confidence: "medium",
    evidence: [],
    contradictedBy: [],
    created: "2026-04-01",
    updated: "2026-04-01",
    ...overrides,
  };
}

/** Write a temp fixture scope file. NEVER points at the real store. */
function writeStore(projectRoot, scope, entries) {
  writeFixture(
    projectRoot,
    `.context-index/memory/heuristics/${scope}.md`,
    entries.map((e) => serializeHeuristic(e)).join("\n\n") + "\n",
  );
}

/** Read a fixture scope file's raw bytes. */
function readStore(projectRoot, scope) {
  return readFileSync(
    join(projectRoot, ".context-index/memory/heuristics", `${scope}.md`),
    "utf8",
  );
}

/** Assert a `key=value` summary count exactly, not as a prefix of a longer number. */
function assertCount(stdout, key, value) {
  assert.match(stdout, new RegExp(`^${key}=${value}$`, "m"), `${key}=${value} in:\n${stdout}`);
}

/** Minimal store entry shaped like one parsed by parseHeuristicsFile. */
function entry(overrides = {}) {
  return {
    id: "some-spec-a1b2c3d4",
    scope: "validation",
    title: "t",
    pattern: "p",
    confidence: "medium",
    evidence: [],
    contradictedBy: [],
    ...overrides,
  };
}

/** An evidence element pointing at a validate report. */
function validateEvidence(path, source = "validation") {
  return { path, date: "2026-04-01", source };
}

const REAL_VALIDATE_REPORT =
  ".context-index/specs/features/validation/validate-config-single-source.validate.md";
const REAL_SPEC_PATH =
  ".context-index/specs/features/validation/validate-config-single-source.spec.md";

let root;

beforeEach(() => {
  root = createTempDir();
});

afterEach(() => {
  cleanupTempDir(root);
});

// ── The closed six-value category set ────────────────────────────────────

describe("RECOVER_CATEGORY_SLUGS", () => {
  it("is exactly the six diagnosis categories from skills/recover/SKILL.md", () => {
    assert.deepEqual([...RECOVER_CATEGORY_SLUGS].sort(), [
      "ambiguous-spec",
      "budget-exhaustion",
      "constraint-conflict",
      "missing-context",
      "novel-problem",
      "tool-failure",
    ]);
  });

  it("contains none of the stale slugs _format.md used to document", () => {
    for (const stale of ["spec-violation", "context-gap"]) {
      assert.ok(
        !RECOVER_CATEGORY_SLUGS.includes(stale),
        `'${stale}' is not a real diagnosis category`,
      );
    }
  });
});

// ── Rule 4: alias folding is read-time only ──────────────────────────────

describe("foldEvidenceSource", () => {
  it("folds the three drifted spellings onto the canonical vocabulary", () => {
    assert.deepEqual(foldEvidenceSource("validate"), {
      folded: "validation",
      recognized: true,
    });
    assert.deepEqual(foldEvidenceSource("recover"), {
      folded: "recovery",
      recognized: true,
    });
    assert.deepEqual(foldEvidenceSource("learn"), {
      folded: "manual",
      recognized: true,
    });
  });

  it("passes the canonical spellings through unchanged", () => {
    for (const canonical of ["validation", "recovery", "manual"]) {
      assert.deepEqual(foldEvidenceSource(canonical), {
        folded: canonical,
        recognized: true,
      });
    }
  });

  it("reports an unrecognized spelling rather than silently dropping it", () => {
    const result = foldEvidenceSource("telepathy");
    assert.equal(result.recognized, false);
    assert.equal(result.folded, "telepathy");
  });

  it("treats a missing source as unrecognized rather than throwing", () => {
    assert.equal(foldEvidenceSource(undefined).recognized, false);
  });
});

// ── Rule 1: the prefix test ──────────────────────────────────────────────

describe("classifyForRekey — rule 1, the prefix test", () => {
  it("classifies every recover-prefixed id as out of scope", () => {
    for (const slug of RECOVER_CATEGORY_SLUGS) {
      const result = classifyForRekey(entry({ id: `${slug}-a1b2c3d4` }));
      assert.equal(result.action, "skip", slug);
      assert.equal(result.reason, "out-of-scope", slug);
    }
  });

  it("does not treat a spec slug that merely STARTS WITH a category slug as a category", () => {
    // `missing-contextual-loader` is a spec name, not the `missing-context`
    // category. A startsWith test would wrongly protect it from rekeying.
    const result = classifyForRekey(
      entry({
        id: "missing-contextual-loader-a1b2c3d4",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    );
    assert.equal(result.action, "rekey");
  });

  it("keeps a recover id out of scope no matter what evidence it accumulated", () => {
    // The /adev:retro consolidation case: one entry carrying BOTH validation
    // and recovery evidence. A provenance test would rekey it and destroy a
    // recover-produced id.
    const result = classifyForRekey(
      entry({
        id: "tool-failure-a1b2c3d4",
        evidence: [
          validateEvidence(REAL_VALIDATE_REPORT, "validation"),
          validateEvidence(".context-index/recovery/r1.md", "recovery"),
        ],
      }),
    );
    assert.equal(result.action, "skip");
  });

  it("keeps a recover id out of scope even with a mappable validate evidence path", () => {
    const result = classifyForRekey(
      entry({
        id: "novel-problem-a1b2c3d4",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    );
    assert.equal(result.action, "skip");
  });
});

// ── Rule 2: the ambiguity guard ──────────────────────────────────────────

describe("classifyForRekey — rule 2, the ambiguity guard", () => {
  it("reports a category-prefixed entry carrying validation evidence as ambiguous", () => {
    // A spec named `tool-failure.spec.md` would yield an id indistinguishable
    // from a recover key. Skipping a rekey is recoverable; destroying a
    // recover id is not.
    const result = classifyForRekey(
      entry({
        id: "tool-failure-a1b2c3d4",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validation")],
      }),
    );
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "ambiguous");
  });

  it("reports out-of-scope, NOT ambiguous, when there is no validation evidence", () => {
    // Acceptance criteria 15 and 16 require the two labels to stay
    // distinguishable, so rule 1 must not short-circuit the guard.
    const result = classifyForRekey(
      entry({
        id: "tool-failure-a1b2c3d4",
        evidence: [validateEvidence(".context-index/recovery/r1.md", "recovery")],
      }),
    );
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "out-of-scope");
  });

  it("reports ambiguous via a folded alias too — `validate` counts as `validation`", () => {
    const result = classifyForRekey(
      entry({
        id: "tool-failure-a1b2c3d4",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validate")],
      }),
    );
    assert.equal(result.reason, "ambiguous");
  });

  it("both labels skip — the guard changes the reason, never the action", () => {
    const ambiguous = classifyForRekey(
      entry({
        id: "tool-failure-a1b2c3d4",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validation")],
      }),
    );
    const outOfScope = classifyForRekey(entry({ id: "tool-failure-a1b2c3d4" }));
    assert.equal(ambiguous.action, "skip");
    assert.equal(outOfScope.action, "skip");
    assert.notEqual(ambiguous.reason, outOfScope.reason);
  });
});

// ── Rule 3: evidence path → spec path mapping ────────────────────────────

describe("classifyForRekey — rule 3, the sibling path mapping", () => {
  it("maps a real store `.validate.md` path to its `.spec.md` sibling", () => {
    const result = classifyForRekey(
      entry({ evidence: [validateEvidence(REAL_VALIDATE_REPORT)] }),
    );
    assert.equal(result.action, "rekey");
    assert.equal(result.specPath, REAL_SPEC_PATH);
  });

  it("replaces only the trailing `.validate.md`, keeping the rest of the stem", () => {
    const result = classifyForRekey(
      entry({
        evidence: [validateEvidence("specs/features/x/a.validate.md.validate.md")],
      }),
    );
    assert.equal(result.specPath, "specs/features/x/a.validate.md.spec.md");
  });

  it("skips an in-scope entry with no `.validate.md` evidence path as unrecoverable", () => {
    const result = classifyForRekey(
      entry({ evidence: [validateEvidence(".context-index/sessions/2026-04-01.md")] }),
    );
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "skipped-unrecoverable");
  });

  it("skips an in-scope entry with no evidence at all as unrecoverable", () => {
    const result = classifyForRekey(entry({ evidence: [] }));
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "skipped-unrecoverable");
  });

  it("uses the first `.validate.md` evidence path when several are present", () => {
    const result = classifyForRekey(
      entry({
        evidence: [
          validateEvidence(".context-index/sessions/s.md"),
          validateEvidence(REAL_VALIDATE_REPORT),
          validateEvidence("specs/features/other/b.validate.md"),
        ],
      }),
    );
    assert.equal(result.specPath, REAL_SPEC_PATH);
  });

  it("classifies both legacy slug conventions as in scope", () => {
    // Real store ids: one retains the `.spec` stem, one already strips it.
    for (const id of ["deploy-core-spec-91c5a876", "prototype-core-277ce212"]) {
      const result = classifyForRekey(
        entry({ id, evidence: [validateEvidence(REAL_VALIDATE_REPORT)] }),
      );
      assert.equal(result.action, "rekey", id);
    }
  });
});

// ── Alias folding at classification time ─────────────────────────────────

describe("classifyForRekey — alias folding", () => {
  it("classifies `source: validate` identically to `source: validation`", () => {
    const a = classifyForRekey(
      entry({ evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validate")] }),
    );
    const b = classifyForRekey(
      entry({ evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validation")] }),
    );
    assert.deepEqual(a, b);
  });

  it("reports an unrecognized source spelling on the classification result", () => {
    const result = classifyForRekey(
      entry({ evidence: [validateEvidence(REAL_VALIDATE_REPORT, "telepathy")] }),
    );
    assert.deepEqual(result.unrecognizedSources, ["telepathy"]);
  });

  it("reports no unrecognized sources when every spelling is known", () => {
    const result = classifyForRekey(
      entry({
        evidence: [
          validateEvidence(REAL_VALIDATE_REPORT, "validate"),
          validateEvidence(".context-index/sessions/s.md", "learn"),
        ],
      }),
    );
    assert.deepEqual(result.unrecognizedSources, []);
  });

  it("never mutates the entry it was handed — folding is read-time only", () => {
    const input = entry({
      evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validate")],
    });
    const snapshot = JSON.stringify(input);
    classifyForRekey(input);
    assert.equal(JSON.stringify(input), snapshot);
  });
});

// ── The subcommand walk (Task 7 skeleton) ────────────────────────────────

describe("adev heuristics migrate-keys — store walk", () => {
  it("classifies every scope file and reports the counts", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "some-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
      storeEntry({ id: "tool-failure-b2c3d4e5", scope: "validation" }),
      storeEntry({ id: "orphan-c3d4e5f6", scope: "validation" }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "rekeyed", 1);
    assertCount(r.stdout, "skipped-out-of-scope", 1);
    assertCount(r.stdout, "skipped-unrecoverable", 1);
  });

  it("walks every scope file, not just one", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "a-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);
    writeStore(root, "hooks", [
      storeEntry({
        id: "b-spec-b2c3d4e5",
        scope: "hooks",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "rekeyed", 2);
  });

  it("excludes _format.md from the walk", () => {
    writeStore(root, "validation", [
      storeEntry({ id: "orphan-c3d4e5f6", scope: "validation" }),
    ]);
    // _format.md parses as a heuristic entry, so a missing filter would show
    // up as a second skipped entry. Count-based, not id-based: skipped ids
    // are never printed, so asserting their absence from stdout would pass
    // against any implementation.
    writeFixture(
      root,
      ".context-index/memory/heuristics/_format.md",
      "---\nid: not-an-entry-a1b2c3d4\nscope: x\n---\n",
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "skipped-unrecoverable", 1);
    assertCount(r.stdout, "rekeyed", 0);
  });

  it("does not descend into the archive/ subdirectory", async () => {
    writeStore(root, "validation", [
      storeEntry({ id: "orphan-c3d4e5f6", scope: "validation" }),
    ]);
    writeFixture(
      root,
      ".context-index/memory/heuristics/archive/validation-old.md",
      "---\nid: archived-entry-a1b2c3d4\nscope: validation\n---\n",
    );

    // Asserted against the listing helper directly: the walk is
    // non-recursive, so the archived file must never appear in it.
    const files = await listScopeFiles(root);
    assert.deepEqual(
      files.map((f) => f.slice(root.length + 1)),
      [".context-index/memory/heuristics/validation.md"],
    );
  });

  it("follows a symlinked scope file rather than silently dropping it", async () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "some-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);
    const dir = join(root, ".context-index/memory/heuristics");
    symlinkSync(join(dir, "validation.md"), join(dir, "hooks.md"));

    // Silent under-coverage is worse than an error for a one-shot migration:
    // a dirent for a symlink reports isFile() === false.
    const files = await listScopeFiles(root);
    assert.equal(files.length, 2, files.join(", "));

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "rekeyed", 2);
  });

  it("reports the ambiguous entries by id", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "tool-failure-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validation")],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ambiguous/i);
    assert.match(r.stdout, /tool-failure-a1b2c3d4/);
  });

  it("reports unrecognized source spellings rather than silently skipping them", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "some-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT, "telepathy")],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /telepathy/);
  });

  it("succeeds with an empty summary when the store does not exist", () => {
    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /rekeyed[=: ]+0/);
  });

  it("exits 1 with MIGRATION_READ_FAILED naming an unreadable store file", () => {
    writeStore(root, "validation", [
      storeEntry({ id: "orphan-c3d4e5f6", scope: "validation" }),
    ]);
    const target = join(root, ".context-index/memory/heuristics/validation.md");
    chmodSync(target, 0o000);
    try {
      const r = runMigrate(root);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /MIGRATION_READ_FAILED/);
      assert.match(r.stderr, /validation\.md/);
    } finally {
      chmodSync(target, 0o644);
    }
  });
});

// ── Purity ───────────────────────────────────────────────────────────────

describe("classifyForRekey — purity", () => {
  it("touches no filesystem: repeated calls in different cwds agree", () => {
    const input = entry({ evidence: [validateEvidence(REAL_VALIDATE_REPORT)] });
    const first = classifyForRekey(input);
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      assert.deepEqual(classifyForRekey(input), first);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
