/**
 * Configurable Governance Eval — deterministic integration tests.
 *
 * Runs the real reviewer + validate registry loaders (and the quality-gate
 * runner) against an isolated fixture project built by setup-fixture.sh.
 * Each test spins up a clean temp repo — no dependence on the parent
 * plugin's .context-index/ state.
 *
 * This eval proves the configurable-governance code works end-to-end in a
 * consumer project that has "installed" the plugin and is using:
 *   - bundled profile defaults + project overlay
 *   - governance/review.yaml with a disabled default, a severity override,
 *     and a project-triggered reviewer
 *   - governance/validate.yaml with a disabled default, a project
 *     quality-gate (argv-form), and a project subagent-review ordered via
 *     `after:`
 *   - a set of malicious/invalid configs that must fail load with specific
 *     error codes (path traversal, cross-plugin refs, shell-form command,
 *     argv interpolation, context-pack denylist, implementer posture,
 *     project-registered deterministic-check)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  mkdtempSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  loadProfiles,
  resolveProfile,
  getEffectivePosture,
} from "../../../lib/profiles/index.mjs";
import * as claudeCode from "../../../lib/profiles/adapters/claude-code.mjs";
import { loadReviewConfig, shouldDispatch, applySeverityCap, computeVerdict } from "../../../lib/governance/review-config.mjs";
import { stampMarker } from "../../../lib/governance/registry-marker.mjs";
import { loadValidateConfig, shouldSkipDueToFailFast } from "../../../lib/governance/validate-config.mjs";
import { runQualityGate } from "../../../lib/governance/quality-gate.mjs";
import { renderPack } from "../../../lib/governance/context-pack.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP_SCRIPT = join(__dirname, "setup-fixture.sh");
const BASE_FIXTURE = join(__dirname, "fixture-base");

/**
 * Clone the fixture into a fresh temp directory per test suite so mutations
 * cannot leak across suites.
 */
function cloneFixtureToCleanDir() {
  const dest = mkdtempSync(join(tmpdir(), "adev-cg-eval-"));
  cpSync(BASE_FIXTURE, dest, { recursive: true });
  return dest;
}

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

function useNegativeReviewConfig(repo, variant) {
  const src = join(repo, ".context-index", "negative", `${variant}.yaml`);
  const dest = join(repo, ".context-index", "governance", "review.yaml");
  // Fixture maintenance (Task 10): review.yaml is a MARKED registry, so
  // `loadReviewConfig` fails closed before it can reach the validation each
  // negative variant is written to trip. Stamping on the way in restores the
  // ONLY thing these tests are about — the rejection code. Nothing is relaxed:
  // an unmarked file still raises, as its own test in
  // tests/governance/registry-marker.test.mjs asserts.
  writeFileSync(dest, stampMarker(readFileSync(src, "utf8"), "2026-08-15T00:00:00Z"));
}

function useNegativeValidateConfig(repo, variant) {
  const src = join(repo, ".context-index", "negative", `${variant}.yaml`);
  const dest = join(repo, ".context-index", "governance", "validate.yaml");
  cpSync(src, dest);
}

describe("Configurable Governance Eval — Fixture Bootstrap", () => {
  before(() => {
    if (!existsSync(BASE_FIXTURE)) {
      execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
    }
  });
  // No teardown — fixture persists across the run so tier tests can share it.

  it("fixture ships the expected top-level files", () => {
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/constitution.md")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/manifest.yaml")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/platform-context.yaml")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/profiles.yaml")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/governance/review.yaml")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/governance/validate.yaml")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".env")));
    assert.ok(existsSync(join(BASE_FIXTURE, ".context-index/specs/features/billing/invoice-generation.md")));
  });
});

