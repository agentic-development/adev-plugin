// tests/sync/provider-companion-parity.test.mjs
//
// Every conditional-loading pointer in a provider mirror's SKILL.md must resolve
// to a file that exists inside that mirror's own tree.
//
// WHY THIS EXISTS. sync-provider-skills.mjs originally globbed companions as flat
// `*.md` at the skill root. Progressive disclosure moved them into `references/`
// and `scripts/` subdirectories, and that filter silently stopped matching
// anything — while the same script kept regenerating mirror SKILL.md bodies
// verbatim from canonical. The mirrors therefore shipped 155 distinct pointers to
// files that were never copied, across 18 skills.
//
// providers/codex/adapter.mjs and providers/opencode/adapter.mjs symlink the
// mirror skill directory straight into a user install, so the failure reached
// users as a skill whose body says "Read <path> for the full instructions. Do not
// act on this section from the summary above" — pointing at nothing, with no
// error raised. Copilot and cursor copy canonical skills/ recursively and were
// never affected.
//
// THE EXISTING PARITY TEST COULD NOT CATCH THIS. provider-skill-parity.test.mjs
// runs the sync script in --dry-run and asserts it reports no changes; a sync
// that copies nothing reports no changes. That test pins "the mirrors match what
// the script produces". This one pins the property that actually matters: the
// mirrors are internally consistent. A guard must not be derived from the tool it
// is guarding.
//
// Spec: .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROVIDERS_WITH_MIRRORS = ["codex", "opencode"];

/** Pointer targets named in a body, as skill-tree-relative paths. */
function pointerTargets(body) {
  const out = new Set();
  // Anchored form is canonical; the bare form is accepted here so that a
  // regression to it still gets its targets checked rather than skipped.
  for (const m of body.matchAll(
    /(?:<ADEV_ROOT>\/)?skills\/([a-z-]+)\/((?:references|scripts)\/[A-Za-z0-9._/-]+?\.(?:md|ya?ml|sh|mjs))/g,
  )) {
    out.add({ skill: m[1], rel: m[2] });
  }
  return [...out];
}

for (const provider of PROVIDERS_WITH_MIRRORS) {
  test(`${provider} mirror: every companion pointer resolves inside the mirror tree`, () => {
    const skillsDir = join(ROOT, "providers", provider, "skills");
    if (!existsSync(skillsDir)) return; // provider ships no mirror tree

    const broken = [];
    let checked = 0;
    for (const name of readdirSync(skillsDir)) {
      const body = join(skillsDir, name, "SKILL.md");
      if (!existsSync(body)) continue;
      for (const t of pointerTargets(readFileSync(body, "utf8"))) {
        checked++;
        // A body may legitimately reference another skill's companion; resolve
        // against the named skill, not the body's own directory.
        if (!existsSync(join(skillsDir, t.skill, t.rel))) {
          broken.push(`${provider}/skills/${name}/SKILL.md -> skills/${t.skill}/${t.rel}`);
        }
      }
    }

    assert.ok(
      checked > 0,
      `no pointers found in any ${provider} mirror body — the sweep is not running`,
    );
    assert.deepEqual(
      [...new Set(broken)],
      [],
      `mirror bodies point at companions absent from the mirror tree. Run ` +
        `\`node scripts/sync-provider-skills.mjs\` and commit the result:\n  ` +
        [...new Set(broken)].join("\n  "),
    );
  });
}

test("mirror trees hold the same companion set as canonical", () => {
  const canonical = new Set();
  const walk = (base, dir, sink) => {
    for (const e of readdirSync(join(base, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "agents") continue;
        walk(base, rel, sink);
      } else if (e.name !== "SKILL.md") sink.add(rel);
    }
  };
  walk(join(ROOT, "skills"), ".", canonical);

  for (const provider of PROVIDERS_WITH_MIRRORS) {
    const base = join(ROOT, "providers", provider, "skills");
    if (!existsSync(base)) continue;
    const mirror = new Set();
    walk(base, ".", mirror);
    // BOTH directions. canonical ⊆ mirror alone is not enough: syncFile() never
    // unlinks, so a companion deleted from canonical lingers in the mirror — and
    // that stale copy then SATISFIES the pointer test above for a pointer whose
    // canonical target is gone, masking a broken canonical pointer entirely.
    // Verified by probe: with only the ⊆ direction, deleting a canonical
    // companion still named by its body left every sync/parity test green.
    const missing = [...canonical].filter((f) => !mirror.has(f)).sort();
    const extra = [...mirror].filter((f) => !canonical.has(f)).sort();
    assert.deepEqual(
      missing,
      [],
      `${provider} mirror is missing ${missing.length} companion(s) present in canonical skills/`,
    );
    assert.deepEqual(
      extra,
      [],
      `${provider} mirror carries ${extra.length} companion(s) absent from canonical ` +
        `skills/ — sync does not delete, so remove them by hand. A stale mirror ` +
        `companion masks a broken canonical pointer.`,
    );
  }
});

