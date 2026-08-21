/**
 * Guards for adev-plugin-model-routing-stale-zrf4: model ids are a class of
 * config that goes stale silently — the issue's own diagnosis found three
 * distinct copies of a fallback-default table (spec, skill, docs) still
 * naming a superseded generation, plus stale example text in skills/build
 * and skills/init/SKILL.md, discovered by grepping the whole tree once the
 * first instance was found.
 *
 * This is an ALLOWLIST (not a denylist) check: model generations turn over,
 * and a denylist of "known-bad" ids would itself need updating for every new
 * superseded generation, which is the exact failure mode under test. The
 * allowlist below is the single point of update when a new model family
 * ships — bump it there and this test starts trusting the new ids
 * immediately, no per-file hunting required.
 *
 * Scope is deliberately LIVE artifacts only — skills, the cross-cutting spec,
 * the project's own platform-context.yaml, and user docs. `.review.md`,
 * `.validate.md`, and `.plan.md` files are point-in-time historical records
 * (plan markdown is read-only after authoring per CON-8,
 * plan-task-events.spec.md) and are correctly excluded: rewriting them to a
 * later model generation would be revisionist, not a fix.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

/**
 * Currently-supported model ids. Update this set — and only this set — when
 * a new model generation ships; every check below derives from it.
 */
const CURRENT_MODEL_IDS = new Set([
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5", // short form used in the spec's own fallback-default table
]);

/** Matches any `claude-<family>-<version...>` token, current or superseded. */
const MODEL_ID_RE = /\bclaude-[a-z]+-[0-9][a-z0-9.-]*\b/g;

function collectSkillMdFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collectSkillMdFiles(abs, out);
    else if (entry.name === "SKILL.md") out.push(abs);
  }
  return out;
}

/** Every claude-* model id token found in a file, deduped. */
function modelIdsIn(absPath) {
  const body = readFileSync(absPath, "utf8");
  return [...new Set((body.match(MODEL_ID_RE) || []))];
}

test("skills/*/SKILL.md contain no superseded model id (top-level skills only, not provider mirrors)", () => {
  const files = collectSkillMdFiles(join(PLUGIN_ROOT, "skills"));
  assert.ok(files.length > 20, `expected a real skill corpus, found ${files.length}`);
  const offenders = [];
  for (const f of files) {
    for (const id of modelIdsIn(f)) {
      if (!CURRENT_MODEL_IDS.has(id)) offenders.push(`${f.slice(PLUGIN_ROOT.length + 1)}: ${id}`);
    }
  }
  assert.deepEqual(offenders, [], `superseded model id(s) found:\n${offenders.join("\n")}`);
});

test("model-routing.spec.md's fallback-default table names only current model ids", () => {
  const p = join(PLUGIN_ROOT, ".context-index", "specs", "cross-cutting", "model-routing.spec.md");
  const offenders = modelIdsIn(p).filter((id) => !CURRENT_MODEL_IDS.has(id));
  assert.deepEqual(offenders, [], `superseded model id(s) in model-routing.spec.md:\n${offenders.join("\n")}`);
});

test("write-test/model-selection.spec.md's fallback-default table names only current model ids", () => {
  const p = join(PLUGIN_ROOT, ".context-index", "specs", "features", "write-test", "model-selection.spec.md");
  const offenders = modelIdsIn(p).filter((id) => !CURRENT_MODEL_IDS.has(id));
  assert.deepEqual(offenders, [], `superseded model id(s) in model-selection.spec.md:\n${offenders.join("\n")}`);
});

test("docs/configuration.md's model_tiers example names only current model ids", () => {
  const p = join(PLUGIN_ROOT, "docs", "configuration.md");
  const offenders = modelIdsIn(p).filter((id) => !CURRENT_MODEL_IDS.has(id));
  assert.deepEqual(offenders, [], `superseded model id(s) in docs/configuration.md:\n${offenders.join("\n")}`);
});

test("this project's own platform-context.yaml model_tiers are all current", () => {
  const p = join(PLUGIN_ROOT, ".context-index", "platform-context.yaml");
  const offenders = modelIdsIn(p).filter((id) => !CURRENT_MODEL_IDS.has(id));
  assert.deepEqual(offenders, [], `superseded model id(s) in platform-context.yaml:\n${offenders.join("\n")}`);
});

test("skills/build/SKILL.md documents actual model behavior (no removed frontmatter pin claim)", () => {
  const body = readFileSync(join(PLUGIN_ROOT, "skills", "build", "SKILL.md"), "utf8");
  assert.doesNotMatch(
    body,
    /pins? `?claude-[a-z0-9.-]+`? via the skill'?s frontmatter/i,
    "no SKILL.md carries a model: frontmatter pin (removed in 42294cf7/170f8837) — the prose must not claim one exists"
  );
});
