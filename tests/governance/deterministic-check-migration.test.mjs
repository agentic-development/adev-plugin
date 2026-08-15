/**
 * The deterministic-check migration: validate checks whose bodies are a CLI
 * verb call plus an outcome table, not a subagent judgement.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * Task 6 lands the first of them — Check 1 (quality gates) — as the SOLE
 * sanctioned writer of `gate_outcomes` on a `validator_report`. Task 18 extends
 * this suite with the check 8 / check 9 bodies and their `kind` flip, so the
 * per-check assertions below are driven from `CHECK_BODIES` / `REGISTRY_FILES`
 * rather than hardcoded per test.
 *
 * Why a markdown-shaped test suite at all: the constitution forbids inline Node
 * in a check body, so "how does the body compute a SHA-256 of resolved argv" is
 * answerable only by "it doesn't — the loader verb hands it one". These tests
 * pin that arrangement from both ends: the body names the verb, and
 * `computeCommandSha` produces a value Task 7 can recompute from `gates.yaml`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { computeCommandSha, loadCheck1Gates } from "../../lib/gates/gate-sets.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

/** Repo-root-relative reads, resolved off this file so cwd never matters. */
function repoPath(rel) {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

function readRepoFile(rel) {
  return readFileSync(repoPath(rel), "utf8");
}

/**
 * Both registries that must carry every check row. The starter is what
 * `/adev:init` scaffolds AND what `_resolveActorSeverity` reads at event-write
 * time; the project file is what `loadValidateConfig` dispatches from. A row in
 * only one of them is a half-registered check.
 */
const REGISTRY_FILES = [
  "templates/domains/software/validate.yaml",
  ".context-index/governance/validate.yaml",
];

/**
 * Check bodies migrated to the deterministic shape. Task 18 appends its rows
 * here; every generic assertion below iterates this table.
 *
 * `severity` is the value BOTH registries must declare for that id.
 */
const CHECK_BODIES = [
  {
    id: "validate.check-1-quality-gates",
    body: "skills/validate/checks/validate.check-1-quality-gates.md",
    // Check 1 is fail-fast: a failing quality gate stops validation outright,
    // so its registry severity has to be `error`. `warning` would let a broken
    // build aggregate to PASS_WITH_NOTES.
    severity: "error",
  },
];

const INLINE_NODE_RE = /node\s+(--input-type=module\s+)?-e|Run inline Node/;

describe("deterministic check bodies", () => {
  for (const { id, body } of CHECK_BODIES) {
    it(`${id} body names the gate-outcome writer verb and no inline Node`, () => {
      const text = readRepoFile(body);
      assert.match(text, /adev report --type validator[\s\S]*--gate-outcomes/);
      assert.doesNotMatch(text, INLINE_NODE_RE);
    });

    it(`${id} emits an outcome carrying a command_sha`, () => {
      assert.match(readRepoFile(body), /command_sha/);
    });

    it(`${id} documents the @<path> form of --gate-outcomes`, () => {
      // Task 5 shipped `@path` precisely because a non-trivial gate set blows
      // past argv length limits; a body that only ever documents the literal
      // form teaches the failing idiom.
      assert.match(readRepoFile(body), /--gate-outcomes\s+@/);
    });

    it(`${id} emits its validator_report exactly once`, () => {
      const text = readRepoFile(body);
      // Guard against a future edit turning this into a per-gate emission:
      // one gate_outcomes array, one event, or the attestation Task 7 reads
      // back has no single record to anchor on.
      assert.match(text, /exactly one/i);
      const emissions = text.match(/adev report --type validator/g) ?? [];
      assert.equal(
        emissions.length,
        1,
        `${body} must invoke the writer verb once, not per gate; found ${emissions.length}`,
      );
    });
  }
});

describe("the validate registries", () => {
  for (const registry of REGISTRY_FILES) {
    for (const { id, severity } of CHECK_BODIES) {
      it(`${registry} registers ${id}`, () => {
        const doc = parseYaml(readRepoFile(registry));
        assert.ok(
          doc.checks.some((c) => c.id === id),
          `${registry} must declare ${id}`,
        );
      });

      it(`${registry} declares ${id} at severity '${severity}'`, () => {
        const doc = parseYaml(readRepoFile(registry));
        const entry = doc.checks.find((c) => c.id === id);
        assert.ok(entry, `${registry} must declare ${id}`);
        assert.equal(
          entry.severity,
          severity,
          `${id} in ${registry} must be severity '${severity}' — an unregistered or `
            + "warning-severity row is what produced UNKNOWN_VALIDATOR_DEFAULTED",
        );
      });
    }
  }
});

describe("skills/validate/SKILL.md", () => {
  // SKILL.md is ~40 KB; `assert.match` would dump the whole file into the
  // failure output, so these assert on a boolean with a message instead.
  it("names Check 1 the sole sanctioned writer of gate_outcomes", () => {
    const skill = readRepoFile("skills/validate/SKILL.md");
    assert.ok(
      /only sanctioned writer of `gate_outcomes`/.test(skill),
      "the normative sole-writer sentence must be in the skill, not only in the check body",
    );
  });

  it("no longer claims Check 1 has no registry entry", () => {
    const skill = readRepoFile("skills/validate/SKILL.md");
    assert.ok(
      !/Check 1 \(quality gates\) is not in this registry/.test(skill),
      "Task 6 registered Check 1; prose asserting otherwise sends emitters back to the default",
    );
  });
});

describe("computeCommandSha", () => {
  it("hashes JSON.stringify(argv) — the contract Task 7 recomputes against", () => {
    // Hardcoded digest, deliberately. This is a CROSS-TASK contract: Task 7
    // recomputes the same value from gates.yaml to decide whether a recorded
    // outcome attests to the gate that is declared today. Derive it here from
    // the implementation and the two sides can drift while both stay green.
    assert.equal(
      computeCommandSha(["npm", "test"]),
      "527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4",
    );
  });

  it("distinguishes argv element boundaries", () => {
    assert.notEqual(computeCommandSha(["npm test"]), computeCommandSha(["npm", "test"]));
  });

  it("refuses a non-argv command instead of hashing a string", () => {
    assert.throws(() => computeCommandSha("npm test"), /argv/i);
  });
});

describe("the resolved gate set carries its own command_sha", () => {
  it("stamps every merged gate, so Check 1 needs no second call", () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: software\n");
      writeFixture(
        dir,
        ".context-index/governance/gates.yaml",
        'gates:\n  - id: unit\n    command: ["npm", "test"]\n    tier: fast\n',
      );

      const { gates } = loadCheck1Gates(dir, { moduleSlug: "m" });
      for (const gate of gates) {
        assert.equal(
          gate.command_sha,
          computeCommandSha(gate.command),
          `gate '${gate.id}' must carry the sha of its own resolved argv`,
        );
      }
      const unit = gates.find((g) => g.id === "unit");
      assert.ok(unit, "the fixture gate must reach the merged set");
      assert.equal(
        unit.command_sha,
        "527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});
