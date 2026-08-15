/**
 * Task 5 — location-independent `id` in the validate Stop hook.
 *
 * Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
 * Covers Behaviors 7, 7a and the "project root unresolvable" error row.
 *
 * The regression this whole spec exists for: the hook used to hash the
 * **absolute** spec path, so the same spec and pattern extracted from two
 * worktrees of one repository produced two different ids. `writeHeuristic`
 * appends-or-updates by id, so the divergence wrote a duplicate entry instead
 * of appending a second evidence reference — which in turn left `autoPromote`
 * unable to see the two distinct evidence paths it needs to promote.
 *
 * Hook protocol (constitution principle 4): stdout is the protocol channel,
 * warnings go to stderr, and the process always exits 0.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { deriveHeuristicId } from "../../lib/heuristics.mjs";

const HOOK = join(PLUGIN_ROOT, "hooks", "post-validate-extract-heuristics.mjs");

const SPEC_REL = ".context-index/specs/features/validation/validate-config-single-source.spec.md";
const REPORT_REL = ".context-index/specs/features/validation/validate-config-single-source.validate.md";
const SPEC_TITLE = "Validate config single source";
const EXPECTED_PATTERN =
  `First-run PASS for ${SPEC_TITLE}: implementation matched all acceptance criteria without revision.`;

/**
 * Build a temp project root containing the spec fixture. The root is
 * registered for cleanup immediately, so a throw inside `writeFixture` cannot
 * leak the directory.
 */
function makeProject() {
  const root = createTempDir();
  roots.push(root);
  writeFixture(root, SPEC_REL, `---\ncharter: validation\n---\n\n# Live Spec: ${SPEC_TITLE}\n`);
  return root;
}

/** Drive the Stop hook with verdict metadata on stdin. */
function runHookWith({ projectRoot, specPath = SPEC_REL, env = {} } = {}) {
  const payload = {
    tool_name: "adev:validate",
    tool_result: {
      verdict_metadata: {
        overall: "PASS",
        spec_path: specPath,
        charter: "validation",
        spec_title: SPEC_TITLE,
        report_path: REPORT_REL,
      },
    },
  };

  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify(payload),
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

/** Read the single stored id out of a scope file. */
function storedIds(projectRoot, scope = "validation") {
  const file = storePath(projectRoot, scope);
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
  return [...raw.matchAll(/^id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
}

let roots = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const r of roots) cleanupTempDir(r);
});

function newProject() {
  return makeProject();
}

// ── Behavior 7: location independence ────────────────────────────────────

