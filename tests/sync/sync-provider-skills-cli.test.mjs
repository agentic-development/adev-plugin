// tests/sync/sync-provider-skills-cli.test.mjs
//
// scripts/sync-provider-skills.mjs argument validation and its refusal to
// write through a symlink. Every run passes `--root` at a temp checkout, or
// fails before it reads one, so no test can sync this repository.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const SCRIPT = join(PLUGIN_ROOT, "scripts", "sync-provider-skills.mjs");

function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

function sync(cwd, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
}

function withCheckout(fn) {
  const dir = createTempDir();
  try {
    write(dir, "skills/foo/SKILL.md", '---\nname: adev:foo\ndescription: "Do foo."\n---\n\nbody\n');
    write(dir, "skills/foo/references/notes.md", "notes\n");
    return fn(dir);
  } finally {
    cleanupTempDir(dir);
  }
}

test("an unknown --provider exits 1 and writes nothing", () => {
  withCheckout((dir) => {
    const r = sync(dir, "--root", dir, "--provider", "bogus");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /unknown --provider 'bogus'.*codex.*opencode|unknown --provider 'bogus'.*opencode.*codex/);
    assert.equal(existsSync(join(dir, "providers")), false);
  });
});

test("--provider without a value exits 1", () => {
  withCheckout((dir) => {
    for (const args of [["--root", dir, "--provider"], ["--provider", "--root", dir]]) {
      const r = sync(dir, ...args);
      assert.equal(r.status, 1, args.join(" "));
      assert.match(r.stderr, /--provider requires a value/, args.join(" "));
      assert.equal(existsSync(join(dir, "providers")), false);
    }
  });
});

test("--root without a value exits 1", () => {
  withCheckout((dir) => {
    for (const args of [["--root"], ["--root", "--dry-run"], ["--dry-run", "--root", ""]]) {
      const r = sync(dir, ...args);
      assert.equal(r.status, 1, JSON.stringify(args));
      assert.match(r.stderr, /--root requires a value/, JSON.stringify(args));
    }
  });
});

test("a known --provider syncs only that provider", () => {
  withCheckout((dir) => {
    const r = sync(dir, "--root", dir, "--provider", "opencode");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, "providers/opencode/skills/foo/references/notes.md"), "utf8"), "notes\n");
    assert.equal(existsSync(join(dir, "providers/codex")), false);
  });
});

test("a symlinked destination file is reported, skipped and exits 1, without writing through it", () => {
  for (const dryRun of [false, true]) {
    withCheckout((dir) => {
      write(dir, "outside.md", "untouched\n");
      mkdirSync(join(dir, "providers/codex/skills/foo/references"), { recursive: true });
      symlinkSync("../../../../../outside.md", join(dir, "providers/codex/skills/foo/references/notes.md"));
      const r = sync(dir, "--root", dir, ...(dryRun ? ["--dry-run"] : []));
      const label = dryRun ? "dry-run" : "sync";
      assert.equal(r.status, 1, label);
      assert.match(r.stderr, /refusing to write through a symlink: providers\/codex\/skills\/foo\/references\/notes\.md/, label);
      assert.equal(readFileSync(join(dir, "outside.md"), "utf8"), "untouched\n", label);
      assert.equal(existsSync(join(dir, "providers/opencode/skills/foo/references/notes.md")), !dryRun, `${label}: other mirrors still synced`);
    });
  }
});

test("a symlinked destination directory is refused for every file beneath it", () => {
  withCheckout((dir) => {
    mkdirSync(join(dir, "elsewhere"));
    mkdirSync(join(dir, "providers/codex/skills"), { recursive: true });
    symlinkSync("../../../elsewhere", join(dir, "providers/codex/skills/foo"));
    const r = sync(dir, "--root", dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refusing to write through a symlink: providers\/codex\/skills\/foo\b/);
    assert.deepEqual(existsSync(join(dir, "elsewhere/SKILL.md")), false);
    assert.equal(existsSync(join(dir, "elsewhere/references/notes.md")), false);
    assert.equal(existsSync(join(dir, "elsewhere/agents/openai.yaml")), false);
  });
});

test("a symlinked providers/ directory is refused", () => {
  withCheckout((dir) => {
    mkdirSync(join(dir, "elsewhere"));
    symlinkSync("elsewhere", join(dir, "providers"));
    const r = sync(dir, "--root", dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refusing to write through a symlink: providers\n/);
    assert.equal(existsSync(join(dir, "elsewhere/codex")), false);
  });
});
