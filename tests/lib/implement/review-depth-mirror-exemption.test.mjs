// tests/lib/implement/review-depth-mirror-exemption.test.mjs
//
// The lite tripwire's provider-mirror exemption. A touch to
// `providers/<p>/skills/<rest>` is left out of scope-mismatch only when it is
// exactly what scripts/sync-provider-skills.mjs produces from `skills/<rest>`
// and the task declared or touched that canonical file. The sensitive-path and
// boundary legs still see the mirror path.
//
// The mirror bodies here are written out by hand rather than computed with the
// generator, so a defect in the generator cannot make these cases agree with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  computeTouchedFiles,
  isRegeneratedProviderMirror,
  resolveImplementReviewDepth,
  snapshotWorkingTree,
} from "../../../lib/implement/review-depth.mjs";
import { canonicalForMirror, generateMirrorFile } from "../../../lib/sync/provider-skills.mjs";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../../helpers.mjs";

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

const SPEC_PATH = ".context-index/specs/features/m/own.spec.md";
const SKILL = "skills/foo/SKILL.md";
const REF = "skills/foo/references/notes.md";
const REF_MIRROR = "providers/codex/skills/foo/references/notes.md";

const skillBody = (desc, body) => `---\nname: adev:foo\ndescription: "${desc}"\n---\n\n${body}\n`;
const CODEX_SUFFIX = " In Codex, invoke with $adev:foo";
const OPENCODE_SUFFIX = " In OpenCode, invoke with skill({ name: 'adev:foo' })";

function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

// A repo whose canonical skill and both mirrors are in sync at the base.
function repo() {
  const dir = createTempDir();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, SKILL, skillBody("Do foo.", "old body"));
  write(dir, REF, "old notes\n");
  write(dir, "providers/codex/skills/foo/SKILL.md", skillBody(`Do foo.${CODEX_SUFFIX}`, "old body"));
  write(dir, "providers/opencode/skills/foo/SKILL.md", skillBody(`Do foo.${OPENCODE_SUFFIX}`, "old body"));
  write(dir, "providers/codex/skills/foo/references/notes.md", "old notes\n");
  write(dir, "providers/opencode/skills/foo/references/notes.md", "old notes\n");
  write(dir, "providers/codex/skills/foo/agents/openai.yaml", "interface: {}\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

function withRepo(fn) {
  const dir = repo();
  try {
    return fn(dir);
  } finally {
    cleanupTempDir(dir);
  }
}

// Writes the new canonical SKILL.md and reference, and their exact mirrors.
function regenerate(dir, { skill = true, ref = true } = {}) {
  if (skill) {
    write(dir, SKILL, skillBody("Do foo.", "new body"));
    write(dir, "providers/codex/skills/foo/SKILL.md", skillBody(`Do foo.${CODEX_SUFFIX}`, "new body"));
    write(dir, "providers/opencode/skills/foo/SKILL.md", skillBody(`Do foo.${OPENCODE_SUFFIX}`, "new body"));
  }
  if (ref) {
    write(dir, REF, "new notes\n");
    write(dir, "providers/codex/skills/foo/references/notes.md", "new notes\n");
    write(dir, "providers/opencode/skills/foo/references/notes.md", "new notes\n");
  }
}

function finalPass(dir, baseSha, { declared = [SKILL, REF], ...overrides } = {}) {
  return resolveImplementReviewDepth({
    spec: { risk_level: "medium", specPath: SPEC_PATH },
    task: { id: "7", declared_files: declared },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.8, pattern_coverage: 0.8, blast_radius: 0.8, novelty: 0.8 } },
    tierFlag: null,
    liteFlag: true,
    policies: {},
    targetPaths: declared,
    pass: "final",
    provisionalDepth: "lite",
    inProgressAt: null,
    baseSha,
    projectRoot: dir,
    ...overrides,
  });
}

const pick = (r) => ({ depth: r.depth, floor_legs: r.floor_legs, escalated_from: r.escalated_from, floor_cap: r.floor_cap });
const LITE = { depth: "lite", floor_legs: [], escalated_from: null, floor_cap: null };
const QUICK = { depth: "quick", floor_legs: ["scope-mismatch"], escalated_from: "lite", floor_cap: null };
// A sensitive-path or boundary leg in the tripwire, which always runs under the lite cap.
const capped = (legs) => ({ depth: "quick", floor_legs: legs, escalated_from: "lite", floor_cap: "quick" });