test("every companion pointer in canonical skills/ resolves", () => {
  // The mirror test above only proves the MIRROR is self-consistent. Canonical
  // needs its own check: a pointer whose target was deleted or renamed in
  // skills/ is the defect that actually reaches every provider, since all four
  // publish from (or mirror) this tree.
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(md|ya?ml)$/.test(e.name)) out.push(p);
    }
    return out;
  };

  const broken = [];
  let checked = 0;
  for (const f of walk(join(ROOT, "skills"))) {
    for (const m of readFileSync(f, "utf8").matchAll(
      /<ADEV_ROOT>\/(skills\/[a-z-]+\/(?:references|scripts)\/[A-Za-z0-9._/-]+?\.(?:md|ya?ml|sh|mjs))/g,
    )) {
      checked++;
      if (!existsSync(join(ROOT, m[1]))) {
        broken.push(`${f.replace(ROOT + "/", "")} -> ${m[1]}`);
      }
    }
  }

  assert.ok(checked > 100, `only ${checked} pointers swept — the walk is truncated`);
  assert.deepEqual(
    [...new Set(broken)],
    [],
    "canonical companion pointers naming files that do not exist:\n  " +
      [...new Set(broken)].join("\n  "),
  );
});

test("the pointer graph is a DAG rooted at SKILL.md, at most 3 hops deep", () => {
  // Invariant 7. Stated since revision 3 and enforced by nothing until now —
  // carried as a known gap across three review rounds (TERM-3).
  //
  // BEH-7's reachability test does NOT imply this: it asks only that some file
  // in the skill's surface references a companion, which a mutually-referencing
  // pair A<->B satisfies while being both cyclic and unreachable from the body.
  //
  // The shipping tree sits exactly ON the ceiling — implement/SKILL.md ->
  // repo-mode-advisory.md -> steps/step-2-per-task-loop.md -> batched-mode.md is
  // 3 hops — so the next added hop violates the invariant. That is precisely why
  // a guard is needed rather than an eyeball: the violation is one edit away and
  // invisible in review.
  const MAX_DEPTH = 3;

  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(md|ya?ml)$/.test(e.name)) out.push(p);
    }
    return out;
  };

  // Edges: file -> the companions it points at, as repo-relative paths.
  const edges = new Map();
  for (const abs of walk(join(ROOT, "skills"))) {
    const rel = abs.replace(ROOT + "/", "");
    const targets = new Set();
    for (const m of readFileSync(abs, "utf8").matchAll(
      /<ADEV_ROOT>\/(skills\/[a-z-]+\/(?:references|scripts)\/[A-Za-z0-9._/-]+?\.(?:md|ya?ml|sh|mjs))/g,
    )) {
      targets.add(m[1]);
    }
    if (targets.size) edges.set(rel, [...targets]);
  }
  assert.ok(edges.size > 0, "no pointer edges found — the sweep is not running");

  const cycles = [];
  const tooDeep = [];

  // DFS from each body. `path` is the chain so far, so a repeat inside it is a
  // cycle reachable from a root — which is the case that actually hangs a reader.
  const visit = (node, path) => {
    if (path.includes(node)) {
      cycles.push([...path, node].join(" -> "));
      return;
    }
    const next = edges.get(node);
    if (!next) return;
    if (path.length >= MAX_DEPTH) {
      tooDeep.push([...path, node].join(" -> "));
      return;
    }
    for (const child of next) visit(child, [...path, node]);
  };

  for (const start of edges.keys()) {
    if (!/\/SKILL\.md$/.test(start)) continue;
    visit(start, []);
  }

  assert.deepEqual(
    [...new Set(cycles)],
    [],
    "companion pointer cycles (Invariant 7 — the graph must be acyclic):\n  " +
      [...new Set(cycles)].join("\n  "),
  );
  assert.deepEqual(
    [...new Set(tooDeep)],
    [],
    `companion pointer chains deeper than ${MAX_DEPTH} hops (Invariant 7). Past ` +
      "this depth disclosure has become indirection — inline the section or " +
      "point at it from the body directly:\n  " + [...new Set(tooDeep)].join("\n  "),
  );
});