describe("validate Stop hook — the derived id is location-independent", () => {
  it("the same spec and pattern in two temp roots with different absolute paths yields an identical id", () => {
    const one = newProject();
    const two = newProject();
    assert.notEqual(one, two, "the two temp roots must have different absolute paths");

    const a = runHookWith({ projectRoot: one });
    const b = runHookWith({ projectRoot: two });
    assert.equal(a.exitCode, 0, a.stderr);
    assert.equal(b.exitCode, 0, b.stderr);

    const idsA = storedIds(one);
    const idsB = storedIds(two);
    assert.equal(idsA.length, 1, `expected one entry, got ${JSON.stringify(idsA)} — ${a.stderr}`);
    assert.deepEqual(idsA, idsB, "the id must be byte-identical across worktrees");
  });

  it("the id is exactly deriveHeuristicId(<spec-slug>, <repo-relative path>, <pattern>)", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root });
    assert.equal(r.exitCode, 0, r.stderr);

    const expected = deriveHeuristicId(
      "validate-config-single-source",
      SPEC_REL,
      EXPECTED_PATTERN,
    );
    assert.deepEqual(storedIds(root), [expected]);
  });

  it("matches a hardcoded golden id — the derivation itself is pinned, not just the wiring", () => {
    // Computed once from the shipped rule. Deriving the expectation with the
    // same function under test would verify the wiring but let a change to
    // normalizeIdInput or the `|` separator slip through silently, and
    // cross-version id stability is the whole point of this spec.
    const root = newProject();
    const r = runHookWith({ projectRoot: root });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.deepEqual(storedIds(root), ["validate-config-single-source-6e68d657"]);
  });

  it("the derived id has no `.spec` stem in its slug", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root });
    assert.equal(r.exitCode, 0, r.stderr);

    const [id] = storedIds(root);
    assert.ok(id, "an entry must have been written");
    assert.ok(id.startsWith("validate-config-single-source-"), `unexpected slug in '${id}'`);
    assert.doesNotMatch(id, /-spec-/, "the canonical stripped form carries no `spec` segment");
  });

  it("an absolute spec_path pointing inside the project root yields the same id as the relative one", () => {
    const one = newProject();
    const two = newProject();
    const a = runHookWith({ projectRoot: one });
    const b = runHookWith({ projectRoot: two, specPath: join(two, SPEC_REL) });
    assert.equal(a.exitCode, 0, a.stderr);
    assert.equal(b.exitCode, 0, b.stderr);
    assert.deepEqual(storedIds(one), storedIds(two));
  });

  it("two different specs still produce different ids", () => {
    const root = newProject();
    const other = ".context-index/specs/features/validation/some-other.spec.md";
    writeFixture(root, other, `---\ncharter: validation\n---\n\n# Live Spec: ${SPEC_TITLE}\n`);

    const first = runHookWith({ projectRoot: root });
    const second = runHookWith({ projectRoot: root, specPath: other });
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(second.exitCode, 0, second.stderr);

    const ids = storedIds(root);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
  });
});

// ── Fail-closed on an unresolvable project root ──────────────────────────

describe("validate Stop hook — unresolvable project root fails closed", () => {
  it("a relative CLAUDE_PROJECT_ROOT skips extraction: no entry, warning on stderr, exit 0", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, env: { CLAUDE_PROJECT_ROOT: "relative/root" } });

    assert.equal(r.exitCode, 0, "capture is non-blocking — the hook still exits 0");
    assert.equal(existsSync(storePath(root)), false, "no entry may be written");
    assert.match(r.stderr, /project root/i);
  });

  it("a non-existent CLAUDE_PROJECT_ROOT skips extraction", () => {
    const root = newProject();
    const r = runHookWith({
      projectRoot: root,
      env: { CLAUDE_PROJECT_ROOT: join(root, "does", "not", "exist") },
    });

    assert.equal(r.exitCode, 0);
    assert.equal(existsSync(storePath(root)), false);
    assert.match(r.stderr, /project root/i);
  });

  it("a spec path that escapes the project root skips extraction", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, specPath: "../outside/foo.spec.md" });

    assert.equal(r.exitCode, 0);
    assert.equal(existsSync(storePath(root)), false);
    assert.match(r.stderr, /project root|contain|escape/i);
  });

  it("an absolute spec path outside the project root skips extraction", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, specPath: "/etc/foo.spec.md" });

    assert.equal(r.exitCode, 0);
    assert.equal(existsSync(storePath(root)), false);
    assert.match(r.stderr, /project root|contain|escape/i);
  });

  it("stdout stays empty on the skip path (the hook protocol channel is unpolluted)", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root, env: { CLAUDE_PROJECT_ROOT: "relative/root" } });
    assert.equal(r.stdout, "");
  });

  it("stdout stays empty on the success path too", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, "");
  });
});

// ── Behavior 7a: the prefix is caller-supplied ───────────────────────────

describe("validate Stop hook — the prefix comes from the caller, not the origin", () => {
  it("the id prefix is the spec slug, never the origin slug 'validate'", () => {
    const root = newProject();
    const r = runHookWith({ projectRoot: root });
    assert.equal(r.exitCode, 0, r.stderr);

    const [id] = storedIds(root);
    assert.ok(id, "an entry must have been written");
    assert.ok(id.startsWith("validate-config-single-source-"));
    assert.doesNotMatch(id, /^validate-[0-9a-f]{8}$/, "the origin must not become the prefix");
  });
});