// ── stays lite ──────────────────────────────────────────────────────────────

test("a declared canonical SKILL.md and companion with their exact regenerated mirrors stay lite", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir);
    assert.deepEqual(pick(finalPass(dir, base)), LITE);
  });
});

test("a mirror refreshed for a declared but unchanged canonical file stays lite", () => {
  withRepo((dir) => {
    write(dir, "providers/codex/skills/foo/references/notes.md", "stale\n");
    git(dir, "commit", "-qam", "stale mirror");
    const base = snapshotWorkingTree(dir);
    write(dir, "providers/codex/skills/foo/references/notes.md", "old notes\n");
    assert.deepEqual(pick(finalPass(dir, base, { declared: [REF] })), LITE);
  });
});

test("a deleted canonical file together with its deleted mirrors stays lite", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    rmSync(join(dir, REF));
    rmSync(join(dir, "providers/codex/skills/foo/references/notes.md"));
    rmSync(join(dir, "providers/opencode/skills/foo/references/notes.md"));
    assert.deepEqual(pick(finalPass(dir, base, { declared: [REF] })), LITE);
  });
});

test("a new executable canonical script with a new executable exact mirror stays lite", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "skills/foo/scripts/run.sh", "#!/bin/sh\n");
    write(dir, "providers/codex/skills/foo/scripts/run.sh", "#!/bin/sh\n");
    chmodSync(join(dir, "skills/foo/scripts/run.sh"), 0o755);
    chmodSync(join(dir, "providers/codex/skills/foo/scripts/run.sh"), 0o755);
    assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/scripts/run.sh"] })), LITE);
  });
});

// ── the sync's real output ──────────────────────────────────────────────────

const SYNC_SCRIPT = join(PLUGIN_ROOT, "scripts", "sync-provider-skills.mjs");
const runSync = (dir) => execFileSync(process.execPath, [SYNC_SCRIPT, "--root", dir], { encoding: "utf8" });

test("a new executable script plus the sync's real output stays lite", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "skills/foo/scripts/run.sh", "#!/bin/sh\necho hi\n");
    chmodSync(join(dir, "skills/foo/scripts/run.sh"), 0o755);
    runSync(dir);
    const touched = computeTouchedFiles(dir, base).map((r) => `${r.status} ${r.mode} ${r.path}`).sort();
    assert.deepEqual(touched, [
      "A 100755 providers/codex/skills/foo/scripts/run.sh",
      "A 100755 providers/opencode/skills/foo/scripts/run.sh",
      "A 100755 skills/foo/scripts/run.sh",
    ]);
    assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/scripts/run.sh"] })), LITE);
  });
});

test("a chmod on a declared canonical file plus the sync's real output stays lite", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    chmodSync(join(dir, REF), 0o755);
    runSync(dir);
    const touched = computeTouchedFiles(dir, base).map((r) => `${r.status} ${r.src_mode}->${r.mode} ${r.path}`).sort();
    assert.deepEqual(touched, [
      `M 100644->100755 ${REF_MIRROR}`,
      "M 100644->100755 providers/opencode/skills/foo/references/notes.md",
      `M 100644->100755 ${REF}`,
    ]);
    assert.deepEqual(pick(finalPass(dir, base, { declared: [REF] })), LITE);
  });
});

test("an edited declared SKILL.md plus the sync's real output stays lite", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, SKILL, skillBody("Do foo.", "new body"));
    runSync(dir);
    assert.equal(computeTouchedFiles(dir, base).length, 3);
    assert.deepEqual(pick(finalPass(dir, base, { declared: [SKILL] })), LITE);
  });
});

// ── mode: a mirror has its canonical file's executable bit ──────────────────

test("a mirror chmod'd away from its canonical file's mode escalates to quick", () => {
  for (const [label, canonicalMode, mirrorMode] of [["mirror +x, canonical -x", 0o644, 0o755], ["mirror -x, canonical +x", 0o755, 0o644]]) {
    withRepo((dir) => {
      chmodSync(join(dir, REF), canonicalMode);
      chmodSync(join(dir, REF_MIRROR), canonicalMode);
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "--allow-empty", "-m", "mode");
      const base = snapshotWorkingTree(dir);
      chmodSync(join(dir, REF_MIRROR), mirrorMode);
      assert.deepEqual(pick(finalPass(dir, base, { declared: [REF] })), QUICK, label);
    });
  }
});

