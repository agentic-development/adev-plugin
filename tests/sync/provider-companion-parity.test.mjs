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
