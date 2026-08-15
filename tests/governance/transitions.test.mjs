/**
 * Task 7 — `evaluateTransitions` / `adev gate transitions`.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * The transition comparator answers one question: for the transition named in
 * `governance/gates.yaml`, did every `required_gates` id record a FRESH,
 * ATTESTED, PASSING outcome on the spec's lifecycle log? It answers that
 * question from recorded history alone — it never executes a gate, and it never
 * evaluates a workflow precondition (that is `adev gate require`).
 *
 * Every fixture here is seeded the way production resolves it: a manifest that
 * selects a custom domain, a domain gates overlay, a project governance file,
 * a spec carrying a real source-manifest frontmatter block, and lifecycle
 * events written through `appendEvent` (the real writer) with explicit `ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateTransitions } from "../../lib/governance/transitions.mjs";
import { computeCommandSha, loadCheck1Gates } from "../../lib/gates/gate-sets.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import { appendEvent } from "../../lib/lifecycle-state.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const GATES_REL = ".context-index/governance/gates.yaml";
const SPEC_REL = ".context-index/specs/features/m/x.spec.md";
const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

const COMPUTED_AT = "2026-03-01T00:00:00.000Z";
const BEFORE = "2026-02-01T00:00:00.000Z";
const AFTER = "2026-04-01T00:00:00.000Z";
const SPEC_SHA = "aaaa1111";

/**
 * Seed a project whose domain contributes no gates of its own, so the resolved
 * gate set is exactly what `gatesYaml` declares.
 *
 * @param {object} [opts]
 * @param {string} [opts.gatesYaml] Full body of governance/gates.yaml.
 * @param {string|null} [opts.sourceManifest] Frontmatter block for the spec, or
 *   null for a spec carrying no source-manifest stamp at all.
 * @returns {string} Project root.
 */
function seedProject({ gatesYaml, sourceManifest = defaultFrontmatter() } = {}) {
  const dir = createTempDir();
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  domain: fixture-domain\n");
  writeFixture(dir, ".context-index/domains/fixture-domain/gates.yaml", "gates: []\n");
  // Fixture maintenance (Task 10): `gates.yaml` is a MARKED registry, so every
  // consumer read now fails closed without a `materialized_at` marker. These
  // fixtures are about attestation, not about materialization, so they are
  // seeded already-materialized — the same state `adev governance materialize`
  // leaves behind. Nothing about what these tests assert has been relaxed.
  if (gatesYaml !== undefined) {
    writeFixture(dir, GATES_REL, stampMarker(gatesYaml, "2026-03-01T00:00:00Z"));
  }
  writeFixture(dir, SPEC_REL, `${sourceManifest ?? ""}# Spec\n`);
  return dir;
}

/** The frontmatter block `extractManifestFromFrontmatter` reads. */
function defaultFrontmatter(sha = SPEC_SHA, computedAt = COMPUTED_AT) {
  return (
    "---\n" +
    "source-manifest:\n" +
    `  sha: ${sha}\n` +
    `  computed-at: "${computedAt}"\n` +
    "  files:\n" +
    "    - lib/foo.mjs\n" +
    "---\n"
  );
}

/**
 * A governance file declaring one argv gate plus a transition requiring it.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.gateIds] Gate ids to declare (each with argv command).
 * @param {string[]} [opts.requiredGates] Ids the transition requires.
 * @param {boolean} [opts.emptyTransitions] Declare `transitions: {}`.
 */
function gatesYaml({
  gateIds = ["test"],
  requiredGates = ["test"],
  emptyTransitions = false,
} = {}) {
  const gates = gateIds
    .map((id) => `  - id: ${id}\n    tier: fast\n    command: ["npm", "run", "${id}"]\n`)
    .join("");
  const transitions = emptyTransitions
    ? "transitions: {}\n"
    : "transitions:\n" +
      "  implement-to-validate:\n" +
      "    required_gates:\n" +
      requiredGates.map((id) => `      - ${id}\n`).join("");
  return `gates:\n${gates}${transitions}`;
}

/** The command_sha Check 1 would record for `gateId` in this project. */
function shaFor(dir, gateId) {
  const gate = loadCheck1Gates(dir, { moduleSlug: "m" }).gates.find((g) => g.id === gateId);
  assert.ok(gate, `fixture must declare gate ${gateId}`);
  return gate.command_sha;
}

