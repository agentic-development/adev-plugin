/**
 * Tests for the kind-validity hygiene audit pass.
 *
 * Spec: .context-index/specs/features/lifecycle-artifacts/hygiene-kind-validity.spec.md
 * Plan: .context-index/specs/features/lifecycle-artifacts/hygiene-kind-validity.plan.md
 *
 * Verifies the five finding codes (INVALID_KIND, MISSING_KIND,
 * MODULE_KIND_NO_MANIFEST, LEGACY_DEFAULTED, PARSE_ERROR) on representative
 * fixtures and the non-blocking exit contract (returned `findings` array is
 * the sole signal; the pass never throws and never sets `process.exitCode`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runKindValidityPass } from "../../lib/hygiene/kind-validity.mjs";

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "kind-validity-"));
  mkdirSync(join(dir, ".context-index", "specs", "features"), { recursive: true });
  return dir;
}

function writeManifest(projectRoot, modules) {
  const yaml = ["modules:"];
  for (const slug of modules) {
    yaml.push(`  - slug: ${slug}`);
    yaml.push(`    name: ${slug}`);
  }
  writeFileSync(
    join(projectRoot, ".context-index", "manifest.yaml"),
    yaml.join("\n") + "\n",
    "utf8",
  );
}

function writeArtifact(projectRoot, relPath, frontmatter, body = "# stub\n") {
  const fullPath = join(projectRoot, relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  let fm = "---\n";
  for (const [k, v] of Object.entries(frontmatter)) {
    fm += `${k}: ${v}\n`;
  }
  fm += "---\n";
  writeFileSync(fullPath, fm + body, "utf8");
  return fullPath;
}

function backdate(filePath, days) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - days);
  utimesSync(filePath, t, t);
}

function findingFor(findings, code, pathSuffix) {
  return findings.find(
    (f) => f.code === code && f.path.endsWith(pathSuffix),
  );
}

// -----------------------------------------------------------------------------
// INVALID_KIND
// -----------------------------------------------------------------------------

test("INVALID_KIND finding for spec with unknown kind value", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    writeArtifact(root, ".context-index/specs/features/foo/bad-kind.spec.md", {
      charter: "foo",
      kind: "nonsense",
    });
    const { findings } = await runKindValidityPass(root);
    const f = findingFor(findings, "INVALID_KIND", "bad-kind.spec.md");
    assert.ok(f, "expected an INVALID_KIND finding");
    assert.equal(f.severity, "error");
    assert.equal(f.layer, "spec");
    assert.match(f.reason, /not in/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("INVALID_KIND finding for charter with cross-layer kind value", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    // 'behavioral' is a spec kind, not a charter kind — should trip INVALID_KIND.
    writeArtifact(root, ".context-index/specs/features/foo/charter.md", {
      kind: "behavioral",
    });
    const { findings } = await runKindValidityPass(root);
    const f = findingFor(findings, "INVALID_KIND", "foo/charter.md");
    assert.ok(f, "expected an INVALID_KIND finding for cross-layer kind");
    assert.equal(f.severity, "error");
    assert.equal(f.layer, "charter");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// MISSING_KIND (post-cutover)
// -----------------------------------------------------------------------------

test("MISSING_KIND finding for spec without kind: created after cutover", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    const p = writeArtifact(
      root,
      ".context-index/specs/features/foo/missing.spec.md",
      { charter: "foo" }, // no kind:
    );
    // mtime in the future relative to a fixed cutover one year ago.
    const cutover = new Date();
    cutover.setUTCFullYear(cutover.getUTCFullYear() - 1);

    const { findings } = await runKindValidityPass(root, {
      cutover: cutover.toISOString(),
    });
    const f = findingFor(findings, "MISSING_KIND", "missing.spec.md");
    assert.ok(f, "expected a MISSING_KIND finding (post-cutover)");
    assert.equal(f.severity, "warn");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// LEGACY_DEFAULTED (pre-cutover)
// -----------------------------------------------------------------------------

test("LEGACY_DEFAULTED finding for spec without kind: created before cutover", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    const p = writeArtifact(
      root,
      ".context-index/specs/features/foo/legacy.spec.md",
      { charter: "foo" }, // no kind:
    );
    backdate(p, 365); // file mtime is one year ago
    // Cutover is "now" — so the file was created before cutover.
    const cutover = new Date().toISOString();

    const { findings } = await runKindValidityPass(root, { cutover });
    const f = findingFor(findings, "LEGACY_DEFAULTED", "legacy.spec.md");
    assert.ok(f, "expected a LEGACY_DEFAULTED finding (pre-cutover)");
    assert.equal(f.severity, "info");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// PARSE_ERROR
// -----------------------------------------------------------------------------

test("PARSE_ERROR finding when frontmatter parser throws (unreadable artifact)", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    // Create a *directory* whose name ends with `.spec.md`. The collector picks
    // it up only if it's a regular file, so we also need a sentinel file inside
    // to ensure the walker visits the parent. Then trip the parser by handing
    // it a directory-named file: readFileSync(dir) throws EISDIR. We simulate
    // by writing a real file and then replacing it with a directory? Simpler:
    // intercept via a path that breaks readFileSync. The deterministic option
    // on every platform is to write a regular file and then unlink it after
    // the directory walk completes. We expose that via the pass's two-phase
    // structure by passing a moduleFilter pointing at a known stale path —
    // but cleaner: write a regular `.spec.md` whose content makes
    // parseSpecFrontmatter throw. Since the parser only throws on readFileSync
    // failure, we use a binary-style unreadable path via a symlink loop.
    //
    // The simplest portable trick: create a `.spec.md` *directory* (not a
    // file) — the directory walker only emits `entry.isFile()` entries, so
    // we can't reach it that way. Instead: write a regular file, then in a
    // separate step rename it to be inside a directory the parser can't
    // resolve. The cleanest reliable trick:
    //
    //   1. Write a real `.spec.md` file under the project root
    //   2. Replace it on disk with a *broken* symlink immediately before
    //      running the pass
    //
    // readFileSync follows symlinks and surfaces ENOENT, which throws.
    const target = join(root, ".context-index/specs/features/foo/broken.spec.md");
    mkdirSync(join(target, ".."), { recursive: true });
    // Symlink to a path that does not exist → readFileSync throws ENOENT.
    const { symlinkSync } = await import("node:fs");
    symlinkSync(join(root, "no-such-target"), target);

    const { findings } = await runKindValidityPass(root);
    const f = findingFor(findings, "PARSE_ERROR", "broken.spec.md");
    assert.ok(f, "expected a PARSE_ERROR finding when the parser throws");
    assert.equal(f.severity, "error");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// Non-blocking exit
// -----------------------------------------------------------------------------

test("pass never throws and never sets process.exitCode regardless of findings", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    // Mix in one of each: invalid, missing, parse-error.
    writeArtifact(root, ".context-index/specs/features/foo/a.spec.md", {
      kind: "bogus",
    });
    writeArtifact(root, ".context-index/specs/features/foo/b.spec.md", {
      charter: "foo",
    });
    // PARSE_ERROR: broken symlink → readFileSync throws ENOENT.
    const broken = join(root, ".context-index/specs/features/foo/c.spec.md");
    mkdirSync(join(broken, ".."), { recursive: true });
    const { symlinkSync } = await import("node:fs");
    symlinkSync(join(root, "no-such-target"), broken);

    const before = process.exitCode;
    const result = await runKindValidityPass(root);
    const after = process.exitCode;

    assert.equal(before, after, "pass must not mutate process.exitCode");
    assert.ok(Array.isArray(result.findings));
    assert.ok(result.findings.length >= 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// mtime-fallback warning
// -----------------------------------------------------------------------------

test("mtime-fallback warning surfaces when git is unavailable for an artifact", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    // Files in a fresh tmpdir are uncommitted → git timestamp falls back to mtime.
    writeArtifact(root, ".context-index/specs/features/foo/legacy.spec.md", {
      charter: "foo",
    });
    backdate(
      join(root, ".context-index/specs/features/foo/legacy.spec.md"),
      365,
    );

    const { findings } = await runKindValidityPass(root, {
      cutover: new Date().toISOString(),
    });
    const f = findingFor(findings, "LEGACY_DEFAULTED", "legacy.spec.md");
    assert.ok(f);
    assert.ok(
      f.timestampWarning && /mtime/i.test(f.timestampWarning),
      "expected mtime-fallback warning to be attached to the finding",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// MODULE_KIND_NO_MANIFEST (Task 2 coverage)
// -----------------------------------------------------------------------------

test("MODULE_KIND_NO_MANIFEST when kind:module charter slug is not in manifest", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, ["cli", "hooks"]);
    writeArtifact(root, ".context-index/specs/features/orphan/charter.md", {
      kind: "module",
    });
    const { findings } = await runKindValidityPass(root);
    const f = findingFor(
      findings,
      "MODULE_KIND_NO_MANIFEST",
      "orphan/charter.md",
    );
    assert.ok(f, "expected MODULE_KIND_NO_MANIFEST for unlisted module slug");
    assert.equal(f.severity, "warn");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no MODULE_KIND_NO_MANIFEST when kind:module charter slug IS in manifest", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, ["known"]);
    writeArtifact(root, ".context-index/specs/features/known/charter.md", {
      kind: "module",
    });
    const { findings } = await runKindValidityPass(root);
    const f = findingFor(
      findings,
      "MODULE_KIND_NO_MANIFEST",
      "known/charter.md",
    );
    assert.equal(f, undefined, "no finding expected when slug is in manifest");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest missing → cross-reference is skipped but other findings still emit", async () => {
  const root = makeTempProject();
  try {
    // intentionally no manifest.yaml
    writeArtifact(root, ".context-index/specs/features/foo/a.spec.md", {
      kind: "nonsense",
    });
    writeArtifact(root, ".context-index/specs/features/foo/charter.md", {
      kind: "module",
    });
    const { findings, headerNotes } = await runKindValidityPass(root);
    const invalid = findingFor(findings, "INVALID_KIND", "a.spec.md");
    assert.ok(invalid, "INVALID_KIND should still emit when manifest is missing");
    const moduleFinding = findingFor(
      findings,
      "MODULE_KIND_NO_MANIFEST",
      "foo/charter.md",
    );
    assert.equal(
      moduleFinding,
      undefined,
      "MODULE_KIND_NO_MANIFEST cross-reference must be skipped when manifest is missing",
    );
    assert.ok(
      Array.isArray(headerNotes) && headerNotes.some((n) => /manifest/i.test(n)),
      "expected a header note explaining the manifest cross-reference was skipped",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// Empty project
// -----------------------------------------------------------------------------

test("zero findings when no specs/charters exist", async () => {
  const root = makeTempProject();
  try {
    writeManifest(root, []);
    const { findings } = await runKindValidityPass(root);
    assert.deepEqual(findings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
