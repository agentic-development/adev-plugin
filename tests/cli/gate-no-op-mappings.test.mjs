// tests/cli/gate-no-op-mappings.test.mjs
//
// Regression guard for the silent no-op gate mappings (issue-565).
//
// `SKILL_STEP_MAP` mapped `brainstorm -> "brainstorm"` and `retro -> "retro"`,
// neither of which is a member of STEP_ORDER. `priorStepOf` computes
// `idx = STEP_ORDER.indexOf(step)` then returns null when `idx <= 0` — which is
// true both for `specify` (idx 0, legitimately no predecessor) and for a step
// that is not in the list at all (idx -1). Those two gates therefore returned
// "no prior step required" and passed unconditionally while appearing enforced.
//
// The invariant these tests protect: a gate for any step other than the first
// must FAIL on a project with no lifecycle history. A mapping that silently
// passes is indistinguishable from a mapping that is doing its job, which is
// what let this sit undetected.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isGatedStep } from "../../lib/lifecycle-state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");
const SPEC_REL = ".context-index/specs/features/m/s.spec.md";

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-gate-noop-"));
  mkdirSync(join(dir, ".context-index/specs/features/m"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index/manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  writeFileSync(
    join(dir, SPEC_REL),
    "---\ncharter: m\nstatus: draft\n---\n\n# s\n",
  );
  return dir;
}

function gate(dir, skill) {
  return spawnSync("node", [CLI, "gate", "require", "--skill", skill, "--spec", SPEC_REL], {
    encoding: "utf8",
    cwd: dir,
  });
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

for (const skill of ["brainstorm", "retro"]) {
  test(`adev gate require --skill ${skill} does not silently pass`, () => {
    const dir = makeTempProject();
    try {
      const r = gate(dir, skill);
      assert.notStrictEqual(
        r.status,
        0,
        `${skill} mapped to a non-lifecycle step and passed the gate unconditionally`,
      );
    } finally {
      cleanup(dir);
    }
  });
}

test("specify still passes on a fresh project (index 0 has no predecessor by design)", () => {
  const dir = makeTempProject();
  try {
    const r = gate(dir, "specify");
    assert.strictEqual(r.status, 0, `${r.stderr}${r.stdout}`);
  } finally {
    cleanup(dir);
  }
});

test("every non-first supported skill blocks on a project with no lifecycle history", () => {
  // Reads the supported list from `help()` output so a newly added mapping is
  // covered automatically rather than needing this list updated.
  const help = spawnSync("node", [CLI, "gate", "--help"], {
    encoding: "utf8",
    cwd: PROJECT_ROOT,
  });
  const supported = help.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[a-z][a-z-]*$/.test(l) && l !== "require");

  assert.ok(supported.length >= 4, `expected several supported skills, got ${supported.join(",")}`);

  const dir = makeTempProject();
  try {
    for (const skill of supported.filter((s) => s !== "specify")) {
      const r = gate(dir, skill);
      assert.strictEqual(
        r.status,
        2,
        `skill "${skill}" returned ${r.status} on a project with no lifecycle events; ` +
          `a non-first gate must block (exit 2), never pass silently`,
      );
    }
  } finally {
    cleanup(dir);
  }
});

test("isGatedStep distinguishes real lifecycle steps from unknown names", () => {
  for (const step of ["specify", "review", "plan", "route", "implement", "validate"]) {
    assert.strictEqual(isGatedStep(step), true, `${step} should be a gated step`);
  }
  for (const step of ["brainstorm", "retro", "", "Specify", "nonsense"]) {
    assert.strictEqual(isGatedStep(step), false, `${step} should not be a gated step`);
  }
});