/**
 * Append a `validator_report` event carrying `gate_outcomes`.
 *
 * @param {string} dir Project root.
 * @param {object} opts
 * @param {string} opts.ts Explicit event timestamp.
 * @param {object[]} opts.outcomes `gate_outcomes` array.
 * @param {string|undefined} [opts.manifestSha] Payload `manifest_sha`.
 */
function seedOutcome(dir, { ts, outcomes, manifestSha }) {
  const payload = {
    event: "validator_report",
    ts,
    step: "validate",
    validator: "quality-gates",
    severity: "error",
    verdict: "PASS",
    gate_outcomes: outcomes,
  };
  if (manifestSha !== undefined) payload.manifest_sha = manifestSha;
  appendEvent(dir, SPEC_REL, payload);
}

function evaluate(dir, transition = "implement-to-validate") {
  return evaluateTransitions(dir, SPEC_REL, { transition });
}

// ── SKIP, never PASS, when nothing is configured ────────────────────────────

describe("unconfigured transitions", () => {
  it("records SKIP, never PASS, when transitions is empty", () => {
    const dir = seedProject({ gatesYaml: gatesYaml({ emptyTransitions: true }) });
    try {
      const r = evaluate(dir);
      assert.equal(r.verdict, "SKIP");
      assert.notEqual(r.verdict, "PASS");
      assert.match(r.reason, /no transitions configured/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("records SKIP when gates.yaml declares no transitions key at all", () => {
    const dir = seedProject({
      gatesYaml: 'gates:\n  - id: test\n    tier: fast\n    command: ["npm", "test"]\n',
    });
    try {
      const r = evaluate(dir);
      assert.equal(r.verdict, "SKIP");
      assert.match(r.reason, /no transitions configured/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("records SKIP when governance/gates.yaml is absent entirely", () => {
    const dir = seedProject();
    try {
      const r = evaluate(dir);
      assert.equal(r.verdict, "SKIP");
      assert.match(r.reason, /no transitions configured/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("records SKIP when the named transition is not one of the configured ones", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const r = evaluate(dir, "validate-to-merge");
      assert.equal(r.verdict, "SKIP");
      assert.match(r.reason, /validate-to-merge/);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── An unreadable gates.yaml is an ERROR, never a silent SKIP ───────────────

describe("an unreadable governance/gates.yaml", () => {
  it("throws GOVERNANCE_READ_ERROR rather than degrading to SKIP", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    const abs = join(dir, GATES_REL);
    try {
      chmodSync(abs, 0o000);
      assert.throws(
        () => evaluate(dir),
        (err) => {
          assert.equal(err.code, "GOVERNANCE_READ_ERROR");
          assert.match(err.message, /cannot read/i);
          assert.match(err.message, /gates\.yaml/);
          return true;
        },
      );
    } finally {
      chmodSync(abs, 0o644);
      cleanupTempDir(dir);
    }
  });
});

// ── The missing-outcome FAIL ────────────────────────────────────────────────

describe("a required gate with no recorded outcome", () => {
  it("FAILs and names the gate", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const r = evaluate(dir);
      assert.equal(r.verdict, "FAIL");
      assert.match(r.reason, /\btest\b/);
      assert.equal(r.gates.test.verdict, "skip");
      assert.equal(r.gates.test.reason, "no-recorded-outcome");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("FAILs when the latest report carries gate_outcomes that omit the gate", () => {
    const dir = seedProject({ gatesYaml: gatesYaml({ gateIds: ["test", "lint"] }) });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "lint", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "lint") }],
      });
      const r = evaluate(dir);
      assert.equal(r.verdict, "FAIL");
      assert.match(r.reason, /\btest\b/);
      assert.equal(r.gates.test.reason, "no-recorded-outcome");
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Freshness (DDR-2 / CON-1) ───────────────────────────────────────────────

describe("freshness against the spec's source-manifest stamp", () => {
  it("marks an outcome older than computed-at stale", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: BEFORE,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "skip");
      assert.equal(r.gates.test.reason, "stale-gate-record");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("counts an outcome whose ts equals computed-at exactly", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: COMPUTED_AT,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "pass");
      assert.equal(r.verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("marks an outcome stale when manifest_sha differs from the spec's current sha", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: "bbbb2222",
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "skip");
      assert.equal(r.gates.test.reason, "stale-gate-record");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("counts an outcome whose manifest_sha matches and whose ts is fresh", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "pass");
      assert.equal(r.verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("falls back to the ts rule alone when manifest_sha is absent (pre-upgrade record)", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "pass");
      assert.equal(r.verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("refuses to count any outcome when the spec carries no source-manifest stamp", () => {
    // Documented decision: with no computed-at there is nothing to compare
    // against, so freshness cannot be established and the outcome does not
    // count. A PASS here would assert a verification that never happened.
    const dir = seedProject({ gatesYaml: gatesYaml(), sourceManifest: null });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "skip");
      // NOT `stale-gate-record`: "the record is outdated" and "the spec has no
      // anchor to date it against" have opposite remedies.
      assert.equal(r.gates.test.reason, "no-manifest-stamp");
      assert.notEqual(r.gates.test.reason, "stale-gate-record");
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── An unstamped spec SKIPs; it does not FAIL ───────────────────────────────

describe("a spec carrying no source-manifest stamp", () => {
  it("SKIPs the transition when EVERY required gate is blocked only by the missing stamp", () => {
    const dir = seedProject({ gatesYaml: gatesYaml(), sourceManifest: null });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
      });
      const r = evaluate(dir);
      assert.equal(r.verdict, "SKIP");
      assert.notEqual(r.verdict, "FAIL");
      assert.notEqual(r.verdict, "PASS");
      assert.match(r.reason, /source-manifest/i);
      assert.match(r.reason, /adev:implement|re-stamp/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("still FAILs when any required gate is blocked for a reason OTHER than the missing stamp", () => {
    const dir = seedProject({
      gatesYaml: gatesYaml({ gateIds: ["test", "lint"], requiredGates: ["test", "lint"] }),
      sourceManifest: null,
    });
    try {
      // `test` has a (stamp-blocked) record; `lint` has no record at all.
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.reason, "no-manifest-stamp");
      assert.equal(r.gates.lint.reason, "no-recorded-outcome");
      assert.equal(r.verdict, "FAIL");
      assert.match(r.reason, /\blint\b/);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Attestation (DDR-3, partial) ────────────────────────────────────────────

describe("attestation of a recorded outcome", () => {
  it("marks an outcome naming a gate absent from gates.yaml unattested", () => {
    const dir = seedProject({
      gatesYaml: gatesYaml({ gateIds: ["test"], requiredGates: ["ghost"] }),
    });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "ghost", verdict: "pass", tier: "fast", command_sha: "deadbeef" }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.ghost.verdict, "skip");
      assert.equal(r.gates.ghost.reason, "unattested-gate-record");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("marks a mismatched command_sha unattested", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          { id: "test", verdict: "pass", tier: "fast", command_sha: computeCommandSha(["forged"]) },
        ],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "skip");
      assert.equal(r.gates.test.reason, "unattested-gate-record");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("treats an ABSENT command_sha as a pre-upgrade record, not a mismatch", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast" }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "pass");
      assert.notEqual(r.gates.test.reason, "unattested-gate-record");
      assert.equal(r.gates.test.command_attested, false);
      assert.equal(r.verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("reuses computeCommandSha over the resolved argv, matching what Check 1 stamps", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      assert.equal(shaFor(dir, "test"), computeCommandSha(["npm", "run", "test"]));
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          {
            id: "test",
            verdict: "pass",
            tier: "fast",
            command_sha: computeCommandSha(["npm", "run", "test"]),
          },
        ],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "pass");
      assert.equal(r.gates.test.command_attested, true);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── A transition naming a gate the registry does not declare ────────────────

describe("a transition naming an unknown gate", () => {
  it("degrades to a named FAIL rather than crashing", () => {
    // Documented decision: distinct from an OUTCOME naming an absent gate.
    // With no outcome at all, the id is a CONFIG error (hygiene Pass 8 reports
    // it as MISSING_GATE_REF) — this verb reports `unknown-gate` and fails,
    // because a gate that does not exist can never have passed.
    const dir = seedProject({
      gatesYaml: gatesYaml({ gateIds: ["test"], requiredGates: ["nope"] }),
    });
    try {
      const r = evaluate(dir);
      assert.equal(r.verdict, "FAIL");
      assert.match(r.reason, /\bnope\b/);
      assert.equal(r.gates.nope.verdict, "skip");
      assert.equal(r.gates.nope.reason, "unknown-gate");
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── A transition naming a gate the registry DISABLED ────────────────────────

describe("a transition naming a disabled gate", () => {
  it("FAILs naming the gate as disabled, distinct from unknown and from no-outcome", () => {
    // A DISABLED required gate cannot be attested: nothing runs it, so no
    // outcome can exist for it. Counting it as passing would let `enabled:
    // false` silently satisfy a transition — a merge gate that fails open.
    // The reason is its own vocabulary entry because the remedies differ:
    // `unknown-gate` means fix the transition, `no-recorded-outcome` means run
    // the gates, `disabled-gate` means re-enable it or stop requiring it.
    const dir = seedProject({
      gatesYaml:
        "gates:\n" +
        "  - id: test\n    tier: fast\n    command: [\"npm\", \"run\", \"test\"]\n" +
        "    enabled: false\n    disabled_reason: suite quarantined\n" +
        "transitions:\n  implement-to-validate:\n    required_gates:\n      - test\n",
    });
    try {
      const r = evaluate(dir);
      assert.equal(r.verdict, "FAIL");
      assert.match(r.reason, /\btest\b/);
      assert.equal(r.gates.test.verdict, "skip");
      assert.equal(r.gates.test.reason, "disabled-gate");
      assert.equal(r.gates.test.disabled_reason, "suite quarantined");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not let a recorded outcome resurrect a disabled gate", () => {
    const dir = seedProject({
      gatesYaml:
        "gates:\n" +
        "  - id: test\n    tier: fast\n    command: [\"npm\", \"run\", \"test\"]\n" +
        "    enabled: false\n    disabled_reason: suite quarantined\n" +
        "transitions:\n  implement-to-validate:\n    required_gates:\n      - test\n",
    });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        manifestSha: SPEC_SHA,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast" }],
      });
      const r = evaluate(dir);
      assert.equal(r.verdict, "FAIL");
      assert.equal(r.gates.test.reason, "disabled-gate");
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Duplicate ids in one gate_outcomes array ────────────────────────────────

describe("duplicate gate ids with conflicting verdicts", () => {
  it("lets the most pessimistic verdict win", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const sha = shaFor(dir, "test");
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          { id: "test", verdict: "pass", tier: "fast", command_sha: sha },
          { id: "test", verdict: "fail", tier: "fast", command_sha: sha },
        ],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "fail");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("lets a non-pass win regardless of array order", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const sha = shaFor(dir, "test");
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          { id: "test", verdict: "fail", tier: "fast", command_sha: sha },
          { id: "test", verdict: "pass", tier: "fast", command_sha: sha },
        ],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "fail");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("passes only when every duplicate for the id passes", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const sha = shaFor(dir, "test");
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          { id: "test", verdict: "pass", tier: "fast", command_sha: sha },
          { id: "test", verdict: "pass", tier: "fast", command_sha: sha },
        ],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "pass");
      assert.equal(r.verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── "Latest" selection ──────────────────────────────────────────────────────

describe("selecting the latest validator_report carrying gate_outcomes", () => {
  it("takes the LAST such event in append order, not the one with the newest ts", () => {
    // Documented decision: the log is append-only, so append order is its own
    // authority. `ts` is caller-supplied and can be non-monotonic (clock skew,
    // backfilled records); trusting it would let a forged future timestamp
    // resurrect a superseded pass.
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const sha = shaFor(dir, "test");
      seedOutcome(dir, {
        ts: "2026-06-01T00:00:00.000Z",
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: sha }],
        manifestSha: SPEC_SHA,
      });
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "fail", tier: "fast", command_sha: sha }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.gates.test.verdict, "fail");
      assert.equal(r.verdict, "FAIL");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("ignores validator_report events that carry no gate_outcomes", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: SPEC_SHA,
      });
      appendEvent(dir, SPEC_REL, {
        event: "validator_report",
        ts: "2026-05-01T00:00:00.000Z",
        step: "validate",
        validator: "spec-compliance",
        severity: "error",
        verdict: "PASS",
      });
      const r = evaluate(dir);
      assert.equal(r.verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Never executes a gate ───────────────────────────────────────────────────

describe("execution boundary", () => {
  it("never spawns a process", () => {
    // The gate's argv is a command that would leave an observable trace if it
    // ever ran. Execution belongs to Check 1; this verb reads history only.
    const dir = seedProject();
    const marker = join(dir, "SPAWNED");
    writeFixture(
      dir,
      GATES_REL,
      stampMarker(
        "gates:\n" +
          "  - id: test\n    tier: fast\n" +
          `    command: ["sh", "-c", "touch ${marker}"]\n` +
          "transitions:\n  implement-to-validate:\n    required_gates:\n      - test\n",
        "2026-03-01T00:00:00Z",
      ),
    );
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: SPEC_SHA,
      });
      const r = evaluate(dir);
      assert.equal(r.verdict, "PASS");
      assert.equal(existsSync(marker), false, "the gate command must never have been executed");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("carries no process-spawning import at all", () => {
    const src = readFileSync(join(PLUGIN_ROOT, "lib/governance/transitions.mjs"), "utf8");
    assert.equal(
      /from\s+["']node:child_process["']/.test(src),
      false,
      "the comparator must not import a process-spawning module",
    );
    assert.equal(
      /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/.test(src),
      false,
      "the comparator must have no execution capability to lose",
    );
  });
});

// ── CLI surface ─────────────────────────────────────────────────────────────

describe("adev gate transitions", () => {
  function runCli(dir, args) {
    return spawnSync(process.execPath, [CLI, "gate", "transitions", ...args], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
    });
  }

  it("exits 0 with a SKIP envelope when no transitions are configured", () => {
    const dir = seedProject({ gatesYaml: gatesYaml({ emptyTransitions: true }) });
    try {
      const r = runCli(dir, ["--transition", "implement-to-validate", "--spec", SPEC_REL, "--json"]);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.verdict, "SKIP");
      assert.match(out.reason, /no transitions configured/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("exits 2 when a required gate has no fresh, attested, passing outcome", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const r = runCli(dir, ["--transition", "implement-to-validate", "--spec", SPEC_REL, "--json"]);
      assert.equal(r.status, 2);
      const out = JSON.parse(r.stdout);
      assert.equal(out.verdict, "FAIL");
      assert.equal(out.gates.test.reason, "no-recorded-outcome");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("exits 0 on PASS", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [{ id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") }],
        manifestSha: SPEC_SHA,
      });
      const r = runCli(dir, ["--transition", "implement-to-validate", "--spec", SPEC_REL]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /PASS/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("exits 1 when --transition is missing", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const r = runCli(dir, ["--spec", SPEC_REL, "--json"]);
      assert.equal(r.status, 1);
      assert.match(r.stderr + r.stdout, /usage|--transition/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("exits 1 when --spec is missing", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const r = runCli(dir, ["--transition", "implement-to-validate"]);
      assert.equal(r.status, 1);
      assert.match(r.stderr + r.stdout, /usage|--spec/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("exits 1 when the spec does not exist", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const r = runCli(dir, [
        "--transition",
        "implement-to-validate",
        "--spec",
        ".context-index/specs/features/m/missing.spec.md",
      ]);
      assert.equal(r.status, 1);
      assert.match(r.stderr + r.stdout, /spec not found/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("is advertised in the gate help text", () => {
    const r = spawnSync(process.execPath, [CLI, "gate", "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.match(r.stdout + r.stderr, /gate transitions/);
  });
});

// ── The gate set the comparator sees is the gate set Check 1 ran ────────────

describe("gate-set parity with `adev domain load-gates`", () => {
  const MOD_GATE = "mod-gate";

  /**
   * A project that declares the required gate in its own materialized
   * `gates.yaml`, with a module-level domain sitting behind it.
   *
   * Fixture maintenance (Task 11): the gate used to live ONLY in
   * `.context-index/domains/mod-domain/gates.yaml`, so the two views diverged
   * unless the module slug was threaded through, and that divergence was what
   * these tests pinned. The run-time overlay is gone — a domain's gates are
   * adopted into the project file by `adev governance materialize` — so the
   * fixture is seeded in the ADOPTED state. The domain files are kept, now
   * demonstrating that they contribute nothing.
   */
  function seedModuleProject() {
    const dir = createTempDir();
    writeFixture(
      dir,
      ".context-index/manifest.yaml",
      "project:\n  domain: fixture-domain\nmodules:\n  - slug: m\n    domain: mod-domain\n",
    );
    writeFixture(dir, ".context-index/domains/fixture-domain/gates.yaml", "gates: []\n");
    writeFixture(
      dir,
      ".context-index/domains/mod-domain/gates.yaml",
      `gates:\n  - id: ${MOD_GATE}\n    tier: fast\n    command: ["npm", "run", "mod"]\n`,
    );
    writeFixture(
      dir,
      GATES_REL,
      stampMarker(
        "gates:\n" +
          `  - id: ${MOD_GATE}\n    tier: fast\n    command: ["npm", "run", "mod"]\n` +
          "transitions:\n" +
          "  implement-to-validate:\n" +
          "    required_gates:\n" +
          `      - ${MOD_GATE}\n`,
        "2026-03-01T00:00:00Z",
      ),
    );
    writeFixture(dir, SPEC_REL, `${defaultFrontmatter()}# Spec\n`);
    return dir;
  }

  function runCli(dir, args) {
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
    });
  }

  it("resolves the SAME gate set as `adev domain load-gates --module` for a module domain", () => {
    const dir = seedModuleProject();
    try {
      const loaded = runCli(dir, ["domain", "load-gates", "--module", "m"]);
      assert.equal(loaded.status, 0, loaded.stderr);
      const view = JSON.parse(loaded.stdout);
      assert.equal(view.domain.resolved_domain, "mod-domain");
      const gate = view.gates.find((g) => g.id === MOD_GATE);
      assert.ok(gate, "the project's own gates.yaml must declare the required gate");

      // Record the outcome exactly as Check 1 would, using the digest the
      // consumer view published.
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          { id: MOD_GATE, verdict: "pass", tier: gate.tier, command_sha: gate.command_sha },
        ],
        manifestSha: SPEC_SHA,
      });

      const r = runCli(dir, [
        "gate",
        "transitions",
        "--transition",
        "implement-to-validate",
        "--spec",
        SPEC_REL,
        "--module",
        "m",
        "--json",
      ]);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.verdict, "PASS");
      assert.equal(out.gates[MOD_GATE].command_attested, true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("resolves the same gate set WITHOUT --module — the domain no longer decides membership", () => {
    const dir = seedModuleProject();
    try {
      // Fixture maintenance (Task 11) — an INVERSION. This asserted the OLD
      // contract: omitting `--module` resolved the project-level domain, whose
      // overlay contributed nothing, so the comparator degraded the outcome to
      // `unattested-gate-record`. Membership is now the project file's, which
      // no flag can change — so the same omission must be a NON-EVENT. The
      // attestation machinery it exercised is asserted just as strictly, only
      // in the passing direction.
      const loaded = runCli(dir, ["domain", "load-gates", "--module", "m"]);
      const gate = JSON.parse(loaded.stdout).gates.find((g) => g.id === MOD_GATE);
      seedOutcome(dir, {
        ts: AFTER,
        outcomes: [
          { id: MOD_GATE, verdict: "pass", tier: gate.tier, command_sha: gate.command_sha },
        ],
        manifestSha: SPEC_SHA,
      });

      const r = runCli(dir, [
        "gate",
        "transitions",
        "--transition",
        "implement-to-validate",
        "--spec",
        SPEC_REL,
        "--json",
      ]);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.verdict, "PASS");
      assert.equal(out.gates[MOD_GATE].command_attested, true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("prefers --charter over --module, matching resolveDomain's precedence", () => {
    const dir = seedModuleProject();
    try {
      writeFixture(
        dir,
        ".context-index/specs/features/m/charter.md",
        "---\ndomain: mod-domain\n---\n# Charter\n",
      );
      // The module slug is wrong on purpose; the charter must win.
      const r = runCli(dir, [
        "gate",
        "transitions",
        "--transition",
        "implement-to-validate",
        "--spec",
        SPEC_REL,
        "--module",
        "does-not-exist",
        "--charter",
        ".context-index/specs/features/m/charter.md",
        "--json",
      ]);
      assert.equal(r.status, 2, r.stderr);
      // The gate IS declared, so the failure is the missing record and not an
      // unknown gate. Fixture maintenance (Task 11): before, "declared" was a
      // consequence of the charter resolving `mod-domain`; now it is a
      // consequence of the project file, and the assertion holds for the
      // stronger reason. Charter-over-module precedence is still exercised —
      // a bogus module slug must not derail the run.
      assert.equal(JSON.parse(r.stdout).gates[MOD_GATE].reason, "no-recorded-outcome");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("rejects a --charter path that escapes the project root", () => {
    const dir = seedModuleProject();
    try {
      const r = runCli(dir, [
        "gate",
        "transitions",
        "--transition",
        "implement-to-validate",
        "--spec",
        SPEC_REL,
        "--charter",
        "../evil.md",
      ]);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /charter/i);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Project-config errors are diagnosable under --json ──────────────────────

describe("project-config errors on the CLI", () => {
  function runCli(dir, args) {
    return spawnSync(process.execPath, [CLI, "gate", "transitions", ...args], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
    });
  }

  it("emits a machine-readable envelope on exit 1 under --json", () => {
    const dir = seedProject({ gatesYaml: "gates:\n - a\n   - b\n" });
    try {
      const r = runCli(dir, ["--transition", "implement-to-validate", "--spec", SPEC_REL, "--json"]);
      assert.equal(r.status, 1);
      const out = JSON.parse(r.stdout);
      assert.equal(out.transition, "implement-to-validate");
      assert.equal(out.code, "GATES_PARSE_ERROR");
      assert.ok(typeof out.error === "string" && out.error.length > 0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("names the file in the parse error", () => {
    const dir = seedProject({ gatesYaml: "gates:\n - a\n   - b\n" });
    try {
      const r = runCli(dir, ["--transition", "implement-to-validate", "--spec", SPEC_REL]);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /gates\.yaml/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("documents the project-config exit-1 path in --help", () => {
    const r = spawnSync(process.execPath, [CLI, "gate", "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.match(r.stdout, /GATES_PARSE_ERROR/);
    assert.match(r.stdout, /MANIFEST_PARSE_ERROR/);
    assert.match(r.stdout, /GOVERNANCE_READ_ERROR/);
  });

  it("names the same-command gap in the --help attestation caveat", () => {
    const r = spawnSync(process.execPath, [CLI, "gate", "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.match(r.stdout, /same (resolved )?(argv|command)/i);
  });
});

// ── End to end: the REAL producer feeds the REAL consumer ───────────────────

describe("end to end through `adev report --type validator`", () => {
  it("PASSes on an outcome written by the real producer verb", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const outcomes = [
        { id: "test", verdict: "pass", tier: "fast", command_sha: shaFor(dir, "test") },
      ];
      const w = spawnSync(
        process.execPath,
        [
          CLI,
          "report",
          "--type",
          "validator",
          "--spec",
          SPEC_REL,
          "--step",
          "validate",
          "--validator",
          "quality-gates",
          "--verdict",
          "PASS",
          "--gate-outcomes",
          JSON.stringify(outcomes),
          "--manifest-sha",
          SPEC_SHA,
        ],
        { cwd: dir, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(w.status, 0, w.stderr);

      // No hand-built payload anywhere on this path: the shape the consumer
      // reads is the shape `reportValidator` / `validateGateOutcomes` wrote.
      const r = evaluate(dir);
      assert.equal(r.verdict, "PASS", r.reason);
      assert.equal(r.gates.test.verdict, "pass");
      assert.equal(r.gates.test.command_attested, true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("FAILs when the real producer records a failing gate", () => {
    const dir = seedProject({ gatesYaml: gatesYaml() });
    try {
      const outcomes = [
        { id: "test", verdict: "fail", tier: "fast", command_sha: shaFor(dir, "test") },
      ];
      const w = spawnSync(
        process.execPath,
        [
          CLI,
          "report",
          "--type",
          "validator",
          "--spec",
          SPEC_REL,
          "--step",
          "validate",
          "--validator",
          "quality-gates",
          "--verdict",
          "FAIL",
          "--gate-outcomes",
          JSON.stringify(outcomes),
          "--manifest-sha",
          SPEC_SHA,
        ],
        { cwd: dir, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(w.status, 0, w.stderr);

      const r = evaluate(dir);
      assert.equal(r.verdict, "FAIL");
      assert.equal(r.gates.test.reason, "recorded-fail");
    } finally {
      cleanupTempDir(dir);
    }
  });
});
