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
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { computeCommandSha, loadCheck1Gates } from "../../lib/gates/gate-sets.mjs";
import { checkBoundaries } from "../../lib/governance/boundaries.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

/** Repo-root-relative reads, resolved off this file so cwd never matters. */
function repoPath(rel) {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

function readRepoFile(rel) {
  return readFileSync(repoPath(rel), "utf8");
}

/** The CLI entrypoint, for the subprocess cases below. */
const CLI = repoPath("cli/index.mjs");

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

/**
 * Migration Step 2 (Task 18): the two checks whose bodies stop being a prose
 * algorithm a subagent re-implements and become a call to a CLI verb whose
 * evaluator this spec shipped. `kind` flips to `deterministic-check`, so
 * `profile` / `context_pack` — fields that only mean anything to the
 * subagent-review dispatch path — must be gone from both registries.
 *
 * `envelope` lists every field name and gate-level reason the verb can emit
 * today; a body that omits one leaves the agent guessing at a real output.
 */
const VERB_CHECKS = [
  {
    id: "validate.check-8-boundaries",
    body: "skills/validate/checks/validate.check-8-boundaries.md",
    // Unchanged from the pre-migration registry: a boundary violation is a
    // blocker, and the flip is about HOW the check runs, not how hard it bites.
    severity: "error",
    verb: /adev boundaries check --json/,
    envelope: [
      "verdict",
      "reason",
      "findings",
      "disabled",
      "warnings",
      "summary",
      "DISABLED_WITHOUT_REASON",
    ],
  },
  {
    id: "validate.check-9-transition-gates",
    body: "skills/validate/checks/validate.check-9-transition-gates.md",
    severity: "warning",
    verb: /adev gate transitions[^\n]*--json/,
    envelope: [
      "transition",
      "verdict",
      "reason",
      "gates",
      "error",
      "code",
      "no-recorded-outcome",
      "stale-gate-record",
      "no-manifest-stamp",
      "unattested-gate-record",
      "disabled-gate",
    ],
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

    it(`${id} takes tier from the resolved gate set rather than deriving it`, () => {
      // The loader defaults an undeclared tier to `fast`; the body must send
      // the agent to the resolved set for the value, not leave it to guess
      // (an undefined tier makes `reportValidator` reject the whole event).
      const text = readRepoFile(body);
      assert.match(text, /\|\s*`tier`\s*\|[^|\n]*resolved/);
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
    for (const { id, severity } of [...CHECK_BODIES, ...VERB_CHECKS]) {
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
      // Fixture maintenance (Task 10): gates.yaml is a MARKED registry and the
      // consumer view fails closed without a `materialized_at` marker. Seeded
      // already-materialized; this test is about command_sha stamping.
      writeFixture(
        dir,
        ".context-index/governance/gates.yaml",
        stampMarker('gates:\n  - id: unit\n    command: ["npm", "test"]\n    tier: fast\n', "2026-08-15T00:00:00Z"),
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

  it("defaults a tier-less gate to `fast` so the emission is not rejected", () => {
    // `reportValidator` throws EVENT_SCHEMA_INVALID on a non-string tier
    // (lib/lifecycle-state.mjs), and `mergeGates` copies `tier` only when the
    // entry declares one. Without a default here, ONE tier-less gate in a
    // project's gates.yaml kills Check 1's whole `--gate-outcomes` emission —
    // the exact failure this check exists to prevent. The default belongs on
    // the resolved set, not in skill prose, because the body is told to take
    // the field verbatim.
    const dir = createTempDir();
    try {
      writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: software\n");
      writeFixture(
        dir,
        ".context-index/governance/gates.yaml",
        stampMarker('gates:\n  - id: untiered\n    command: ["npm", "run", "lint"]\n', "2026-08-15T00:00:00Z"),
      );

      const { gates } = loadCheck1Gates(dir, { moduleSlug: "m" });
      const untiered = gates.find((g) => g.id === "untiered");
      assert.ok(untiered, "the fixture gate must reach the merged set");
      assert.equal(untiered.tier, "fast");
      for (const gate of gates) {
        assert.equal(
          typeof gate.tier,
          "string",
          `gate '${gate.id}' must carry a string tier; got ${JSON.stringify(gate.tier)}`,
        );
      }
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("a malformed argv element never aborts the gate loader", () => {
  // `lib/profiles/yaml.mjs` coerces numerics, so `command: ["node", 8080]`
  // reaches the merge as `["node", 8080]`. Before this guard the loader threw
  // INVALID_ARGV out of the stamping loop, which took down BOTH
  // `adev domain load-gates` and `adev gate doctor` — a tool whose entire job
  // is diagnosing malformed gates. A bad element must drop the gate, never the
  // run.
  const BAD_GATES = 'gates:\n  - id: bad\n    command: ["node", 8080]\n  - id: unit\n'
    + '    command: ["npm", "test"]\n    tier: fast\n';

  function seedProject() {
    const dir = createTempDir();
    writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: software\n");
    writeFixture(dir, ".context-index/governance/gates.yaml", stampMarker(BAD_GATES, "2026-08-15T00:00:00Z"));
    return dir;
  }

  it("drops the gate with an INVALID_GATE warning instead of throwing", () => {
    const dir = seedProject();
    try {
      const { gates, warnings } = loadCheck1Gates(dir, { moduleSlug: "m" });
      assert.equal(
        gates.some((g) => g.id === "bad"),
        false,
        "a gate with a non-string argv element must be dropped, like a shell-form command",
      );
      assert.ok(
        warnings.some((w) => w.code === "INVALID_GATE" && /bad/.test(w.message)),
        `expected an INVALID_GATE warning naming the gate; got ${JSON.stringify(warnings)}`,
      );
      assert.ok(
        gates.some((g) => g.id === "unit"),
        "the healthy gates in the same file must still resolve",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("`adev domain load-gates` still exits cleanly", () => {
    const dir = seedProject();
    try {
      const r = spawnSync(
        process.execPath,
        [CLI, "domain", "load-gates", "--module", "m"],
        { cwd: dir, encoding: "utf8" },
      );
      assert.equal(r.status, 0, `expected exit 0; stderr:\n${r.stderr}`);
      assert.doesNotMatch(r.stderr, /INVALID_ARGV|command_sha requires/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("`adev gate doctor --json` still runs its diagnosis", () => {
    const dir = seedProject();
    try {
      const r = spawnSync(process.execPath, [CLI, "gate", "doctor", "--json"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ADEV_GATE_DOCTOR: "" },
      });
      // 0 (clean) or 2 (error-severity finding) are both diagnoses. 1 is the
      // loader crashing, which is what this guards.
      assert.notEqual(r.status, 1, `doctor crashed; stderr:\n${r.stderr}`);
      assert.doesNotMatch(r.stderr, /INVALID_ARGV|command_sha requires/);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("the computeCommandSha recompute contract", () => {
  it("names loadCheck1Gates, not a raw gates.yaml read, as the recompute source", () => {
    // Two of this repo's three gates (`quality-gate`, `integration-test`) come
    // only from the software domain overlay and have NO row in gates.yaml. A
    // Task 7 implementation that follows a "recompute from governance/
    // gates.yaml" instruction literally finds nothing to hash for them and
    // degrades every outcome to `unattested-gate-record`.
    const src = readRepoFile("lib/gates/gate-sets.mjs");
    const jsdoc = src.slice(0, src.indexOf("export function computeCommandSha"));
    assert.ok(
      /recomputes this value (from|via|through) \{?@?link? ?`?loadCheck1Gates/.test(jsdoc)
        || /recomputes this value from `loadCheck1Gates/.test(jsdoc),
      "the computeCommandSha JSDoc must name loadCheck1Gates as the recompute source",
    );
    assert.ok(
      !/recomputes this value from `governance\/gates\.yaml`/.test(jsdoc),
      "the raw gates.yaml is the wrong recompute source — the domain overlay contributes gates",
    );
  });
});

describe("the fail_fast declaration in both registries", () => {
  for (const registry of REGISTRY_FILES) {
    it(`${registry} says what fail_fast on Check 1 actually does`, () => {
      // `shouldSkipDueToFailFast` fires only through an `after` edge and
      // nothing declares `after: [validate.check-1-quality-gates]`, so the
      // field is declarative. The registry must not advertise dispatcher
      // behaviour it does not have.
      const text = readRepoFile(registry);
      assert.ok(
        /declarative/i.test(text),
        `${registry} must state that fail_fast on Check 1 is declarative and that the `
          + "skill's own prose enforces the ordering",
      );
    });
  }
});

describe("Migration Step 2 — checks 8 and 9 become verb calls", () => {
  for (const { id, body, verb, envelope } of VERB_CHECKS) {
    it(`${id} body invokes its verb and dispatches no subagent`, () => {
      const text = readRepoFile(body);
      assert.match(text, verb);
      assert.doesNotMatch(text, INLINE_NODE_RE);
    });

    it(`${id} body names every field its verb emits`, () => {
      const text = readRepoFile(body);
      for (const field of envelope) {
        assert.ok(
          text.includes(field),
          `${body} must tell the agent what to do with \`${field}\`; the verb emits it today`,
        );
      }
    });

    it(`${id} body is not a skill and carries no skill-ext block`, () => {
      // Check bodies under skills/validate/checks/ are prompts, not skills.
      // tests/skills-extension-coverage.test.mjs scopes itself to SKILL.md;
      // adding the block here would be cargo-culting the wrong contract.
      assert.doesNotMatch(readRepoFile(body), /adev skill-ext load/);
    });
  }
});

describe("the kind flip", () => {
  for (const registry of REGISTRY_FILES) {
    for (const { id } of VERB_CHECKS) {
      it(`${registry} declares ${id} as deterministic-check`, () => {
        const doc = parseYaml(readRepoFile(registry));
        const entry = doc.checks.find((c) => c.id === id);
        assert.ok(entry, `${registry} must declare ${id}`);
        assert.equal(entry.kind, "deterministic-check", `${registry} :: ${id}`);
      });

      it(`${registry} drops profile/context_pack from ${id}`, () => {
        const doc = parseYaml(readRepoFile(registry));
        const entry = doc.checks.find((c) => c.id === id);
        assert.ok(entry, `${registry} must declare ${id}`);
        for (const field of ["profile", "context_pack"]) {
          assert.equal(
            field in entry,
            false,
            `${field} only means something on the subagent-review dispatch path; `
              + `${id} in ${registry} no longer takes it`,
          );
        }
      });
    }
  }
});

describe("the no-surface-move invariant", () => {
  // The spec's invariant: this migration changes HOW a check runs, never its
  // identity or where it lives. A renamed id silently unregisters the check
  // (_resolveActorSeverity defaults it to `warning`); a moved body breaks the
  // `plugin:validate/checks/...` prompt path.
  for (const { id, body } of VERB_CHECKS) {
    it(`${id} keeps its identifier in both registries`, () => {
      for (const registry of REGISTRY_FILES) {
        const doc = parseYaml(readRepoFile(registry));
        assert.ok(
          doc.checks.some((c) => c.id === id),
          `${registry} must still declare ${id}`,
        );
      }
    });

    it(`${id} keeps its body under skills/validate/checks/`, () => {
      assert.match(body, /^skills\/validate\/checks\//);
      assert.ok(existsSync(repoPath(body)), `${body} must still exist at that path`);
      for (const registry of REGISTRY_FILES) {
        const doc = parseYaml(readRepoFile(registry));
        const entry = doc.checks.find((c) => c.id === id);
        assert.equal(entry.prompt, `plugin:validate/checks/${id}.md`);
      }
    });
  }
});

describe("check 8 on an empty registry", () => {
  // The migration's risk note, pinned from the correct side: the OUTCOME is
  // unchanged (validation does not start failing), but the VERDICT moves from
  // the old body's PASS to SKIP. A test pinning PASS-preservation would pin the
  // exact behaviour `lib/governance/boundaries.mjs` was written to remove.
  //
  // The "dispatches no subagent" half of the AC is pinned by the `kind`
  // assertion above, which is the only observable that exists: the check body
  // is markdown read by an agent, and no harness in tests/ counts dispatches.
  // Asserting a dispatch counter here would assert against nothing.
  it("SKIPs, never PASSes, when no boundary rules are declared", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, "src/a.mjs", "export const a = 1;\n");
      const result = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      assert.equal(result.verdict, "SKIP");
      assert.match(result.reason, /no boundary rules declared/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("SKIPs with a reason naming the disabled rules when all are switched off", async () => {
    const dir = createTempDir();
    try {
      writeFixture(dir, "src/a.mjs", "export const a = 1;\n");
      writeFixture(
        dir,
        ".context-index/governance/boundaries.yaml",
        "boundaries:\n  - id: off\n    pattern: \"never\"\n    severity: error\n"
          + "    enabled: false\n    disabled_reason: \"pinned by this test\"\n",
      );
      const result = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      assert.equal(result.verdict, "SKIP");
      assert.match(result.reason, /disabled/);
      assert.equal(result.disabled.length, 1);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("the docs name the verbs the checks now call", () => {
  it("docs/cli-reference.md documents all three governance verbs", () => {
    const ref = readRepoFile("docs/cli-reference.md");
    for (const verb of [
      "adev boundaries check",
      "adev gate transitions",
      "adev governance materialize",
    ]) {
      assert.ok(
        new RegExp(verb.replace(/ /g, "\\s+")).test(ref),
        `docs/cli-reference.md must document \`${verb}\``,
      );
    }
  });

  it("docs/governance.md documents the materialized_at marker and its bounded set", () => {
    const doc = readRepoFile("docs/governance.md");
    assert.ok(/materialized_at/.test(doc), "the marker key must be documented by name");
    assert.ok(
      /write-once/i.test(doc),
      "the write-once semantics are the whole point of the marker",
    );
    for (const file of ["review.yaml", "diagnostics.yaml", "gates.yaml"]) {
      assert.ok(
        new RegExp(`\`${file.replace(".", "\\.")}\``).test(doc),
        `the marked set is bounded and ${file} is in it — the docs must say so`,
      );
    }
    assert.ok(
      /boundaries\.yaml[^\n]*exempt|exempt[^\n]*boundaries\.yaml/i.test(doc),
      "validate.yaml and boundaries.yaml are EXEMPT (DDR-1); the docs must say which files are not marked",
    );
  });
});
