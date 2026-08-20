/**
 * Regression guard: every skill that creates a PLAN EPIC names the epic-store
 * verb, `adev issues epic`.
 *
 * Why this is a hard assertion and not a style preference: `adev issues create
 * --type epic` routes through `manager.create()`, which lands the record in
 * `board.issues`. `listEpics()` reads `board.epics` ONLY — and the beads
 * adapter additionally requires an `epic-*` `external_ref` that `create()`
 * never mints. An "epic" made that way is therefore invisible to `adev issues
 * board`'s epics section, to `list --milestone`, to `update --milestone` and to
 * milestone progress, on every backend. Concretely: `/adev:implement`'s "if an
 * epic exists matching this plan's planRef, load it" and `/adev:reconcile` pass
 * 1e ("plan files with no corresponding epic") never find it, so each run mints
 * a duplicate.
 *
 * `--spec-ref` is asserted absent from the epic call too: `validateEpic`'s
 * return whitelist has no spec-ref field, so the flag would be silently
 * discarded — the same class of loss this guard exists to prevent. The spec
 * link lives on the spec and plan artifacts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

/** Skills whose process creates the plan-level epic on the board. */
const EPIC_CREATING_SKILLS = ["plan", "implement", "reconcile"];

function readSkill(slug) {
  return readFileSync(join(REPO_ROOT, "skills", slug, "SKILL.md"), "utf8");
}

describe("plan-epic creation names the epic-store verb", () => {
  for (const slug of EPIC_CREATING_SKILLS) {
    describe(`skills/${slug}/SKILL.md`, () => {
      const skill = readSkill(slug);

      it("names `adev issues epic`", () => {
        assert.match(
          skill,
          /\badev issues epic\b/,
          "the epic-creation step must call `adev issues epic`, the only verb that reaches board.epics"
        );
      });

      it("never mints an epic through `adev issues create --type epic`", () => {
        // Flags may be reordered, so match the verb and the `--type epic`
        // argument anywhere within the same command line.
        const lines = skill.split("\n").filter((l) => /\badev issues create\b/.test(l));
        const offenders = lines.filter((l) => /--type\s+["']?epic\b/.test(l));
        assert.deepEqual(
          offenders,
          [],
          "`adev issues create --type epic` writes to board.issues, which listEpics() never reads; " +
            "use `adev issues epic \"<title>\" --plan-ref <path>` instead"
        );
      });

      it("passes no --spec-ref on the epic call (the epic store has no such field)", () => {
        const lines = skill.split("\n").filter((l) => /\badev issues epic\b/.test(l));
        assert.ok(lines.length > 0, "expected at least one `adev issues epic` invocation");
        const offenders = lines.filter((l) => /--spec-ref\b/.test(l));
        assert.deepEqual(
          offenders,
          [],
          "validateEpic drops a spec ref silently; the spec link lives on the spec/plan artifacts"
        );
      });
    });
  }

  it("keeps the plan-epic call bound to --plan-ref, the field implement/reconcile look up by", () => {
    for (const slug of EPIC_CREATING_SKILLS) {
      const lines = readSkill(slug)
        .split("\n")
        .filter((l) => /\badev issues epic\b/.test(l));
      assert.ok(
        lines.some((l) => /--plan-ref\b/.test(l)),
        `skills/${slug}/SKILL.md must pass --plan-ref so the epic is discoverable by planRef`
      );
    }
  });
});
