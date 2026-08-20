/**
 * BEH-12 — the eval skill must pass the literal keyword `default` to
 * `adev eval score --rubric`, never a pre-resolved path.
 *
 * The bug these tests exist for: `adev eval score --rubric` treats the exact
 * literal `default` as a keyword naming the plugin's shipped rubric and
 * resolves it against the plugin root. Every other value is contained against
 * the project root. A skill that pre-expands the keyword to
 * `<ADEV_ROOT>/skills/eval/default-rubric.yaml` therefore hands the verb an
 * ordinary path that takes the project-root branch and is refused in every
 * real install — the keyword branch is never entered. The caller obligation is
 * part of the contract, so it is asserted here, on the skill text.
 *
 * The provider mirrors are enumerated by globbing rather than hardcoding, so a
 * third provider added later is covered automatically.
 *
 * Pattern: tests/skills/eval-default-rubric.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const CANONICAL = join(PLUGIN_ROOT, "skills", "eval", "SKILL.md");

/** Glob providers/<provider>/skills/eval/SKILL.md — never a hardcoded list. */
function providerMirrors() {
  const root = join(PLUGIN_ROOT, "providers");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, e.name, "skills", "eval", "SKILL.md"))
    .filter((p) => existsSync(p))
    .sort();
}

const MIRRORS = providerMirrors();

const TARGETS = [
  { label: "skills/eval/SKILL.md", path: CANONICAL },
  ...MIRRORS.map((p) => ({
    label: p.slice(PLUGIN_ROOT.length + 1),
    path: p,
  })),
];

/** Every line that invokes the scoring verb. */
function scoreInvocations(text) {
  return text
    .split("\n")
    .filter((l) => /^\s*adev\s+eval\s+score\b/.test(l))
    .filter((l) => /--rubric\b/.test(l));
}

/** Extract the `### Rubric resolution` section (up to the next heading). */
function rubricResolutionSection(text) {
  const start = text.indexOf("### Rubric resolution");
  if (start === -1) return "";
  const rest = text.slice(start + 1);
  const next = rest.search(/\n#{1,3} /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every `--rubric <arg>` argument value in the file. */
function rubricArguments(text) {
  return [...text.matchAll(/--rubric[ \t]+(\S+)/g)].map((m) => m[1]);
}

describe("eval rubric keyword emission — glob sanity", () => {
  it("finds the canonical skill and at least two provider mirrors", () => {
    assert.equal(
      existsSync(CANONICAL),
      true,
      "skills/eval/SKILL.md must exist",
    );
    assert.ok(
      MIRRORS.length >= 2,
      `expected at least 2 providers/*/skills/eval/SKILL.md mirrors, found ${MIRRORS.length}: ${MIRRORS.join(", ")}`,
    );
  });
});

for (const target of TARGETS) {
  describe(`${target.label} — passes the literal rubric keyword (BEH-12)`, () => {
    const text = readFileSync(target.path, "utf8");

    it("(a) the `adev eval score` invocation passes `--rubric default`", () => {
      const invocations = scoreInvocations(text);
      assert.ok(
        invocations.length > 0,
        `${target.label} declares no \`adev eval score --rubric ...\` invocation`,
      );
      for (const line of invocations) {
        assert.match(
          line,
          /--rubric[ \t]+default(\s|$)/,
          `${target.label}: scoring invocation must pass the literal token \`default\`, got: ${line.trim()}`,
        );
        assert.doesNotMatch(
          line,
          /<resolved rubric path>/,
          `${target.label}: scoring invocation must not pass a pre-resolved rubric path: ${line.trim()}`,
        );
        assert.doesNotMatch(
          line,
          /<ADEV_ROOT>/,
          `${target.label}: scoring invocation must not pass an <ADEV_ROOT>-prefixed path: ${line.trim()}`,
        );
      }
    });

    it("(b) the Rubric resolution section states the keyword is passed unresolved", () => {
      const section = rubricResolutionSection(text);
      assert.notEqual(
        section,
        "",
        `${target.label}: no \`### Rubric resolution\` section found`,
      );
      assert.match(
        section,
        /literal token `default`/,
        `${target.label}: Rubric resolution must say the literal token \`default\` is passed to the verb`,
      );
      assert.match(
        section,
        /(must not|never) (expand|pre-resolve|resolve)/i,
        `${target.label}: Rubric resolution must forbid pre-resolving the keyword`,
      );
      assert.match(
        section,
        /<ADEV_ROOT>`?-relative path/,
        `${target.label}: Rubric resolution must name the <ADEV_ROOT>-relative path as the thing not to expand to`,
      );
      // The sentence naming what the keyword resolves to must survive — it is
      // a description of the keyword's target, not a --rubric value.
      assert.match(
        section,
        /<ADEV_ROOT>\/skills\/eval\/default-rubric\.yaml/,
        `${target.label}: Rubric resolution must still name the shipped rubric the keyword resolves to`,
      );
    });

    it("(c) no `--rubric` argument anywhere is a default-rubric.yaml path", () => {
      const offenders = rubricArguments(text).filter((a) =>
        /default-rubric\.ya?ml`?$/.test(a),
      );
      assert.deepEqual(
        offenders,
        [],
        `${target.label}: \`--rubric\` must never receive a path to the shipped rubric (found: ${offenders.join(", ")}) — pass the keyword \`default\` instead`,
      );
    });
  });
}
