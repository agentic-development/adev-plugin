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
        /<ADEV_ROOT>\/skills\/eval\/(?:references\/)?default-rubric\.yaml/,
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

/* ------------------------------------------------------------------------ *
 * Repo-wide no-live-emitter sweep.
 *
 * Task 2 fixed the three eval SKILL.md files; this sweep proves no OTHER
 * shipped surface still hands the verb a path to the shipped rubric. Any
 * such emitter reproduces the bug wherever an agent copies it — the
 * docs/cli-reference.md examples did exactly that, and CLAUDE.md's Context
 * Routing table names that page as the authority an agent reads instead of
 * reverse-engineering the signature from source.
 *
 * SCOPE — deliberately bounded to skills/, providers/ and docs/.
 * `.context-index/` is EXCLUDED: it archives review, validate and spec
 * artifacts that necessarily quote the forbidden pattern in order to
 * describe it (the acceptance criterion for this very sweep quotes it), so
 * an unbounded "nowhere in the repository" check would fail on the document
 * that states it. A criterion that cannot be discharged is not a criterion.
 *
 * PREDICATE — the argument's final PATH COMPONENT, not an exact string, so a
 * future absolute plugin-cache path
 * (/…/agentic-development/adev/<v>/skills/eval/default-rubric.yaml) is caught
 * by the same rule as the repo-relative one. Both `--rubric <v>` and
 * `--rubric=<v>` forms are matched.
 * ------------------------------------------------------------------------ */

const SWEEP_DIRS = ["skills", "providers", "docs"];

/**
 * Extensions skipped as binary or otherwise incapable of carrying a shell
 * invocation. Everything else (md, mjs, yaml, json, txt, sh, …) is read.
 */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
  ".zip", ".gz", ".tgz", ".woff", ".woff2", ".ttf", ".otf",
  ".eot", ".mp4", ".mov", ".wasm",
]);

/** Recursively collect text files under `dir` (absolute paths). */
function collectFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    const ext = dot === -1 ? "" : entry.name.slice(dot).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;
    acc.push(full);
  }
  return acc;
}

/** Strip markup/punctuation an argument may be wrapped in within prose. */
function unwrapArgument(raw) {
  return raw.replace(/^[`'"(\[]+/, "").replace(/[`'"),\].;:]+$/, "");
}

/** True when the argument's final path component names the shipped rubric. */
function namesShippedRubric(value) {
  const component = unwrapArgument(value).split("/").pop();
  return component === "default-rubric.yaml" || component === "default-rubric.yml";
}

/** Every `--rubric <v>` / `--rubric=<v>` emitter naming the shipped rubric. */
function sweepEmitters() {
  const hits = [];
  for (const dirName of SWEEP_DIRS) {
    for (const file of collectFiles(join(PLUGIN_ROOT, dirName))) {
      const label = file.slice(PLUGIN_ROOT.length + 1);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/--rubric(?:[ \t]+|=)(\S+)/g)) {
          if (namesShippedRubric(m[1])) {
            hits.push(`${label}:${i + 1}: ${line.trim()}`);
          }
        }
      });
    }
  }
  return hits;
}

describe("eval rubric keyword emission — repo-wide no-live-emitter sweep", () => {
  it("sweeps a non-empty set of files under skills/, providers/ and docs/", () => {
    // Guards the sweep itself: a walker that silently found nothing would
    // report zero emitters and look green.
    for (const dirName of SWEEP_DIRS) {
      const count = collectFiles(join(PLUGIN_ROOT, dirName)).length;
      assert.ok(count > 0, `sweep found no files under ${dirName}/ — walker is broken`);
    }
  });

  it("catches both the repo-relative and the absolute plugin-cache form", () => {
    // The predicate must bite on a path component, not an exact string.
    assert.equal(namesShippedRubric("skills/eval/default-rubric.yaml"), true);
    assert.equal(
      namesShippedRubric(
        "/Users/x/.claude/plugins/cache/agentic-development/adev/0.28.0/skills/eval/default-rubric.yaml",
      ),
      true,
    );
    assert.equal(namesShippedRubric("`skills/eval/default-rubric.yaml`"), true);
    assert.equal(namesShippedRubric("default"), false);
  });

  it("no file under skills/, providers/ or docs/ passes `--rubric <shipped rubric path>`", () => {
    const hits = sweepEmitters();
    assert.deepEqual(
      hits,
      [],
      `\`--rubric\` must receive the keyword \`default\`, never a path to the shipped ` +
        `rubric. Offending emitters (${hits.length}):\n${hits.join("\n")}`,
    );
  });
});