test("a mirror chmod'd back to its declared canonical file's mode stays lite", () => {
  withRepo((dir) => {
    chmodSync(join(dir, REF_MIRROR), 0o755);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "drifted mode");
    const base = snapshotWorkingTree(dir);
    chmodSync(join(dir, REF_MIRROR), 0o644);
    assert.deepEqual(pick(finalPass(dir, base, { declared: [REF] })), LITE);
  });
});

test("a regenerated mirror whose mode also changed escalates to quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir);
    chmodSync(join(dir, "providers/opencode/skills/foo/references/notes.md"), 0o755);
    assert.deepEqual(pick(finalPass(dir, base)), QUICK);
  });
});

test("a new mirror whose executable bit differs from its canonical file escalates to quick", () => {
  for (const [label, canonicalMode, mirrorMode] of [["canonical +x, mirror -x", 0o755, 0o644], ["canonical -x, mirror +x", 0o644, 0o755]]) {
    withRepo((dir) => {
      const base = snapshotWorkingTree(dir);
      write(dir, "skills/foo/scripts/run.sh", "#!/bin/sh\n");
      write(dir, "providers/codex/skills/foo/scripts/run.sh", "#!/bin/sh\n");
      chmodSync(join(dir, "skills/foo/scripts/run.sh"), canonicalMode);
      chmodSync(join(dir, "providers/codex/skills/foo/scripts/run.sh"), mirrorMode);
      assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/scripts/run.sh"] })), QUICK, label);
    });
  }
});

test("a new mirror of a declared, untouched executable canonical file needs the base mode", () => {
  for (const [label, mirrorMode, expected] of [["mirror +x", 0o755, LITE], ["mirror -x", 0o644, QUICK]]) {
    withRepo((dir) => {
      write(dir, "skills/foo/scripts/run.sh", "#!/bin/sh\n");
      chmodSync(join(dir, "skills/foo/scripts/run.sh"), 0o755);
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "script");
      const base = snapshotWorkingTree(dir);
      write(dir, "providers/codex/skills/foo/scripts/run.sh", "#!/bin/sh\n");
      chmodSync(join(dir, "providers/codex/skills/foo/scripts/run.sh"), mirrorMode);
      assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/scripts/run.sh"] })), expected, label);
    });
  }
});

// ── scope-mismatch → quick ──────────────────────────────────────────────────

test("a modified mirror whose canonical file was deleted escalates to quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    rmSync(join(dir, REF));
    write(dir, "providers/codex/skills/foo/references/notes.md", "new notes\n");
    rmSync(join(dir, "providers/opencode/skills/foo/references/notes.md"));
    assert.deepEqual(pick(finalPass(dir, base, { declared: [REF] })), QUICK);
  });
});

// The mirror is an exact regeneration here, so only the scope condition can
// reject it.
test("an exact mirror whose canonical counterpart is neither declared nor touched escalates to quick", () => {
  withRepo((dir) => {
    write(dir, "providers/codex/skills/foo/references/notes.md", "stale\n");
    git(dir, "commit", "-qam", "stale mirror");
    const base = snapshotWorkingTree(dir);
    write(dir, "providers/codex/skills/foo/references/notes.md", "old notes\n");
    assert.deepEqual(pick(finalPass(dir, base, { declared: [SKILL] })), QUICK);
  });
});

test("a mirror hand-edited away from the generator output escalates to quick", () => {
  const edits = [
    ["SKILL.md body", (dir) => write(dir, "providers/codex/skills/foo/SKILL.md", skillBody(`Do foo.${CODEX_SUFFIX}`, "new body, edited"))],
    ["SKILL.md without the provider suffix", (dir) => write(dir, "providers/opencode/skills/foo/SKILL.md", skillBody("Do foo.", "new body"))],
    ["SKILL.md with the other provider's suffix", (dir) => write(dir, "providers/codex/skills/foo/SKILL.md", skillBody(`Do foo.${OPENCODE_SUFFIX}`, "new body"))],
    ["companion with a trailing newline added", (dir) => write(dir, "providers/codex/skills/foo/references/notes.md", "new notes\n\n")],
  ];
  for (const [label, edit] of edits) {
    withRepo((dir) => {
      const base = snapshotWorkingTree(dir);
      regenerate(dir);
      edit(dir);
      assert.deepEqual(pick(finalPass(dir, base)), QUICK, label);
    });
  }
});

