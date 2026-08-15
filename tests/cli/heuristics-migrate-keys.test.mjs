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
import { chmodSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import {
  PLUGIN_ROOT,
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers.mjs";
import {
  serializeHeuristic,
  listScopeFiles,
  deriveHeuristicId,
} from "../../lib/heuristics.mjs";
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

/** Extract every `id:` from a fixture scope file, in file order. */
function idsIn(projectRoot, scope) {
  return [...readStore(projectRoot, scope).matchAll(/^id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
}

/**
 * Parse a fixture scope file into `{id: rawBlock}` so a single entry's exact
 * bytes can be diffed against a pre-migration snapshot.
 */
function entriesByIdIn(projectRoot, scope) {
  return Object.fromEntries(
    readStore(projectRoot, scope)
      .split(/^---$/m)
      .map((block) => [block.match(/^id:\s*(\S+)\s*$/m)?.[1], block])
      .filter(([id]) => id !== undefined),
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

  it("skips an in-scope entry with no recognized report suffix as unrecoverable", () => {
    const result = classifyForRekey(
      entry({ evidence: [validateEvidence(".context-index/sessions/2026-04-01.md")] }),
    );
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "skipped-unrecoverable");
  });

  // Regression: the first real migration run stranded 3 of 24 rekeyable entries
  // because the mapping recognized only `.validate.md`. Older reports in this
  // store are named `<stem>-validation.md`.
  it("maps a legacy `-validation.md` path to its `.spec.md` sibling", () => {
    const result = classifyForRekey(
      entry({
        evidence: [
          validateEvidence(
            ".context-index/specs/features/unified-gates/unified-gate-system-validation.md",
          ),
        ],
      }),
    );
    assert.equal(result.action, "rekey");
    assert.equal(
      result.specPath,
      ".context-index/specs/features/unified-gates/unified-gate-system.spec.md",
    );
  });

  it("does not strand the three real `-validation.md` store entries", () => {
    const legacyReports = [
      ".context-index/specs/features/multi-repo-workspace/workspace-aware-vision-validation.md",
      ".context-index/specs/features/strategic-planning/adev-build-skill-validation.md",
      ".context-index/specs/features/unified-gates/unified-gate-system-validation.md",
    ];
    for (const path of legacyReports) {
      const result = classifyForRekey(entry({ evidence: [validateEvidence(path)] }));
      assert.equal(result.action, "rekey", `${path} must be rekeyable`);
      assert.ok(result.specPath.endsWith(".spec.md"));
      assert.ok(!result.specPath.includes("-validation"));
    }
  });

  it("prefers the longer `-validation.md` suffix over any shorter match", () => {
    // A stem that itself ends in `.validate` must not be mis-split.
    const result = classifyForRekey(
      entry({ evidence: [validateEvidence("specs/features/x/a-validation.md")] }),
    );
    assert.equal(result.specPath, "specs/features/x/a.spec.md");
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

// ── The write path (Task 8, Behaviors 9 and 10) ──────────────────────────
//
// ⚠ The new key is deriveHeuristicId(<spec-slug from the mapped spec path>,
// <repo-relative mapped spec path>, <the entry's stored `pattern`>). That is
// DETERMINISTIC and LOCATION-INDEPENDENT. It is NOT necessarily the id a fresh
// extraction would produce — see the carry-forward note at the top of this
// file. Nothing below asserts that equality.

describe("adev heuristics migrate-keys — rekey", () => {
  it("migrates a legacy validate entry and leaves a recover entry byte-identical", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
      storeEntry({ id: "tool-failure-b2c3d4e5", scope: "validation" }),
    ]);
    const before = entriesByIdIn(root, "validation")["tool-failure-b2c3d4e5"];

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "rekeyed", 1);

    const ids = idsIn(root, "validation");
    assert.ok(!ids.includes("legacy-spec-a1b2c3d4"), "the legacy id must be gone");
    assert.ok(ids.includes("tool-failure-b2c3d4e5"), "the recover id must survive");
    assert.equal(
      entriesByIdIn(root, "validation")["tool-failure-b2c3d4e5"],
      before,
      "the skipped entry must be byte-identical afterward",
    );
  });

  it("recomputes the key from the mapped spec path and the stored pattern", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        pattern: "some stored pattern",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    // Deterministic and location-independent. NOT asserted equal to a fresh
    // extraction id — the stored pattern may have drifted from what today's
    // extractor would generate.
    assert.deepEqual(idsIn(root, "validation"), [
      deriveHeuristicId(
        "validate-config-single-source",
        REAL_SPEC_PATH,
        "some stored pattern",
      ),
    ]);
  });

  it("preserves every field on rekey, diffed against a pre-migration snapshot", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        title: "a title",
        pattern: "a pattern",
        antiPattern: "an anti-pattern",
        tags: ["alpha", "beta"],
        signature: "validate-99887766",
        confidence: "high",
        created: "2026-01-02",
        evidence: [
          validateEvidence(REAL_VALIDATE_REPORT),
          validateEvidence(".context-index/sessions/s.md", "learn"),
        ],
        contradictedBy: [validateEvidence(".context-index/sessions/c.md", "recover")],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);

    const [newId] = idsIn(root, "validation");
    const block = entriesByIdIn(root, "validation")[newId];
    assert.match(block, /^title: a title$/m);
    assert.match(block, /^pattern: a pattern$/m);
    assert.match(block, /^anti-pattern: an anti-pattern$/m);
    assert.match(block, /^tags: \[alpha, beta\]$/m);
    assert.match(block, /^signature: validate-99887766$/m);
    assert.match(block, /^confidence: high$/m);
    assert.match(block, /^created: 2026-01-02$/m);
    assert.match(block, /source: learn$/m);
    assert.match(block, /source: recover$/m);
    assert.match(block, /path: \.context-index\/sessions\/c\.md/);
  });

  it("never rewrites a stored evidence source spelling", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validate")],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    const raw = readStore(root, "validation");
    assert.match(raw, /source: validate$/m, "the drifted spelling must survive verbatim");
    assert.doesNotMatch(raw, /source: validation$/m);
  });

  it("converges both legacy slug conventions on the canonical stripped form", () => {
    // Real store ids: one retains the `.spec` stem, one already strips it.
    writeStore(root, "validation", [
      storeEntry({
        id: "deploy-core-spec-91c5a876",
        scope: "validation",
        pattern: "p1",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
      storeEntry({
        id: "prototype-core-277ce212",
        scope: "validation",
        pattern: "p2",
        evidence: [
          validateEvidence(".context-index/specs/features/prototype/prototype-core.validate.md"),
        ],
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "rekeyed", 2);
    const ids = idsIn(root, "validation");
    for (const id of ids) {
      assert.doesNotMatch(id, /-spec-[0-9a-f]{8}$/, `'${id}' must not retain a .spec stem`);
    }
    assert.ok(ids.some((id) => id.startsWith("validate-config-single-source-")));
    assert.ok(ids.some((id) => id.startsWith("prototype-core-")));
  });

  it("leaves a file with nothing to rekey completely untouched", () => {
    writeStore(root, "hooks", [storeEntry({ id: "tool-failure-b2c3d4e5", scope: "hooks" })]);
    const before = readStore(root, "hooks");

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readStore(root, "hooks"), before);
  });

  it("writes nothing when --dry-run is passed", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);
    const before = readStore(root, "validation");

    const r = runMigrate(root, ["--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "rekeyed", 1);
    assert.equal(readStore(root, "validation"), before);
    // The summary must be distinguishable from a real run's.
    assert.match(r.stdout, /dry run — nothing written/);
  });

  it("preserves the absorbed entry's signature, tags and anti-pattern on merge", () => {
    writeStore(
      root,
      "validation",
      collidingPair({
        first: { signature: undefined, tags: [], antiPattern: "" },
        second: {
          signature: "validate-99887766",
          tags: ["alpha"],
          antiPattern: "an anti-pattern",
        },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    const raw = readStore(root, "validation");
    assert.match(raw, /^signature: validate-99887766$/m);
    assert.match(raw, /^tags: \[alpha\]$/m);
    assert.match(raw, /^anti-pattern: an anti-pattern$/m);
  });
});

// ── Behavior 9: collision merge ──────────────────────────────────────────

/**
 * Two entries whose different legacy ids recompute onto ONE new id: same
 * mapped spec path, same stored pattern. This is the duplicate-entry bug the
 * whole spec exists to fix.
 */
function collidingPair({ first = {}, second = {} } = {}) {
  return [
    storeEntry({
      id: "legacy-one-a1b2c3d4",
      scope: "validation",
      pattern: "shared pattern",
      evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      ...first,
    }),
    storeEntry({
      id: "legacy-two-b2c3d4e5",
      scope: "validation",
      pattern: "shared pattern",
      evidence: [validateEvidence(REAL_VALIDATE_REPORT, "validate")],
      ...second,
    }),
  ];
}

describe("adev heuristics migrate-keys — collision merge", () => {
  it("merges rather than overwrites, and reports the merge", () => {
    writeStore(root, "validation", collidingPair());

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "merged", 1);
    assert.equal(idsIn(root, "validation").length, 1, "the pair must collapse to one entry");
  });

  it("unions the evidence arrays, deduplicated by (path, date)", () => {
    writeStore(
      root,
      "validation",
      collidingPair({
        first: { evidence: [validateEvidence(REAL_VALIDATE_REPORT)] },
        second: {
          evidence: [
            validateEvidence(REAL_VALIDATE_REPORT),
            validateEvidence(".context-index/specs/features/x/other.validate.md"),
          ],
        },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    const raw = readStore(root, "validation");
    assert.match(raw, /other\.validate\.md/);
    assert.equal(
      [...raw.matchAll(/path: \.context-index\/specs\/features\/validation\/validate-config-single-source\.validate\.md/g)].length,
      1,
      "the shared evidence ref must appear once",
    );
  });

  it("keeps the higher confidence when the contradiction invariant permits", () => {
    writeStore(
      root,
      "validation",
      collidingPair({ first: { confidence: "low" }, second: { confidence: "high" } }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readStore(root, "validation"), /^confidence: high$/m);
  });

  it("unions the contradicted-by arrays from BOTH sides", () => {
    // Both sides must contribute, or an implementation that ignored
    // `incoming.contradictedBy` entirely would pass — `mergeColliding`
    // spreads `...existing`.
    writeStore(
      root,
      "validation",
      collidingPair({
        first: { contradictedBy: [validateEvidence(".context-index/sessions/c1.md")] },
        second: { contradictedBy: [validateEvidence(".context-index/sessions/c2.md")] },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    // Two contradictions archive the merged entry, so the union lands there.
    const archiveDir = join(root, ".context-index/memory/heuristics/archive");
    const body = readFileSync(join(archiveDir, readdirSync(archiveDir)[0]), "utf8");
    assert.match(body, /c1\.md/);
    assert.match(body, /c2\.md/);
  });

  it("a single contradiction from the incoming side alone survives the merge", () => {
    writeStore(
      root,
      "validation",
      collidingPair({
        second: { contradictedBy: [validateEvidence(".context-index/sessions/c2.md")] },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readStore(root, "validation"), /c2\.md/);
  });

  it("a merge whose contradicted-by union reaches two entries does not remain at high", () => {
    // Taking the higher confidence without re-checking would mint an entry
    // the charter invariant forbids.
    writeStore(
      root,
      "validation",
      collidingPair({
        first: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c1.md")],
        },
        second: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c2.md")],
        },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(
      readStore(root, "validation"),
      /^confidence: high$/m,
      "two contradictions cannot remain at high confidence",
    );
  });

  it("the archived record does not claim high confidence with two contradictions", () => {
    writeStore(
      root,
      "validation",
      collidingPair({
        first: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c1.md")],
        },
        second: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c2.md")],
        },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    const archiveDir = join(root, ".context-index/memory/heuristics/archive");
    const body = readFileSync(join(archiveDir, readdirSync(archiveDir)[0]), "utf8");
    assert.doesNotMatch(body, /^confidence: high$/m);
  });

  it("keeps the EARLIER created date of the merged pair", () => {
    writeStore(
      root,
      "validation",
      collidingPair({
        first: { created: "2026-05-05" },
        second: { created: "2026-01-01" },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readStore(root, "validation"), /^created: 2026-01-01$/m);
  });

  it("refuses to overwrite an existing archived entry and writes nothing", () => {
    const pair = collidingPair({
      first: {
        confidence: "high",
        contradictedBy: [validateEvidence(".context-index/sessions/c1.md")],
      },
      second: {
        confidence: "high",
        contradictedBy: [validateEvidence(".context-index/sessions/c2.md")],
      },
    });
    writeStore(root, "validation", pair);
    const before = readStore(root, "validation");

    // Pre-seed the archive target the merge would land on.
    const mergedId = deriveHeuristicId(
      "validate-config-single-source",
      REAL_SPEC_PATH,
      "shared pattern",
    );
    writeFixture(
      root,
      `.context-index/memory/heuristics/archive/validation-${mergedId}.md`,
      "---\nid: pre-existing\nscope: validation\n---\n",
    );

    const r = runMigrate(root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /MIGRATION_ARCHIVE_CONFLICT/);
    assert.equal(readStore(root, "validation"), before, "prior state must be intact");
  });

  it("archiving a merged entry does not also drag out an untouched duplicate of its id", () => {
    // Regression: tracking archival by ID rather than by slot pulled BOTH the
    // untouched pre-existing duplicate and the merged entry out of the scope
    // file, and wrote both to one archive path — destroying one outright.
    const mergedId = deriveHeuristicId(
      "validate-config-single-source",
      REAL_SPEC_PATH,
      "shared pattern",
    );
    writeStore(root, "validation", [
      // Two pre-existing entries already sharing the id the merge lands on.
      // Neither is rekeyable (no .validate.md evidence), so the second is
      // never merged and must survive the archival of the first's slot.
      storeEntry({ id: mergedId, scope: "validation", title: "first-untouched" }),
      storeEntry({ id: mergedId, scope: "validation", title: "second-untouched" }),
      ...collidingPair({
        first: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c1.md")],
        },
        second: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c2.md")],
        },
      }),
    ]);

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);

    // Exactly one entry archived, and exactly one archive file written.
    const archiveDir = join(root, ".context-index/memory/heuristics/archive");
    assert.equal(readdirSync(archiveDir).length, 1);
    assert.match(r.stdout, /^archived=1$/m);

    // The untouched duplicate is still in the scope file, not swept away.
    const scope = readStore(root, "validation");
    assert.match(scope, /title: second-untouched/);
  });

  it("leaves a PRE-EXISTING duplicate id untouched — the migration did not create it", () => {
    // Two out-of-scope entries that already share an id. Merging them would
    // rewrite entries the contract says stay byte-identical.
    writeStore(root, "hooks", [
      storeEntry({ id: "tool-failure-b2c3d4e5", scope: "hooks", title: "first" }),
      storeEntry({ id: "tool-failure-b2c3d4e5", scope: "hooks", title: "second" }),
    ]);
    const before = readStore(root, "hooks");

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assertCount(r.stdout, "merged", 0);
    assert.equal(readStore(root, "hooks"), before);
  });

  it("at two contradictions the merged entry is archived, not left in the scope file", () => {
    writeStore(
      root,
      "validation",
      collidingPair({
        first: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c1.md")],
        },
        second: {
          confidence: "high",
          contradictedBy: [validateEvidence(".context-index/sessions/c2.md")],
        },
      }),
    );

    const r = runMigrate(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(idsIn(root, "validation").length, 0, "the archived entry leaves the scope file");
    assert.match(r.stdout, /^archived=1$/m);

    const archiveDir = join(root, ".context-index/memory/heuristics/archive");
    const archived = readdirSync(archiveDir);
    assert.equal(archived.length, 1, archived.join(", "));
    const body = readFileSync(join(archiveDir, archived[0]), "utf8");
    assert.match(body, /^archived-reason: contradicted$/m);
    assert.match(body, /c1\.md/);
    assert.match(body, /c2\.md/);
  });
});

// ── Behavior 10: idempotency ─────────────────────────────────────────────

describe("adev heuristics migrate-keys — idempotency", () => {
  it("a second run is a no-op: zero rekeyed and the store is byte-identical", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
      storeEntry({ id: "tool-failure-b2c3d4e5", scope: "validation" }),
    ]);

    const first = runMigrate(root);
    assert.equal(first.status, 0, first.stderr);
    assertCount(first.stdout, "rekeyed", 1);
    const afterFirst = readStore(root, "validation");

    const second = runMigrate(root);
    assert.equal(second.status, 0, second.stderr);
    assertCount(second.stdout, "rekeyed", 0);
    assert.equal(readStore(root, "validation"), afterFirst, "the store must be byte-identical");
  });

  it("a third run is still a no-op", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);
    runMigrate(root);
    const afterFirst = readStore(root, "validation");
    runMigrate(root);
    runMigrate(root);
    assert.equal(readStore(root, "validation"), afterFirst);
  });

  it("an unreadable store file writes nothing at all, not even to a readable sibling", () => {
    writeStore(root, "validation", [
      storeEntry({
        id: "legacy-spec-a1b2c3d4",
        scope: "validation",
        evidence: [validateEvidence(REAL_VALIDATE_REPORT)],
      }),
    ]);
    writeStore(root, "hooks", [storeEntry({ id: "orphan-c3d4e5f6", scope: "hooks" })]);
    const before = readStore(root, "validation");

    const blocked = join(root, ".context-index/memory/heuristics/hooks.md");
    chmodSync(blocked, 0o000);
    try {
      const r = runMigrate(root);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /MIGRATION_READ_FAILED/);
      assert.equal(readStore(root, "validation"), before, "prior state must be intact");
    } finally {
      chmodSync(blocked, 0o644);
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
