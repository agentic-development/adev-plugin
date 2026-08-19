// Direct unit tests for validateHooksPath (adev-plugin-hookspath-symlink-containment-tjth).
//
// validateHooksPath enforced repo containment with resolve()/relative() —
// pure string operations. A tracked in-repo SYMLINK passes that lexical
// check and the generated wrapper executes code outside the repository.
// CWE-22. Demonstrated during /adev:review-specs re-review with two shapes:
//   .husky -> ../shared-hooks              (directory symlink)
//   hooks/pre-commit -> ../../evil.sh      (file symlink)
// Neither requires .git/config write access: core.hooksPath = .husky is the
// ordinary value husky's own postinstall writes, the symlink is carried by
// `git clone`, and chaining is the DEFAULT choice on Enter.
//
// Before this fix, validateHooksPath had no direct unit test at all — AC-12/
// AC-14 of installer-consent-boundary.spec.md were only asserted incidentally
// through buildChainedHook tests (see cli-hook-chaining.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import { validateHooksPath, escapesRepoPhysically } from "../cli/index.mjs";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "adev-hookspath-test-"));
}

test("a plain contained relative path is accepted", () => {
  const repo = tempRepo();
  try {
    mkdirSync(join(repo, ".githooks"), { recursive: true });
    const verdict = validateHooksPath(".githooks", repo);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a not-yet-created contained relative path is still accepted", () => {
  // A fresh .githooks/ about to be created, or a hooks dir a caller has not
  // scaffolded yet, must not be rejected just because nothing exists there.
  const repo = tempRepo();
  try {
    const verdict = validateHooksPath(".githooks", repo);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a lexical ../.. escape is rejected", () => {
  const repo = tempRepo();
  try {
    const verdict = validateHooksPath("../../etc/evil", repo);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /outside the repository/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a symlinked directory whose target resolves outside the repo is rejected", () => {
  // .husky -> ../shared-hooks, where ../shared-hooks is a sibling of the
  // repo root, not something under it.
  const repo = tempRepo();
  try {
    const outside = mkdtempSync(join(tmpdir(), "adev-hookspath-outside-"));
    try {
      symlinkSync(outside, join(repo, ".husky"));
      const verdict = validateHooksPath(".husky", repo);
      assert.equal(verdict.ok, false, "a directory symlink escaping the repo must be rejected");
      assert.match(verdict.reason, /symlink|outside the repository/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a symlinked directory whose (nonexistent) target resolves outside the repo is rejected", () => {
  // The target doesn't exist at all yet — realpathSync would throw ENOENT
  // for the symlink itself, not just a deeper component. Must still reject.
  const repo = tempRepo();
  try {
    const outsideParent = dirname(repo);
    symlinkSync(join(outsideParent, "does-not-exist-shared-hooks"), join(repo, ".husky"));
    const verdict = validateHooksPath(".husky", repo);
    assert.equal(verdict.ok, false, "a dangling symlink escaping the repo must be rejected");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a symlinked file whose target resolves outside the repo is rejected", () => {
  // hooks/pre-commit -> ../../evil.sh
  const repo = tempRepo();
  try {
    const outside = mkdtempSync(join(tmpdir(), "adev-hookspath-outside-"));
    try {
      const evil = join(outside, "evil.sh");
      writeFileSync(evil, "#!/usr/bin/env bash\necho pwned\n");
      mkdirSync(join(repo, "hooks"), { recursive: true });
      symlinkSync(evil, join(repo, "hooks", "pre-commit"));
      const verdict = validateHooksPath("hooks/pre-commit", repo);
      assert.equal(verdict.ok, false, "a file symlink escaping the repo must be rejected");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a symlink resolving to somewhere INSIDE the repo is still accepted", () => {
  const repo = tempRepo();
  try {
    mkdirSync(join(repo, "real-hooks"), { recursive: true });
    symlinkSync(join(repo, "real-hooks"), join(repo, ".husky"));
    const verdict = validateHooksPath(".husky", repo);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a repo root that is itself a symlink (macOS /var vs /private/var shape) is not falsely rejected", () => {
  const real = tempRepo();
  try {
    mkdirSync(join(real, ".githooks"), { recursive: true });
    const alias = join(dirname(real), `adev-hookspath-alias-${process.pid}`);
    symlinkSync(real, alias);
    try {
      const verdict = validateHooksPath(".githooks", alias);
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    } finally {
      unlinkSync(alias);
    }
  } finally {
    rmSync(real, { recursive: true, force: true });
  }
});

// ── escapesRepoPhysically — the originalHookPath re-check ──────────────────
//
// setupGitHooks() joins chainFromPath (the validated hooksPath directory)
// with the concrete hookName to get originalHookPath, then re-checks THAT
// path — not the directory string validateHooksPath already saw. This
// matters because a directory can be legitimately contained while one file
// inside it is independently a symlink escaping the repo
// (`hooks/pre-commit -> ../../evil.sh`), and because a symlink could be
// introduced between config-read time and this point (TOCTOU). These tests
// exercise escapesRepoPhysically with the same call shape used at that site:
// an already-joined absolute candidate path plus the repo root, not a raw
// repo-relative string.

test("escapesRepoPhysically: false for a concrete file that stays inside the repo", () => {
  const repo = tempRepo();
  try {
    mkdirSync(join(repo, "hooks"), { recursive: true });
    writeFileSync(join(repo, "hooks", "pre-commit"), "#!/usr/bin/env bash\nexit 0\n");
    assert.equal(escapesRepoPhysically(join(repo, "hooks", "pre-commit"), repo), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("escapesRepoPhysically: true when the directory is legitimate but the file inside it is a symlink escaping the repo", () => {
  const repo = tempRepo();
  try {
    const outside = mkdtempSync(join(tmpdir(), "adev-hookspath-outside-"));
    try {
      const evil = join(outside, "evil.sh");
      writeFileSync(evil, "#!/usr/bin/env bash\necho pwned\n");
      mkdirSync(join(repo, "hooks"), { recursive: true });
      symlinkSync(evil, join(repo, "hooks", "pre-commit"));

      const originalHookPath = join(repo, "hooks", "pre-commit");
      assert.equal(escapesRepoPhysically(originalHookPath, repo), true);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("escapesRepoPhysically: false for a not-yet-existing concrete file under a legitimate directory", () => {
  const repo = tempRepo();
  try {
    mkdirSync(join(repo, "hooks"), { recursive: true });
    assert.equal(escapesRepoPhysically(join(repo, "hooks", "pre-commit"), repo), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("unsafe characters are still rejected before any filesystem check", () => {
  const repo = tempRepo();
  try {
    const verdict = validateHooksPath("hooks; rm -rf /", repo);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /unsafe/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