test("a mirror that is a symlink escalates to quick, even when its target has the generator's bytes", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir);
    const link = join(dir, "providers/codex/skills/foo/references/notes.md");
    rmSync(link);
    symlinkSync("../../../../../skills/foo/references/notes.md", link);
    assert.deepEqual(pick(finalPass(dir, base)), QUICK);
  });
});

test("a deleted mirror whose canonical counterpart still exists escalates to quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir, { skill: false, ref: true });
    rmSync(join(dir, "providers/codex/skills/foo/references/notes.md"));
    assert.deepEqual(pick(finalPass(dir, base)), QUICK);
  });
});

test("an unknown provider directory escalates to quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir, { skill: false, ref: true });
    write(dir, "providers/cursor/skills/foo/references/notes.md", "new notes\n");
    assert.deepEqual(pick(finalPass(dir, base)), QUICK);
  });
});

test("a path the generator never writes escalates to quick, matching canonical bytes or not", () => {
  const cases = [
    ["codex agents/ (provider-owned)", "skills/foo/agents/openai.yaml", "providers/codex/skills/foo/agents/openai.yaml"],
    ["opencode agents/ (never mirrored)", "skills/foo/agents/x.md", "providers/opencode/skills/foo/agents/x.md"],
    ["nested SKILL.md (never mirrored)", "skills/foo/references/SKILL.md", "providers/codex/skills/foo/references/SKILL.md"],
    ["adev-* skill (never synced)", "skills/adev-bar/SKILL.md", "providers/codex/skills/adev-bar/SKILL.md"],
  ];
  for (const [label, canonical, mirror] of cases) {
    withRepo((dir) => {
      const base = snapshotWorkingTree(dir);
      write(dir, canonical, "same\n");
      write(dir, mirror, "same\n");
      assert.deepEqual(pick(finalPass(dir, base, { declared: [canonical] })), QUICK, label);
    });
  }
});

test("a skill directory without a SKILL.md is not synced: its mirror escalates to quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "skills/bare/references/x.md", "x\n");
    write(dir, "providers/codex/skills/bare/references/x.md", "x\n");
    assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/bare/references/x.md"] })), QUICK);
  });
});

// ── fail closed ─────────────────────────────────────────────────────────────

test("the generator throwing fails closed: quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir);
    const mirrorGenerator = () => {
      throw new Error("boom");
    };
    assert.deepEqual(pick(finalPass(dir, base, { mirrorGenerator })), QUICK);
  });
});

test("a declared canonical file that is missing from the working tree fails closed: quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "providers/codex/skills/foo/references/gone.md", "x\n");
    assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/references/gone.md"] })), QUICK);
  });
});

test("a canonical file that is a symlink fails closed: quick", () => {
  withRepo((dir) => {
    write(dir, "outside.md", "x\n");
    const base = snapshotWorkingTree(dir);
    symlinkSync("../../../outside.md", join(dir, "skills/foo/references/linked.md"));
    write(dir, "providers/codex/skills/foo/references/linked.md", "x\n");
    assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/references/linked.md"] })), QUICK);
  });
});

test("never-exempt shapes stay never exempt under a mirror: a *.spec.md mirror escalates to quick", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "skills/foo/references/x.spec.md", "x\n");
    write(dir, "providers/codex/skills/foo/references/x.spec.md", "x\n");
    assert.deepEqual(pick(finalPass(dir, base, { declared: ["skills/foo/references/x.spec.md"] })), QUICK);
  });
});

// ── the floor legs still see mirror paths ───────────────────────────────────

test("an exact mirror on a sensitive path still escalates, to quick under the lite cap", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir);
    const r = finalPass(dir, base, { sensitivePaths: ["providers/codex/**"] });
    assert.deepEqual(pick(r), capped(["sensitive-path"]));
  });
});

