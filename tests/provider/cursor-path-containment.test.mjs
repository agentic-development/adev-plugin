// tests/provider/cursor-path-containment.test.mjs
//
// A skill's frontmatter `name:` becomes a DIRECTORY NAME under ~/.cursor/skills/.
// It must not be able to escape that root.
//
// WHY THIS EXISTS. providers/cursor/adapter.mjs parses the name with
// `/^name:\s*(\S+)\s*$/`. `\S+` is a reasonable YAML scalar grammar and a wrong
// filesystem-path grammar: it admits `/` and `..`, so `name: adev:../../x`
// produced a sanitizedName that flowed unchecked into join(targetSkillsDir, ...)
// and then cpSync + writeFileSync. Found by the boundary reviewer (BND-4).
//
// WHY IT LOOKS LIKE THIS. The first version of this file tried to drive
// publishSkillsFromCache directly. That function is module-private, is async,
// and derives its own target from getCursorHome() — and install() returns early
// when the cache exists, so publish only runs against a cache populated from the
// real plugin root, which a test cannot poison. The test therefore always fell
// into a fallback branch that grepped this adapter's SOURCE for the identifiers
// `SAFE_SKILL_DIRNAME` / `assertWithinSkillsRoot` / `SKILL_PATH_ESCAPE`. Those
// match anywhere in the file, including a comment, so it passed against a guard
// that was declared but never invoked, invoked after the write, or inverted.
// Two reviewers caught it independently (WIR-9, BND-1) and both were right: it
// asserted on source text, not behaviour.
//
// The guard decision now lives in the exported pure function
// `resolvePublishTarget`, so the real logic is reachable. What remains
// source-scoped is only the ORDERING question — that the call precedes the
// writes — which is genuinely a property of the call site, not of a function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { PLUGIN_ROOT } from "../helpers.mjs";
import { resolvePublishTarget } from "../../providers/cursor/adapter.mjs";

test("a traversing or multi-segment skill name is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-contain-"));
  const skills = join(root, "skills");
  // The root MUST exist. An earlier version of this test omitted this, so
  // realpathSync failed and EVERY input threw SKILL_PATH_ESCAPE regardless of
  // its name — the assertions passed for a reason unrelated to what they claim
  // to test, and a disabled allowlist still passed the whole file.
  mkdirSync(skills, { recursive: true });
  try {
    for (const bad of ["adev-../../escaped", "adev-a/b", "../x", "/abs", "..", ".", ".hidden"]) {
      assert.throws(
        () => resolvePublishTarget(skills, bad),
        /SKILL_NAME_UNSAFE|SKILL_PATH_ESCAPE/,
        `must refuse ${JSON.stringify(bad)}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a nested name is refused by the allowlist, not just by containment", () => {
  // `adev-a/b` resolves INSIDE the root, so the containment layer allows it —
  // only the single-path-segment allowlist rejects it. Without this case the
  // suite cannot tell whether the allowlist is present at all: every other bad
  // input escapes the root and is caught by layer 2 regardless.
  const root = mkdtempSync(join(tmpdir(), "cursor-contain-nested-"));
  const skills = join(root, "skills");
  mkdirSync(skills, { recursive: true });
  try {
    assert.throws(
      () => resolvePublishTarget(skills, "adev-a/b"),
      /SKILL_NAME_UNSAFE/,
      "a separator inside the name must be refused by the allowlist specifically",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a legitimate skill name resolves inside the root", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-contain-ok-"));
  const skills = join(root, "skills");
  mkdirSync(skills, { recursive: true });
  try {
    for (const good of ["adev-build", "adev-review-specs", "adev-write-test"]) {
      const dest = resolvePublishTarget(skills, good);
      assert.ok(
        dest.startsWith(realpathSync(skills) + sep),
        `${good} must resolve inside the root, got ${dest}`,
      );
      assert.ok(dest.endsWith(sep + good), `${good} must keep its declared name`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("containment is computed through realpath, not lexically", () => {
  // BND-2: a lexical resolve()+startsWith check reports containment when the ROOT
  // is itself a symlink, while ensureDir/cpSync/writeFileSync all follow it and
  // land at the link's real target. Same class as macOS /var -> /private/var,
  // which lib/extensions/exec-payload.mjs documents as the reason its own
  // containment primitive realpaths both sides.
  const base = mkdtempSync(join(tmpdir(), "cursor-contain-sym-"));
  const real = join(base, "real-skills");
  const link = join(base, "skills");
  mkdirSync(real, { recursive: true });
  symlinkSync(real, link, "dir");
  try {
    const dest = resolvePublishTarget(link, "adev-build");
    // The destination must be expressed against the DEREFERENCED root, so a
    // caller comparing it to the real location sees the truth.
    assert.ok(
      dest.startsWith(realpathSync(real) + sep),
      `destination ${dest} must resolve under the symlink's real target ${realpathSync(real)}`,
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("an unresolvable skills root is refused rather than assumed safe", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-contain-missing-"));
  try {
    assert.throws(
      () => resolvePublishTarget(join(root, "does-not-exist"), "adev-build"),
      /SKILL_PATH_ESCAPE/,
      "a root that cannot be realpath'd must fail closed",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publishSkillsFromCache calls the guard before any write", () => {
  // The one genuinely source-scoped assertion in this file, and deliberately so:
  // ordering is a property of the CALL SITE, which no unit test of a pure
  // function can observe. Kept narrow — it locates the function body and checks
  // the guard call precedes every write primitive within it, rather than
  // grepping the whole file for an identifier.
  const src = readFileSync(join(PLUGIN_ROOT, "providers", "cursor", "adapter.mjs"), "utf8");
  const start = src.indexOf("async function publishSkillsFromCache(");
  assert.ok(start !== -1, "publishSkillsFromCache must exist");
  const end = src.indexOf("\nexport const CursorAdapter", start);
  const body = src.slice(start, end === -1 ? undefined : end);

  const guardAt = body.indexOf("resolvePublishTarget(");
  assert.ok(guardAt !== -1, "publishSkillsFromCache must call resolvePublishTarget");

  for (const write of ["ensureDir(targetDir)", "cpSync(", "writeFileSync("]) {
    const at = body.indexOf(write);
    assert.ok(at !== -1, `expected ${write} in publishSkillsFromCache`);
    assert.ok(
      guardAt < at,
      `resolvePublishTarget must be called BEFORE ${write} — a containment check ` +
        `that runs after the write does not contain anything`,
    );
  }
});

test("a pre-existing symlinked destination is refused", () => {
  // BND-2 (round 5): realpathing only the BASE leaves this open. A symlink already
  // sitting at <root>/<name> and pointing outside passes the lexical prefix check,
  // and ensureDir/cpSync/writeFileSync all follow symlinks — so the write lands at
  // the link's target. Narrow (needs prior write access to the user's own skills
  // dir) but it is the one case the base-only check misses.
  const base = mkdtempSync(join(tmpdir(), "cursor-contain-destsym-"));
  const skills = join(base, "skills");
  const outside = join(base, "outside");
  mkdirSync(skills, { recursive: true });
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, join(skills, "adev-evil"), "dir");
  try {
    assert.throws(
      () => resolvePublishTarget(skills, "adev-evil"),
      /SKILL_PATH_ESCAPE/,
      "a destination that already exists as a symlink out of the root must be refused",
    );
    // and a normal pre-existing directory is still fine
    mkdirSync(join(skills, "adev-build"), { recursive: true });
    assert.ok(resolvePublishTarget(skills, "adev-build").endsWith("adev-build"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
