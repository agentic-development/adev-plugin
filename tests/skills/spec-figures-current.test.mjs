// tests/skills/spec-figures-current.test.mjs
//
// The figures skill-body-progressive-disclosure.spec.md states about the CURRENT
// tree must re-derive from the current tree.
//
// WHY THIS EXISTS. Revisions 3, 4, 5 and 6 each shipped a stale count. Every time
// the cause was the same: a figure measured, then a later edit in the same commit
// moved it. Four review rounds caught them by hand, one round each, and the fix
// each time was "measure more carefully" — which failed the next round.
//
// Care was never the problem. The spec restates the same facts in four places
// (Improvements table, Changes Catalog, Acceptance Criteria, Known gaps), so every
// edit has four chances to leave one behind, and nothing but a reviewer's arithmetic
// could notice. This makes the drift fail the suite instead.
//
// SCOPE. Only figures that track the tree. Deliberately NOT covered:
//   - the 856,056 B baseline and the 16 per-skill "before" values, which are
//     history and cannot drift;
//   - suite totals, which were REMOVED from the spec rather than pinned here —
//     asserting the suite's own size from inside the suite is circular, and the
//     number carries no information a reader needs.
//
// Each figure is parsed out of the prose rather than hardcoded, so editing the spec
// to a new correct value passes and editing it to a wrong one fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SPEC = join(
  PLUGIN_ROOT, ".context-index", "specs", "cross-cutting",
  "skill-body-progressive-disclosure.spec.md",
);
const spec = readFileSync(SPEC, "utf8");
const num = (s) => Number(String(s).replace(/,/g, ""));

/** Every non-SKILL.md file under a skill tree, `agents/` excluded — the parity guard's definition. */
function companions(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== "agents") walk(join(dir, e.name));
      } else if (e.name !== "SKILL.md") out.push(join(dir, e.name));
    }
  };
  walk(root);
  return out;
}

test("the stated current byte total and saving re-derive from the tree", () => {
  let actual = 0;
  for (const d of readdirSync(join(PLUGIN_ROOT, "skills"))) {
    const p = join(PLUGIN_ROOT, "skills", d, "SKILL.md");
    if (existsSync(p)) actual += statSync(p).size;
  }

  const m = /Total ([\d,]+) → ([\d,]+) B \(−([\d.]+)%\)/.exec(spec);
  assert.ok(m, "the Improvements row must state `Total <before> → <after> B (−N%)`");
  const [, before, after, pct] = m;

  assert.equal(num(after), actual, "the stated current total does not match the tree");
  const expectedPct = ((num(before) - actual) / num(before)) * 100;
  assert.equal(
    Number(pct), Number(expectedPct.toFixed(1)),
    `stated ${pct}% but ${num(before)} → ${actual} is ${expectedPct.toFixed(1)}%`,
  );

  // The saving is quoted twice, in different sections — the exact duplication that
  // produced the drift. Both must agree with the same subtraction.
  const saving = num(before) - actual;
  const quoted = [...spec.matchAll(/([\d,]{6,}) fewer bytes/g)].map((x) => num(x[1]));
  assert.ok(quoted.length > 0, "the saving must be stated at least once");
  for (const q of quoted) {
    assert.equal(q, saving, `stated "${q.toLocaleString()} fewer bytes" but the tree gives ${saving}`);
  }
});

test("the stated companion count re-derives, and matches all three trees", () => {
  const m = /([\d,]+) files each in canonical, codex and opencode/.exec(spec);
  assert.ok(m, "the acceptance criterion must state the per-tree companion count");

  const counts = {
    canonical: companions(join(PLUGIN_ROOT, "skills")).length,
    codex: companions(join(PLUGIN_ROOT, "providers", "codex", "skills")).length,
    opencode: companions(join(PLUGIN_ROOT, "providers", "opencode", "skills")).length,
  };
  for (const [tree, n] of Object.entries(counts)) {
    assert.equal(n, num(m[1]), `spec says ${m[1]} companions; ${tree} has ${n}`);
  }
});

test("the stated pointer counts re-derive with the guard's own regex", () => {
  const m = /([\d,]+) occurrences naming ([\d,]+) unique targets/.exec(spec);
  assert.ok(m, "the acceptance criterion must state occurrences and unique targets");

  const uniq = new Set();
  let occ = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(md|ya?ml)$/.test(e.name)) continue;
      for (const hit of readFileSync(p, "utf8").matchAll(
        /<ADEV_ROOT>\/(skills\/[a-z-]+\/(?:references|scripts)\/[A-Za-z0-9._/-]+?\.(?:md|ya?ml|sh|mjs))/g,
      )) { occ++; uniq.add(hit[1]); }
    }
  };
  walk(join(PLUGIN_ROOT, "skills"));

  assert.equal(occ, num(m[1]), "stated pointer occurrences do not match the tree");
  assert.equal(uniq.size, num(m[2]), "stated unique pointer targets do not match the tree");
});

test("the spec states no suite total", () => {
  // Removed rather than pinned. It drifted in four consecutive revisions, asserting
  // it from inside the suite is circular, and a reader learns nothing from the
  // absolute number that "the gates pass" does not already tell them.
  assert.doesNotMatch(
    spec,
    /\b7[0-9]{3} tests\b/,
    "the spec should not restate a suite total — cite that the gates pass instead",
  );
});
