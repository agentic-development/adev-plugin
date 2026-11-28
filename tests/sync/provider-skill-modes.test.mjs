// tests/sync/provider-skill-modes.test.mjs
//
// scripts/sync-provider-skills.mjs gives every mirror its canonical file's
// executable bit, on files it creates and on files it updates, and reports a
// mode-only difference as `updated` so `--dry-run` shows the drift. The mirrors
// symlink straight into user installs, so a script that loses +x does not run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const SCRIPT = join(PLUGIN_ROOT, "scripts", "sync-provider-skills.mjs");
const RUN = "scripts/run.sh";
const MIRRORS = ["providers/codex/skills/foo/scripts/run.sh", "providers/opencode/skills/foo/scripts/run.sh"];

function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

function sync(dir, ...flags) {
  return execFileSync(process.execPath, [SCRIPT, "--root", dir, ...flags], { encoding: "utf8" });
}

const executable = (dir, rel) => (statSync(join(dir, rel)).mode & 0o100) !== 0;

function withSkill(fn) {
  const dir = createTempDir();
  try {
    write(dir, "skills/foo/SKILL.md", '---\nname: adev:foo\ndescription: "Do foo."\n---\n\nbody\n');
    write(dir, `skills/foo/${RUN}`, "#!/bin/sh\necho hi\n");
    return fn(dir);
  } finally {
    cleanupTempDir(dir);
  }
}

test("a new executable canonical script produces executable mirrors", () => {
  withSkill((dir) => {
    chmodSync(join(dir, `skills/foo/${RUN}`), 0o755);
    const out = sync(dir);
    for (const m of MIRRORS) {
      assert.equal(executable(dir, m), true, m);
      assert.equal(readFileSync(join(dir, m), "utf8"), "#!/bin/sh\necho hi\n", m);
      assert.match(out, new RegExp(`created: ${m.replace(/\//g, "\\/")}`), m);
    }
  });
});

test("a new non-executable canonical file produces non-executable mirrors", () => {
  withSkill((dir) => {
    chmodSync(join(dir, `skills/foo/${RUN}`), 0o644);
    sync(dir);
    for (const m of MIRRORS) assert.equal(executable(dir, m), false, m);
  });
});

test("a chmod on the canonical file alone is reported by --dry-run and propagated by a sync", () => {
  for (const [label, from, to] of [["+x", 0o644, 0o755], ["-x", 0o755, 0o644]]) {
    withSkill((dir) => {
      chmodSync(join(dir, `skills/foo/${RUN}`), from);
      sync(dir);
      chmodSync(join(dir, `skills/foo/${RUN}`), to);

      const dry = sync(dir, "--dry-run");
      for (const m of MIRRORS) {
        assert.match(dry, new RegExp(`updated: ${m.replace(/\//g, "\\/")}`), `${label} dry-run reports ${m}`);
        assert.equal(executable(dir, m), from === 0o755, `${label} dry-run leaves ${m} alone`);
      }

      const out = sync(dir);
      for (const m of MIRRORS) {
        assert.match(out, new RegExp(`updated: ${m.replace(/\//g, "\\/")}`), `${label} sync reports ${m}`);
        assert.equal(executable(dir, m), to === 0o755, `${label} propagated to ${m}`);
      }
      assert.match(sync(dir, "--dry-run"), /0 updated, 0 created/, `${label} converged`);
    });
  }
});

test("a mirror chmod'd away from its canonical file is restored", () => {
  withSkill((dir) => {
    chmodSync(join(dir, `skills/foo/${RUN}`), 0o755);
    sync(dir);
    chmodSync(join(dir, MIRRORS[0]), 0o644);
    sync(dir);
    assert.equal(executable(dir, MIRRORS[0]), true);
  });
});