// =============================================================================
// Profiles — install check
// =============================================================================
describe("Profiles installation (consumer project)", () => {
  let repo;
  before(() => {
    if (!existsSync(BASE_FIXTURE)) execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
    repo = cloneFixtureToCleanDir();
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it("loads bundled defaults + project profile overlay", () => {
    const r = loadProfiles(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    for (const name of ["read-only", "browser-review", "reviewer-fast", "reviewer-capable", "reviewer-reasoning", "implementer"]) {
      assert.ok(r.profiles[name], `bundled '${name}' missing`);
    }
    assert.ok(r.profiles["project-gate-profile"], "project profile was not merged");
    assert.equal(r.profiles["project-gate-profile"].env.allow.required[0], "API_TOKEN");
  });

  it("resolveProfile for project-gate-profile reads .env and filters allowlist", () => {
    const { profiles } = loadProfiles(repo);
    const r = resolveProfile("project-gate-profile", {
      profiles,
      consumerRepoRoot: repo,
      adapter: claudeCode,
      mcpAvailable: new Set(),
    });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    assert.equal(r.env.API_TOKEN, "this-is-a-long-api-token-value-abc123");
    // DEBUG_FLAG=on is optional AND below the 8-char redaction floor.
    assert.equal(r.env.DEBUG_FLAG, "on");
    assert.ok(r.redactionSet.has("this-is-a-long-api-token-value-abc123"));
    assert.ok(!r.redactionSet.has("on"), "sub-minimum values must not enter redactionSet");
    // Contributing-file audit records the .env path per key.
    assert.ok(r.contributing.API_TOKEN.endsWith(".env"));
  });

  it("posture of reviewer-fast is read-only-compatible", () => {
    const { profiles } = loadProfiles(repo);
    const posture = getEffectivePosture("reviewer-fast", profiles);
    assert.equal(posture.posture.fsWrite, "deny");
    assert.equal(posture.posture.network, "deny");
  });
});

// =============================================================================
// Review registry — install + run
// =============================================================================
describe("/adev:review-specs install + run", () => {
  let repo;
  before(() => {
    if (!existsSync(BASE_FIXTURE)) execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
    repo = cloneFixtureToCleanDir();
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  // INVERTED by explicit-governance-registries Task 11. This case used to assert
  // that a project with NO `governance/review.yaml` still ran the three bundled
  // reviewers, merged in at run time behind its back. That composition is gone:
  // the project file is the whole reviewer set, so a project that declares none
  // runs none. The old expectation is now the defect the spec exists to remove —
  // a reviewer dispatching without a row in the file that is supposed to declare
  // it — so the assertion is flipped rather than relaxed.
  it("zero-config load (no project review.yaml) runs NO reviewers", () => {
    const clean = mkdtempSync(join(tmpdir(), "adev-cg-zc-"));
    try {
      // Only the context-index scaffold — no governance/review.yaml.
      execSync(`mkdir -p ${clean}/.context-index`);
      writeFileSync(join(clean, ".context-index", "constitution.md"), "# stub");
      writeFileSync(join(clean, ".context-index", "manifest.yaml"), "project: zc");
      const r = loadReviewConfig(clean);
      assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
      assert.deepEqual(r.reviewers.map((x) => x.id), []);
    } finally {
      rmSync(clean, { recursive: true, force: true });
    }
  });

  // Also adjusted for the single-source model. `consistency-analyzer` is no
  // longer DROPPED when switched off — Invariant 5 keeps a disabled row visible
  // with its reason, so a reviewer the project deliberately turned off reads
  // differently from one it never declared. And `BUNDLED_DEFAULT_OVERRIDE` can
  // no longer be raised: there is nothing to override, because the file's rows
  // are whole reviewers rather than patches over a bundled default.
  it("the project registry disables consistency-analyzer and caps security-reviewer severity", () => {
    const r = loadReviewConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const off = r.reviewers.find((x) => x.id === "consistency-analyzer");
    assert.ok(off, "a disabled reviewer must stay visible (Invariant 5)");
    assert.equal(off.enabled, false);
    assert.equal(typeof off.disabled_reason, "string");
    assert.equal(
      shouldDispatch(off, { targetSpecPath: "specs/features/billing/x.md", specContent: "" }).dispatch,
      false,
      "visible must never mean runnable",
    );
    assert.ok(r.disabled.some((x) => x.id === "consistency-analyzer"));

    const sec = r.reviewers.find((x) => x.id === "security-reviewer");
    assert.equal(sec.severity_cap, "warning");
    assert.equal(sec.enabled, true);
    // The old BUNDLED_DEFAULT_OVERRIDE code is dead: there is no bundled layer
    // left to override (single-source model). Its successor, REVIEWER_OVERRIDE,
    // fires only when `collectReviewers` sees the SAME id declared twice within
    // this project's own review.yaml (lib/governance/review-config.mjs) — a
    // different mechanism than a project-vs-domain-default collision. This
    // fixture declares `security-reviewer` exactly once, so no override warning
    // of either name fires here.
    assert.equal(
      hasCode(r.warnings, "REVIEWER_OVERRIDE"),
      false,
      "single declaration of security-reviewer must not trip the duplicate-id warning",
    );
  });

  it("project-triggered reviewer dispatches on a matching billing spec path", () => {
    const r = loadReviewConfig(repo);
    const billing = r.reviewers.find((x) => x.id === "project.billing-domain");
    assert.ok(billing, "project reviewer missing from merged registry");
    const dispatch = shouldDispatch(billing, {
      targetSpecPath: "specs/features/billing/invoice-generation.md",
      specContent: "generates an invoice PDF",
    });
    assert.equal(dispatch.dispatch, true);
    // And does NOT dispatch for an unrelated spec.
    const skip = shouldDispatch(billing, { targetSpecPath: "specs/features/ui/header.md", specContent: "header component" });
    assert.equal(skip.dispatch, false);
  });

  it("severity cap clamps a blocker finding to warning when cap=warning", () => {
    const r = loadReviewConfig(repo);
    const sec = r.reviewers.find((x) => x.id === "security-reviewer");
    const clamped = applySeverityCap({ severity: "blocker", message: "SEC-1" }, sec);
    assert.equal(clamped.severity, "warning");
    assert.match(clamped.message, /capped from blocker to warning/);
  });

  it("verdict consolidation honors verdict_rules from the registry", () => {
    const r = loadReviewConfig(repo);
    assert.equal(computeVerdict([], r.verdictRules), "PASS");
    assert.equal(computeVerdict([{ severity: "warning" }], r.verdictRules), "PASS_WITH_NOTES");
    assert.equal(computeVerdict([{ severity: "blocker" }], r.verdictRules), "BLOCK");
  });

  it("context pack renders billing charter verbatim inside a nonce fence", () => {
    const r = loadReviewConfig(repo);
    const render = renderPack("base", r.contextPacks, { repoRoot: repo });
    assert.equal(render.errors.length, 0, JSON.stringify(render.errors, null, 2));
    assert.match(
      render.rendered,
      new RegExp(`<<<ADEV-PACK-${render.nonce} path="[^"]*charter\\.md">>>`)
    );
    assert.match(render.rendered, /Billing Feature Charter/);
  });
});

// =============================================================================
// Review registry — negative scenarios (must fail load closed)
// =============================================================================
describe("/adev:review-specs install rejects unsafe configs", () => {
  let repo;
  before(() => {
    if (!existsSync(BASE_FIXTURE)) execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
  });

  for (const { variant, expectedCode, description } of [
    { variant: "traversal", expectedCode: "PATH_DOT_DOT", description: "rejects relative prompt path that escapes .context-index/" },
    { variant: "implementer-reviewer", expectedCode: "REVIEWER_PROFILE_POSTURE", description: "rejects a reviewer referencing the implementer profile" },
    { variant: "cross-plugin", expectedCode: "CROSS_PLUGIN_REF", description: "rejects plugin:<other>:... cross-plugin reference (v2 deferral)" },
  ]) {
    it(description, () => {
      const clone = cloneFixtureToCleanDir();
      try {
        useNegativeReviewConfig(clone, variant);
        const r = loadReviewConfig(clone);
        assert.ok(
          hasCode(r.errors, expectedCode),
          `expected error code '${expectedCode}' — got: ${JSON.stringify(r.errors, null, 2)}`
        );
      } finally {
        rmSync(clone, { recursive: true, force: true });
      }
    });
  }

  it("rejects a context-pack glob on the denylist (.env*)", () => {
    const clone = cloneFixtureToCleanDir();
    try {
      useNegativeReviewConfig(clone, "secret-pack");
      const r = loadReviewConfig(clone);
      // loadReviewConfig merges packs but renderPack is where denylist triggers.
      const render = renderPack("leaky", r.contextPacks, { repoRoot: clone });
      assert.ok(hasCode(render.errors, "CONTEXT_PACK_DENYLIST"));
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// Validate registry — install + run
// =============================================================================
describe("/adev:validate install + run", () => {
  let repo;
  before(() => {
    if (!existsSync(BASE_FIXTURE)) execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
    repo = cloneFixtureToCleanDir();
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  // The fixture ships a *pre-restructure* single-source registry (it lists Checks
  // 1.5 and 2-12 plus three project additions) — i.e. a consumer project that
  // scaffolded before check-set-restructure.spec.md landed and has not migrated.
  // That spec relocated six of those checks out of validate, and its Behavior 11
  // says a project-authored reference to a relocated ID WARNs with
  // RESURRECTED_CHECK_ID and skips the entry. So this eval asserts the
  // post-restructure contract: surviving checks load, relocated ones do not, and
  // each relocated one is reported rather than silently dropped.
  //
  // The pre-restructure expectation ("Check 10 loads as a disabled entry") was
  // retired by that spec on purpose — line 95: the earlier
  // configurable-checks.spec.md AC "presumes Check 10 is in the registry — this
  // refactor removes it. The earlier spec's AC is honored historically". See also
  // its System Constitution Reference (this refactor "explicitly invalidates
  // assumptions in configurable-checks.spec.md's acceptance criterion referencing
  // validate.check-10-platform-drift").
  //
  // The `enabled: false` -> SKIPPED-DISABLED entry shape is still live behavior
  // and is covered in the default tier by
  // tests/governance/validate-config.test.mjs ("enabled: false surfaces as
  // SKIPPED-DISABLED entry without running").
  it("loads the surviving checks + 3 project checks, skipping relocated IDs", () => {
    const r = loadValidateConfig(repo);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    const ids = r.checks.map((c) => c.id);

    // Set-equality on the surviving validate.* inventory, so a future relocation
    // fails with a readable diff rather than an off-by-one on a bare count.
    // check-set-restructure.spec.md AC: the surviving IDs are 1.5, 2, 4, and
    // optionally 8 and 9 when governance is configured.
    //
    // check-11 is listed in that spec's REMOVED catalog, but it is deliberately
    // NOT in the loader's rejection set: Behavior 11 is the normative loader
    // contract and enumerates exactly seven relocated IDs, omitting check-11 —
    // because its logic is "preserved in skills/validate/SKILL.md as a
    // conditional dispatch" rather than re-homed to another skill. So the ID
    // stays loadable and a stale consumer config listing it still resolves.
    // Do NOT "fix" this by adding check-11 to REMOVED_CHECK_IDS.
    assert.deepEqual(
      ids.filter((id) => id.startsWith("validate.")).sort(),
      [
        "validate.check-1.5-source-manifest",
        "validate.check-11-visual-verification",
        "validate.check-2-spec-compliance",
        "validate.check-4-constitution",
        "validate.check-8-boundaries",
        "validate.check-9-transition-gates",
      ],
    );

    // Relocated checks must NOT load, and each must be reported (never silently
    // dropped). These are exactly the IDs enumerated in Behavior 11.
    const relocated = [
      "validate.check-3-charter-consistency",
      "validate.check-5-adrs",
      "validate.check-6-cross-cutting",
      "validate.check-7-specialist-review",
      "validate.check-10-platform-drift",
      "validate.check-12-heuristic-extraction",
    ];
    for (const id of relocated) {
      assert.ok(!ids.includes(id), `relocated check '${id}' leaked into the registry`);
      assert.ok(
        r.warnings.some((w) => w.code === "RESURRECTED_CHECK_ID" && w.message.includes(id)),
        `expected RESURRECTED_CHECK_ID warning naming '${id}'`,
      );
    }
    assert.equal(
      r.warnings.filter((w) => w.code === "RESURRECTED_CHECK_ID").length,
      relocated.length,
    );

    // Project additions are unaffected by the restructure.
    assert.ok(ids.includes("project.npm-test"));
    assert.ok(ids.includes("project.billing-domain-rules"));
    assert.ok(ids.includes("project.adoption-metric"));
  });

  it("topologically orders project.billing-domain-rules after validate.check-2-spec-compliance", () => {
    const r = loadValidateConfig(repo);
    const ids = r.checks.map((c) => c.id);
    const idxParent = ids.indexOf("validate.check-2-spec-compliance");
    const idxChild = ids.indexOf("project.billing-domain-rules");
    assert.ok(idxParent < idxChild, `expected child after parent — got idx ${idxParent} vs ${idxChild}`);
  });

  it("fail-fast chain: disabled predecessor does not block the child", () => {
    const r = loadValidateConfig(repo);
    const child = r.checks.find((c) => c.id === "project.billing-domain-rules");
    const prior = [
      { id: "validate.check-2-spec-compliance", status: "PASS", severity: "error", fail_fast: false },
    ];
    const decision = shouldSkipDueToFailFast(child, prior);
    assert.equal(decision.skip, false);
  });

  it("actually RUNS the project quality-gate via runQualityGate (argv form, exit 0)", async () => {
    const r = loadValidateConfig(repo);
    const gate = r.checks.find((c) => c.id === "project.npm-test");
    assert.ok(gate);
    assert.equal(gate.kind, "quality-gate");
    assert.ok(Array.isArray(gate.command));
    const profileResult = resolveProfile(gate.profile, {
      profiles: r.profiles,
      consumerRepoRoot: repo,
      adapter: claudeCode,
      mcpAvailable: new Set(),
    });
    assert.equal(profileResult.errors.length, 0, JSON.stringify(profileResult.errors, null, 2));
    const gateResult = await runQualityGate(gate, {
      env: profileResult.env,
      redactor: profileResult.redactor,
      cwd: repo,
      parentEnv: { PATH: process.env.PATH ?? "/usr/bin", LD_PRELOAD: "/tmp/evil.so" },
    });
    assert.equal(gateResult.status, "PASS");
    assert.equal(gateResult.exitCode, 0);
    assert.match(gateResult.redactedStdout, /npm-test-stub/);
    // LD_PRELOAD in parent must NOT appear in the subprocess env (the stub only echoes its args, so this checks the env-isolation path indirectly via buildEnv unit tests; here we just assert the gate completes cleanly without inheritance leak).
  });

  it("quality-gate redacts long env values in stdout/stderr", async () => {
    const r = loadValidateConfig(repo);
    const profileResult = resolveProfile("project-gate-profile", {
      profiles: r.profiles,
      consumerRepoRoot: repo,
      adapter: claudeCode,
      mcpAvailable: new Set(),
    });
    // Synthesize a gate that emits the secret via a sh -c argv — argv is static, no interpolation.
    const dynamicGate = {
      id: "synthetic.echo-secret",
      command: ["sh", "-c", "echo value=this-is-a-long-api-token-value-abc123; echo err=this-is-a-long-api-token-value-abc123 >&2"],
    };
    const gr = await runQualityGate(dynamicGate, {
      env: profileResult.env,
      redactor: profileResult.redactor,
      cwd: repo,
      parentEnv: { PATH: process.env.PATH ?? "/usr/bin" },
    });
    assert.equal(gr.status, "PASS");
    assert.match(gr.redactedStdout, /<REDACTED:API_TOKEN>/);
    assert.match(gr.redactedStderr, /<REDACTED:API_TOKEN>/);
    assert.ok(!gr.redactedStdout.includes("this-is-a-long-api-token-value-abc123"));
    assert.ok(!gr.redactedStderr.includes("this-is-a-long-api-token-value-abc123"));
  });
});

// =============================================================================
// Validate registry — negative scenarios
// =============================================================================
describe("/adev:validate install rejects unsafe configs", () => {
  before(() => {
    if (!existsSync(BASE_FIXTURE)) execSync(`bash ${SETUP_SCRIPT} ${BASE_FIXTURE}`, { stdio: "pipe" });
  });

  for (const { variant, expectedCode, description } of [
    { variant: "shell-gate", expectedCode: "QUALITY_GATE_COMMAND_SHELL", description: "rejects string-form command (shell-injection posture)" },
    { variant: "interpolation-gate", expectedCode: "QUALITY_GATE_INTERPOLATION", description: "rejects argv interpolation ({{ spec.slug }})" },
    { variant: "project-deterministic", expectedCode: "DETERMINISTIC_PROJECT", description: "rejects project-registered deterministic-check" },
  ]) {
    it(description, () => {
      const clone = cloneFixtureToCleanDir();
      try {
        useNegativeValidateConfig(clone, variant);
        const r = loadValidateConfig(clone);
        assert.ok(
          hasCode(r.errors, expectedCode),
          `expected '${expectedCode}' — got: ${JSON.stringify(r.errors, null, 2)}`
        );
      } finally {
        rmSync(clone, { recursive: true, force: true });
      }
    });
  }
});
