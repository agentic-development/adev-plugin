/**
 * Validate failure capture — the validate Stop hook.
 *
 * Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
 *
 * Task 3 scope: the heuristic title prefix is derived from the validate
 * outcome (`prefixFor(verdict.overall)`) instead of being interpolated inline
 * at the title site. PASS output must stay byte-identical to the previous
 * hardcoded form.
 *
 * Task 4 scope: a FAIL verdict is captured too — from `checks[].id` and
 * `checks[].outcome` and NOTHING else. The store is git-tracked and
 * `/adev:sync` copies it into four agent files, so the read set is pinned by
 * a canary test rather than trusted to review.
 *
 * Hook protocol (constitution principle 4): stdout is the protocol channel,
 * warnings go to stderr, and the process always exits 0.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import {
  canonicalSpecSlug,
  deriveHeuristicId,
  deriveSignature,
  parseHeuristicsFile,
  readHeuristics,
} from "../../lib/heuristics.mjs";

const HOOK = join(PLUGIN_ROOT, "hooks", "post-validate-extract-heuristics.mjs");

const SPEC_REL = ".context-index/specs/features/validation/validate-config-single-source.spec.md";
const REPORT_REL = ".context-index/specs/features/validation/validate-config-single-source.validate.md";
const SPEC_TITLE = "Validate config single source";

let roots = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const r of roots) cleanupTempDir(r);
});

/**
 * Build a temp project root containing the spec fixture. The root is
 * registered for cleanup immediately, so a throw inside `writeFixture` cannot
 * leak the directory.
 */
function newProject() {
  const root = createTempDir();
  roots.push(root);
  writeFixture(root, SPEC_REL, `---\ncharter: validation\n---\n\n# Live Spec: ${SPEC_TITLE}\n`);
  return root;
}

/**
 * Drive the Stop hook with verdict metadata on stdin.
 *
 * Mirrors tests/hooks/post-validate-heuristic-id.test.mjs. `checks` is
 * included in the payload only when supplied, so a caller that does not care
 * about per-check detail gets exactly the metadata the hook has always seen.
 */
function runHookWith({
  projectRoot,
  specPath = SPEC_REL,
  overall = "PASS",
  specTitle = SPEC_TITLE,
  checks,
  reportPath = REPORT_REL,
  metadataExtra,
  toolResultExtra,
  env = {},
} = {}) {
  const verdictMetadata = {
    overall,
    spec_path: specPath,
    charter: "validation",
    spec_title: specTitle,
    report_path: reportPath,
  };
  if (checks !== undefined) verdictMetadata.checks = checks;
  // Extra prose keys planted as siblings of the fields the hook is allowed to
  // read. Absent unless a test supplies them, so Task 3's calls are unchanged.
  if (metadataExtra !== undefined) Object.assign(verdictMetadata, metadataExtra);

  const toolResult = { verdict_metadata: verdictMetadata };
  // Subprocess-style channels alongside verdict_metadata (stdout/stderr/...).
  if (toolResultExtra !== undefined) Object.assign(toolResult, toolResultExtra);

  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "adev:validate", tool_result: toolResult }),
    encoding: "utf8",
    cwd: projectRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      CLAUDE_PROJECT_ROOT: projectRoot,
      ...env,
    },
    timeout: 20_000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function storePath(projectRoot, scope = "validation") {
  return join(projectRoot, ".context-index", "memory", "heuristics", `${scope}.md`);
}

/** Read the stored titles out of a scope file, in on-disk order. */
function storedTitles(projectRoot, scope = "validation") {
  const file = storePath(projectRoot, scope);
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
  return [...raw.matchAll(/^title:[ \t]*(.*)$/gm)].map((m) => m[1]);
}

/**
 * Parse the stored entries out of a scope file, in on-disk order.
 *
 * Uses the library's own parser rather than hand-rolling markdown reads, so
 * these assertions cannot drift from the serializer.
 */
async function parseStore(projectRoot, scope = "validation") {
  return parseHeuristicsFile(storePath(projectRoot, scope));
}