test("an exact mirror crossing a boundary still escalates, to quick under the lite cap", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir);
    const boundaryCheck = (paths) => paths.some((p) => p.startsWith("providers/opencode/"));
    assert.deepEqual(pick(finalPass(dir, base, { boundaryCheck })), capped(["boundary"]));
  });
});

// ── the generator agrees with the mirrors the sync script wrote ─────────────

test("generateMirrorFile reproduces every committed provider mirror byte for byte, and each mirror keeps its canonical mode", () => {
  const modes = new Map();
  for (const entry of git(PLUGIN_ROOT, "ls-files", "-s", "-z").split("\0")) {
    if (entry === "") continue;
    const tab = entry.indexOf("\t");
    modes.set(entry.slice(tab + 1), entry.slice(0, 6));
  }
  const listed = [...modes.keys()].filter((p) => p.startsWith("providers/") && canonicalForMirror(p) !== null);
  assert.ok(listed.length > 100, `expected the repo's mirrors, saw ${listed.length}`);
  const mismatched = listed.filter((p) => !readFileSync(join(PLUGIN_ROOT, p)).equals(generateMirrorFile(PLUGIN_ROOT, p)));
  assert.deepEqual(mismatched, []);
  const modeMismatched = listed.filter((p) => modes.get(p) !== modes.get(canonicalForMirror(p).canonicalPath));
  assert.deepEqual(modeMismatched, []);
  assert.ok(listed.some((p) => modes.get(p) === "100755"), "the repo's executable mirrors are covered");
});

// ── isRegeneratedProviderMirror: the snapshot's blobs decide ────────────────

function mirrorContext(dir, base, overrides = {}) {
  const records = computeTouchedFiles(dir, base);
  return {
    record: records.find((r) => r.path === REF_MIRROR),
    ctx: { declared: new Set([REF]), touched: new Map(records.map((r) => [r.path, r])), projectRoot: dir, baseSha: base, ...overrides },
  };
}

test("the mirror's verdict uses its snapshot blob, never its bytes on disk", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir, { skill: false, ref: true });
    const { record, ctx } = mirrorContext(dir, base);
    assert.equal(isRegeneratedProviderMirror(record, ctx), true, "exact regeneration");
    write(dir, REF_MIRROR, "edited after the snapshot\n");
    assert.equal(isRegeneratedProviderMirror(record, ctx), true, "disk edit after the snapshot is not what the diff compares");
    assert.equal(isRegeneratedProviderMirror({ ...record, dst_sha: "0".repeat(39) + "1" }, ctx), false, "a different blob");
  });
});

test("a sha256 object id fails closed", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir, { skill: false, ref: true });
    const { record, ctx } = mirrorContext(dir, base);
    assert.equal(isRegeneratedProviderMirror({ ...record, dst_sha: "a".repeat(64) }, ctx), false);
  });
});

test("a touched canonical file whose disk bytes no longer match its snapshot blob fails closed", () => {
  withRepo((dir) => {
    const base = snapshotWorkingTree(dir);
    regenerate(dir, { skill: false, ref: true });
    const generate = () => Buffer.from("new notes\n");
    const { record, ctx } = mirrorContext(dir, base, { generate });
    assert.equal(isRegeneratedProviderMirror(record, ctx), true, "canonical as snapshotted");
    write(dir, REF, "changed after the snapshot\n");
    assert.equal(isRegeneratedProviderMirror(record, ctx), false, "canonical changed after the snapshot");
  });
});

test("an untouched canonical file whose disk bytes no longer match its base blob fails closed", () => {
  withRepo((dir) => {
    write(dir, REF_MIRROR, "stale\n");
    git(dir, "commit", "-qam", "stale mirror");
    const base = snapshotWorkingTree(dir);
    write(dir, REF_MIRROR, "old notes\n");
    const generate = () => Buffer.from("old notes\n");
    const { record, ctx } = mirrorContext(dir, base, { generate });
    assert.equal(isRegeneratedProviderMirror(record, ctx), true, "canonical as at base");
    write(dir, REF, "changed after the snapshot\n");
    assert.equal(isRegeneratedProviderMirror(record, ctx), false, "canonical changed after the snapshot");
  });
});