async function storedIds(projectRoot, scope = "validation") {
  return (await parseStore(projectRoot, scope)).map((e) => e.id);
}

async function storedSignatures(projectRoot, scope = "validation") {
  return (await parseStore(projectRoot, scope)).map((e) => e.signature);
}

async function storedEvidence(projectRoot, scope = "validation") {
  return (await parseStore(projectRoot, scope)).map((e) => e.evidence || []);
}

/** Raw on-disk bytes of a scope file — the leak surface itself. */
function rawStore(projectRoot, scope = "validation") {
  const file = storePath(projectRoot, scope);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** Add a second spec fixture to an existing project root. */
function addSpec(projectRoot, relPath, title) {
  writeFixture(projectRoot, relPath, `---\ncharter: validation\n---\n\n# Live Spec: ${title}\n`);
  return relPath;
}

/**
 * A plugin root whose `lib/heuristics.mjs` re-exports the real module but
 * replaces `deriveSignature` with a throwing stub. `export *` skips names that
 * are also exported locally, so every other binding stays real.
 */
function makeSignatureShimRoot() {
  const shimRoot = createTempDir();
  roots.push(shimRoot);
  const realUrl = pathToFileURL(join(PLUGIN_ROOT, "lib", "heuristics.mjs")).href;
  writeFixture(
    shimRoot,
    "lib/heuristics.mjs",
    `export * from ${JSON.stringify(realUrl)};\n` +
      `export function deriveSignature() { throw new Error("shim: deriveSignature exploded"); }\n`,
  );
  return shimRoot;
}

/** Two failing checks, already in sorted order. */
const FAILING = [
  { id: "validate.check-1-quality-gates", outcome: "FAIL" },
  { id: "validate.check-3-spec-compliance", outcome: "FAIL" },
];
const FAILING_LIST = "validate.check-1-quality-gates, validate.check-3-spec-compliance";

// ── The PASS prefix is derived from the outcome ──────────────────────────

describe("validate Stop hook — the title prefix is derived from the outcome", () => {
  it("the PASS title prefix is derived from verdict.overall, not hardcoded", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS" });
    assert.equal(r.exitCode, 0, r.stderr);

    const titles = storedTitles(root);
    assert.equal(titles.length, 1, `expected one entry, got ${JSON.stringify(titles)} — ${r.stderr}`);
    assert.match(titles[0], /^First-run PASS: /);
  });

  it("the prefix derivation is a function of the outcome", () => {
    const src = readFileSync(HOOK, "utf8");
    assert.ok(
      !/`First-run PASS: \$\{/.test(src),
      "the prefix must not be interpolated inline at the title site",
    );
    assert.match(src, /function prefixFor\s*\(/);
  });

  it("prefixFor('PASS') output is byte-identical to the previous hardcoded form", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS" });
    assert.equal(r.exitCode, 0, r.stderr);

    assert.deepEqual(storedTitles(root), [`First-run PASS: ${SPEC_TITLE}`]);
  });

  it("the 120-char cap truncation semantics are unchanged for a long spec title", () => {
    const root = newProject();
    // "First-run PASS: " is 16 chars; 150 X's overflows the 120-char cap, so
    // cap() keeps the first 117 chars and appends "...".
    const r = runHookWith({ projectRoot: root, overall: "PASS", specTitle: "X".repeat(150) });
    assert.equal(r.exitCode, 0, r.stderr);

    const expected = `First-run PASS: ${"X".repeat(101)}...`;
    assert.equal(expected.length, 120, "the expectation itself must sit exactly at the cap");
    assert.deepEqual(storedTitles(root), [expected]);
  });
});

// ── Verdicts that carry nothing capturable write nothing ─────────────────

describe("validate Stop hook — verdicts with nothing capturable write nothing", () => {
  it("a FAIL verdict with no checks[] array writes no entry and exits 0", () => {
    // Superseded framing: before FAIL capture existed this pinned "FAIL never
    // writes". It now pins the identifiers-only consequence — with no
    // `checks[]` there is no identifier to name, and the hook declines to
    // reach into prose for material rather than widening its read set.
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "FAIL" });

    assert.equal(r.exitCode, 0, "capture is non-blocking — the hook still exits 0");
    assert.equal(existsSync(storePath(root)), false, "no identifiers, no entry");
    assert.equal(r.stdout, "", "stdout is the hook protocol channel");
  });

  it("an outcome that is neither PASS nor FAIL writes no entry and exits 0", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "BLOCK" });

    assert.equal(r.exitCode, 0);
    assert.equal(existsSync(storePath(root)), false, "no entry may be written on BLOCK");
    assert.equal(r.stdout, "");
  });
});

// ── Hook protocol invariants across every path exercised ─────────────────

describe("validate Stop hook — protocol invariants", () => {
  it("exits 0 with empty stdout on the PASS path", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS" });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "");
  });

  it("exits 0 with empty stdout on the long-title PASS path", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "PASS", specTitle: "X".repeat(150) });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "");
  });
});

// ── Task 4: FAIL-path capture ────────────────────────────────────────────

describe("validate Stop hook — FAIL capture", () => {
  it("a FAIL verdict writes an entry with signature, id, pattern and anti-pattern", async () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });

    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "", "stdout is the hook protocol channel");

    const entries = await parseStore(root);
    assert.equal(entries.length, 1, `expected one entry — ${r.stderr}`);
    const [entry] = entries;

    assert.match(entry.id, /^[a-z0-9-]+-[0-9a-f]{8}$/);
    assert.match(entry.signature, /^validate-[0-9a-f]{8}$/);
    assert.equal(entry.confidence, "low");
    assert.equal(entry.evidence.length, 1);
    assert.equal(entry.evidence[0].source, "validation");
    assert.equal(entry.evidence[0].path, REPORT_REL);
    assert.ok(entry.pattern, "pattern is required");
    assert.ok(entry.antiPattern, "antiPattern is required");
    assert.match(entry.title, /^Validate FAIL: /);

    // Cross-check the derived values against the library rather than
    // hardcoding digests.
    assert.equal(
      entry.id,
      deriveHeuristicId(canonicalSpecSlug(SPEC_REL), SPEC_REL, entry.pattern),
      "the id is spec-scoped and composed exactly as the PASS path composes it",
    );
    assert.equal(
      entry.signature,
      deriveSignature("validate", "validate.check-1-quality-gates validate.check-3-spec-compliance"),
      "the signature hashes the failed check ids alone — no spec identity",
    );

    // The entry is reachable through the public read path too.
    const viaRead = await readHeuristics(root, { module: "validation" });
    assert.equal(viaRead.length, 1);
    assert.equal(viaRead[0].id, entry.id);
  });

  it("PASS and FAIL entries are distinguishable by title", async () => {
    const root = newProject();
    assert.equal(runHookWith({ projectRoot: root, overall: "PASS" }).exitCode, 0);
    const r = runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });
    assert.equal(r.exitCode, 0, r.stderr);

    const titles = storedTitles(root);
    assert.equal(titles.length, 2, `expected both entries — ${JSON.stringify(titles)}`);
    assert.equal(titles.filter((t) => t.startsWith("First-run PASS: ")).length, 1);
    assert.equal(titles.filter((t) => t.startsWith("Validate FAIL: ")).length, 1);
  });

  it("a FAIL entry and a PASS entry for the same spec get different ids", async () => {
    const root = newProject();
    runHookWith({ projectRoot: root, overall: "PASS" });
    runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });

    const ids = await storedIds(root);
    assert.equal(ids.length, 2, "a spec that fails then passes accumulates two entries");
    assert.equal(new Set(ids).size, 2, "different patterns must digest to different ids");
  });

  it("the same failure twice on one spec updates one entry rather than creating two", async () => {
    const root = newProject();
    runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });
    const r = runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });
    assert.equal(r.exitCode, 0, r.stderr);

    const ids = await storedIds(root);
    assert.equal(ids.length, 1, "recurrence updates the existing entry");

    const evidence = await storedEvidence(root);
    assert.equal(evidence[0].length, 1, "(path, date) dedup — not two identical refs");
  });

  it("a matching signature under a different id creates a separate entry", async () => {
    // signature is NOT a dedup key — writeHeuristic reconciles on id alone.
    // Two DIFFERENT specs, the SAME failing checks.
    const root = newProject();
    const otherSpec = addSpec(
      root,
      ".context-index/specs/features/validation/validate-scope-expansion.spec.md",
      "Validate scope expansion",
    );

    runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });
    const r = runHookWith({
      projectRoot: root,
      overall: "FAIL",
      checks: FAILING,
      specPath: otherSpec,
      specTitle: "Validate scope expansion",
      reportPath: otherSpec.replace(/\.spec\.md$/, ".validate.md"),
    });
    assert.equal(r.exitCode, 0, r.stderr);

    const ids = await storedIds(root);
    assert.equal(ids.length, 2, "two specs, two entries");
    assert.equal(new Set(ids).size, 2);

    const signatures = await storedSignatures(root);
    assert.equal(signatures.length, 2);
    assert.equal(new Set(signatures).size, 1, "the same failing checks share one signature");
  });
});

// ── The security boundary: identifiers only ──────────────────────────────

describe("validate Stop hook — FAIL capture reads identifiers only", () => {
  it("only checks[].id and checks[].outcome are read — no prose, no subprocess channel", () => {
    const root = newProject();
    const SECRET = "NOT-A-REAL-CREDENTIAL-canary-0001"; // synthetic canary, never a real token
    const r = runHookWith({
      projectRoot: root,
      overall: "FAIL",
      checks: [
        {
          id: "validate.check-3-spec-compliance",
          outcome: "FAIL",
          detail: `leaked ${SECRET}`,
          message: SECRET,
          evidence: SECRET,
        },
      ],
      // A prose sibling on verdict_metadata itself.
      metadataExtra: { summary: `summary ${SECRET}`, notes: SECRET },
      // Subprocess-style channels alongside verdict_metadata.
      toolResultExtra: { stdout: SECRET, stderr: SECRET, output: SECRET },
    });
    assert.equal(r.exitCode, 0, r.stderr);

    const raw = rawStore(root);
    assert.ok(raw.length > 0, "the FAIL entry must actually be written");
    assert.ok(!raw.includes(SECRET), "no field outside id/outcome may reach the store");
    assert.match(raw, /validate\.check-3-spec-compliance/);
  });

  it("the pattern and anti-pattern name the failing check ids and no other check field", async () => {
    const root = newProject();
    const r = runHookWith({
      projectRoot: root,
      overall: "FAIL",
      checks: [
        {
          id: "validate.check-1-quality-gates",
          outcome: "FAIL",
          detail: "DETAIL-SENTINEL-alpha",
          message: "MESSAGE-SENTINEL-beta",
          remediation: "REMEDIATION-SENTINEL-gamma",
        },
        {
          id: "validate.check-3-spec-compliance",
          outcome: "FAIL",
          detail: "DETAIL-SENTINEL-delta",
        },
      ],
    });
    assert.equal(r.exitCode, 0, r.stderr);

    const [entry] = await parseStore(root);
    for (const field of [entry.pattern, entry.antiPattern]) {
      assert.ok(field.includes("validate.check-1-quality-gates"), field);
      assert.ok(field.includes("validate.check-3-spec-compliance"), field);
      for (const sentinel of ["DETAIL-SENTINEL", "MESSAGE-SENTINEL", "REMEDIATION-SENTINEL"]) {
        assert.ok(!field.includes(sentinel), `${sentinel} must not reach '${field}'`);
      }
    }
  });

  it("check ids are deduped, sorted, and capped at five", async () => {
    const root = newProject();
    const shuffled = [
      "validate.check-6-governance",
      "validate.check-2-source-manifest",
      "validate.check-7-transition-gates",
      "validate.check-4-constitution",
      "validate.check-1-quality-gates",
      "validate.check-3-spec-compliance",
      "validate.check-5-code-drift",
      "validate.check-3-spec-compliance", // duplicate
    ].map((id) => ({ id, outcome: "FAIL" }));

    const r = runHookWith({ projectRoot: root, overall: "FAIL", checks: shuffled });
    assert.equal(r.exitCode, 0, r.stderr);

    const [entry] = await parseStore(root);
    const expected =
      "validate.check-1-quality-gates, validate.check-2-source-manifest, " +
      "validate.check-3-spec-compliance, validate.check-4-constitution, " +
      "validate.check-5-code-drift";
    assert.ok(entry.pattern.includes(expected), `pattern was: ${entry.pattern}`);
    assert.ok(!entry.pattern.includes("check-6-governance"), "the cap drops the 6th id");
    assert.ok(!entry.pattern.includes("check-7-transition-gates"), "the cap drops the 7th id");
    assert.ok(
      !/validate\.check-3-spec-compliance.*validate\.check-3-spec-compliance/s.test(entry.pattern),
      "duplicate ids are collapsed",
    );
  });

  it("a check id with characters outside [A-Za-z0-9._-] is sanitized before it is stored", async () => {
    const root = newProject();
    const r = runHookWith({
      projectRoot: root,
      overall: "FAIL",
      checks: [{ id: "validate.check-9 spec/compliance!<script>", outcome: "FAIL" }],
    });
    assert.equal(r.exitCode, 0, r.stderr);

    const raw = rawStore(root);
    assert.ok(raw.length > 0, "the entry must still be written");
    assert.ok(!raw.includes("validate.check-9 spec/compliance!<script>"), "raw id must not survive");
    assert.ok(!raw.includes("<script>"), "markup must not survive");
    assert.ok(!raw.includes("spec/compliance"), "the slash must not survive");

    const [entry] = await parseStore(root);
    assert.ok(
      entry.pattern.includes("validate.check-9speccompliancescript"),
      `pattern was: ${entry.pattern}`,
    );
  });

  it("with no non-PASS checks[] entry the hook writes nothing and exits 0", () => {
    const root = newProject();
    const r = runHookWith({
      projectRoot: root,
      overall: "FAIL",
      checks: [{ id: "validate.check-1-quality-gates", outcome: "PASS" }],
    });

    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, "");
    assert.equal(existsSync(storePath(root)), false, "never widen the read set to find something to say");
  });

  it("an outcome that is neither PASS nor FAIL writes nothing even with failing checks", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, overall: "BLOCK", checks: FAILING });

    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, "");
    assert.equal(existsSync(storePath(root)), false);
  });
});

// ── FAIL-path error rows: never block, never print to stdout ─────────────

describe("validate Stop hook — FAIL capture error paths", () => {
  it("a throwing signature derivation still writes the entry, without a signature", async () => {
    const root = newProject();
    const shimRoot = makeSignatureShimRoot();

    const r = runHookWith({
      projectRoot: root,
      overall: "FAIL",
      checks: FAILING,
      env: { CLAUDE_PLUGIN_ROOT: shimRoot },
    });

    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "");

    const entries = await parseStore(root);
    assert.equal(entries.length, 1, `the entry is still written — ${r.stderr}`);
    const [entry] = entries;
    assert.equal(entry.signature, undefined, "the field is omitted, not faked");
    assert.ok(entry.id, "the entry is still keyed and still written");
    assert.match(r.stderr, /signature/i, "the omission is audited on stderr");
  });

  it("an unwritable store file logs a warning, exits 0, and prints nothing on stdout", () => {
    const root = newProject();
    const dir = join(root, ".context-index", "memory", "heuristics");
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o500);
    try {
      const r = runHookWith({ projectRoot: root, overall: "FAIL", checks: FAILING });

      assert.equal(r.exitCode, 0, "capture is non-blocking");
      assert.equal(r.stdout, "");
      assert.match(r.stderr, /non-blocking/);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});
