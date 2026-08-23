// tests/governance/enabled-flag.test.mjs
//
// `enabled` / `disabled_reason` parity across the governance registry loaders.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Behavior 5 / Invariant 5 — "a disabled entry does not run AND the report
// records it as deliberately disabled with its `disabled_reason`, DISTINCT from
// a check that is absent"; Error Cases row `DISABLED_WITHOUT_REASON`
// ("Schema warning; check still disabled").
//
// The four loaders under test and their pre-existing state:
//
//   - `lib/governance/validate-config.mjs` ALREADY honoured `enabled: false`
//     and already kept the entry visible. Those assertions are here as
//     REGRESSION cover, not as new behaviour — nothing about that skip was
//     re-implemented. What is new for validate is `disabled_reason`.
//   - `lib/governance/review-config.mjs` DROPPED a disabled reviewer entirely,
//     which is exactly the absent/disabled conflation Invariant 5 forbids.
//   - `lib/diagnostics/index.mjs` had no `enabled` handling at all.
//   - `lib/governance/boundaries.mjs` dropped disabled rules with no trace, and
//     reported the all-disabled case with the FALSE reason "no boundary rules
//     declared".
//
// ## The shape, asserted uniformly below
//
// A disabled entry stays in its loader's own collection, carrying:
//     { id, enabled: false, disabled_reason: string|null, disabledNote: string }
// and is ALSO reachable through a `disabled` list on the loader's result. That
// is what makes it distinguishable from an absent one: absent means no row,
// disabled means a row that says so. `checkBoundaries` returns findings rather
// than rules, so `disabled` is its only surface.
//
// `review.yaml` and `diagnostics.yaml` are MARKED registries (Tasks 9-12): every
// fixture for them is seeded already-materialized via `stampMarker`, the state
// `adev governance materialize` leaves behind. `validate.yaml` and
// `boundaries.yaml` are marker-EXEMPT (SA-2) and are seeded bare.

import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkBoundaries } from "../../lib/governance/boundaries.mjs";
import { loadReviewConfig, shouldDispatch } from "../../lib/governance/review-config.mjs";
import { loadValidateConfig } from "../../lib/governance/validate-config.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";
import { loadRegistry, runDiagnostics } from "../../lib/diagnostics/index.mjs";
import { loadCheck1Gates } from "../../lib/gates/gate-sets.mjs";
import {
  FIELD_ALLOWLIST,
  validateEntryFields,
} from "../../lib/extensions/governance-registry.mjs";
import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture, readSkillSurface } from "../helpers.mjs";

const MARKED_AT = "2026-08-15T00:00:00Z";

const tempDirs = [];
function tmp() {
  const dir = createTempDir();
  tempDirs.push(dir);
  writeFixture(dir, ".context-index/manifest.yaml", 'project:\n  name: t\n  adev_version: "0.22.0"\n');
  return dir;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function hasCode(list, code) {
  return (list ?? []).some((i) => i.code === code);
}

// ── seeders ─────────────────────────────────────────────────────────────────

/** `validate.yaml` — marker-exempt, written bare. */
function seedChecks(dir, checks) {
  const lines = ["checks:"];
  for (const c of checks) {
    lines.push(`  - id: ${c.id}`);
    if (c.kind) lines.push(`    kind: ${c.kind}`);
    if (c.profile) lines.push(`    profile: ${c.profile}`);
    if (c.enabled !== undefined) lines.push(`    enabled: ${c.enabled}`);
    if (c.disabled_reason !== undefined) lines.push(`    disabled_reason: '${c.disabled_reason}'`);
  }
  writeFixture(dir, ".context-index/governance/validate.yaml", lines.join("\n") + "\n");
}

/** `review.yaml` — MARKED, so every fixture carries `materialized_at`. */
function seedReviewers(dir, body) {
  writeFixture(
    dir,
    ".context-index/governance/review.yaml",
    stampMarker(body, MARKED_AT),
  );
}

/** `diagnostics.yaml` — MARKED, plus a project-owned runner to point at. */
function seedDiagnostics(dir, entries) {
  writeFixture(
    dir,
    ".context-index/diagnostics/fires.mjs",
    "export function run() { return { fired: true, severity: 'warning', message: 'fired' }; }\n",
  );
  const lines = ["diagnostics:"];
  for (const e of entries) {
    lines.push(`  - id: ${e.id}`);
    lines.push(`    runner: ${e.runner ?? "project:fires.mjs"}`);
    lines.push(`    severity: ${e.severity ?? "warning"}`);
    lines.push(`    tier: ${e.tier ?? 1}`);
    lines.push(`    scope: ${e.scope ?? "workspace"}`);
    if (e.enabled !== undefined) lines.push(`    enabled: ${e.enabled}`);
    if (e.disabled_reason !== undefined) lines.push(`    disabled_reason: '${e.disabled_reason}'`);
  }
  writeFixture(
    dir,
    ".context-index/governance/diagnostics.yaml",
    stampMarker(lines.join("\n") + "\n", MARKED_AT),
  );
}

/** `gates.yaml` — MARKED, so every fixture carries `materialized_at`. */
function seedGates(dir, gates) {
  const lines = ["gates:"];
  for (const g of gates) {
    lines.push(`  - id: ${g.id}`);
    lines.push(`    command: ${JSON.stringify(g.command ?? ["npm", "test"])}`);
    lines.push(`    tier: ${g.tier ?? "fast"}`);
    if (g.enabled !== undefined) lines.push(`    enabled: ${g.enabled}`);
    if (g.disabled_reason !== undefined) lines.push(`    disabled_reason: '${g.disabled_reason}'`);
  }
  writeFixture(
    dir,
    ".context-index/governance/gates.yaml",
    stampMarker(lines.join("\n") + "\n", MARKED_AT),
  );
}

/** `boundaries.yaml` — marker-exempt, written bare. */
function seedRules(dir, rules) {
  const lines = ["boundaries:"];
  for (const r of rules) {
    lines.push(`  - id: ${r.id}`);
    lines.push(`    severity: ${r.severity ?? "error"}`);
    lines.push(`    pattern: '${r.pattern ?? "FORBIDDEN"}'`);
    if (r.flags) lines.push(`    flags: '${r.flags}'`);
    if (r.enabled !== undefined) lines.push(`    enabled: ${r.enabled}`);
    if (r.disabled_reason !== undefined) lines.push(`    disabled_reason: '${r.disabled_reason}'`);
  }
  writeFixture(dir, ".context-index/governance/boundaries.yaml", lines.join("\n") + "\n");
}

// ── validate.yaml ───────────────────────────────────────────────────────────

describe("enabled/disabled_reason — validate.yaml", () => {
  test("a disabled check surfaces its reason in the loaded config", () => {
    const dir = tmp();
    seedChecks(dir, [
      { id: "validate.check-8-boundaries", enabled: false, disabled_reason: "no rules yet" },
    ]);
    const cfg = loadValidateConfig(dir);
    const c = cfg.checks.find((x) => x.id === "validate.check-8-boundaries");
    assert.equal(c.enabled, false);
    assert.equal(c.disabled_reason, "no rules yet");
  });

  test("a disabled entry is distinguishable from an absent one", () => {
    const dir = tmp();
    seedChecks(dir, [
      { id: "validate.check-8-boundaries", enabled: false, disabled_reason: "no rules yet" },
    ]);
    const cfg = loadValidateConfig(dir);

    // Disabled: a row exists, it says it is off, and it says why.
    const disabled = cfg.checks.find((x) => x.id === "validate.check-8-boundaries");
    assert.ok(disabled, "a disabled check must remain visible in the loaded config");
    assert.equal(disabled.enabled, false);
    assert.match(disabled.disabledNote, /skipped/);
    assert.ok(
      cfg.disabled.some((x) => x.id === "validate.check-8-boundaries"),
      "a disabled check must also be reachable through the result's `disabled` list",
    );

    // Absent: no row at all, and nothing in `disabled` either.
    assert.equal(cfg.checks.find((x) => x.id === "validate.check-11-visual-verification"), undefined);
    assert.equal(
      cfg.disabled.find((x) => x.id === "validate.check-11-visual-verification"),
      undefined,
    );
  });

  test("enabled: false without a reason warns but stays disabled", () => {
    const dir = tmp();
    seedChecks(dir, [{ id: "validate.check-8-boundaries", enabled: false }]);
    const cfg = loadValidateConfig(dir);
    assert.ok(
      hasCode(cfg.warnings, "DISABLED_WITHOUT_REASON"),
      `expected DISABLED_WITHOUT_REASON; got ${JSON.stringify(cfg.warnings)}`,
    );
    const c = cfg.checks.find((x) => x.id === "validate.check-8-boundaries");
    assert.equal(c.enabled, false, "a missing reason is a warning, not a refusal to disable");
    assert.equal(c.disabled_reason, null);
  });

  test("an empty-string disabled_reason is no reason at all", () => {
    const dir = tmp();
    seedChecks(dir, [
      { id: "validate.check-8-boundaries", enabled: false, disabled_reason: "   " },
    ]);
    const cfg = loadValidateConfig(dir);
    assert.ok(hasCode(cfg.warnings, "DISABLED_WITHOUT_REASON"));
    assert.equal(
      cfg.checks.find((x) => x.id === "validate.check-8-boundaries").disabled_reason,
      null,
    );
  });

  test("enabled: true set explicitly behaves identically to the field being absent", () => {
    const explicit = tmp();
    seedChecks(explicit, [
      { id: "validate.check-8-boundaries", kind: "observational", enabled: true },
    ]);
    const absent = tmp();
    seedChecks(absent, [{ id: "validate.check-8-boundaries", kind: "observational" }]);

    const a = loadValidateConfig(explicit);
    const b = loadValidateConfig(absent);
    assert.deepEqual(a.checks, b.checks);
    assert.deepEqual(a.warnings, b.warnings);
    assert.deepEqual(a.disabled, []);
  });

  test("a non-boolean enabled warns and the entry stays ENABLED", () => {
    // Fails safe: only the boolean `false` switches enforcement off. A quoted
    // "false" (the likeliest typo) must not silently disable a check, and it
    // must not brick the load either.
    const dir = tmp();
    writeFixture(
      dir,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: validate.check-8-boundaries
    kind: observational
    enabled: 'false'
`,
    );
    const cfg = loadValidateConfig(dir);
    assert.ok(
      hasCode(cfg.warnings, "INVALID_ENABLED_VALUE"),
      `expected INVALID_ENABLED_VALUE; got ${JSON.stringify(cfg.warnings)}`,
    );
    const c = cfg.checks.find((x) => x.id === "validate.check-8-boundaries");
    assert.equal(c.enabled, true);
    assert.deepEqual(cfg.disabled, []);
  });
});

// ── review.yaml ─────────────────────────────────────────────────────────────

describe("enabled/disabled_reason — review.yaml", () => {
  test("a disabled reviewer stays visible, carries its reason and never dispatches", () => {
    const dir = tmp();
    seedReviewers(
      dir,
      `reviewers:
  - id: consistency-analyzer
    enabled: false
    disabled_reason: 'covered by the linter'
`,
    );
    const cfg = loadReviewConfig(dir);
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors));

    const r = cfg.reviewers.find((x) => x.id === "consistency-analyzer");
    assert.ok(r, "a disabled reviewer must remain visible, not be silently removed");
    assert.equal(r.enabled, false);
    assert.equal(r.disabled_reason, "covered by the linter");
    assert.ok(cfg.disabled.some((x) => x.id === "consistency-analyzer"));

    // Visible is not runnable: the dispatch predicate refuses it.
    const verdict = shouldDispatch(r, { targetSpecPath: "a/b.spec.md", specContent: "" });
    assert.equal(verdict.dispatch, false);
    assert.match(verdict.reason, /disabled/);
  });

  test("a reviewer absent from review.yaml is not in `disabled` either", () => {
    const dir = tmp();
    seedReviewers(dir, "reviewers: []\n");
    const cfg = loadReviewConfig(dir);
    assert.deepEqual(cfg.reviewers, []);
    assert.deepEqual(cfg.disabled, []);
  });

  test("enabled: false without a reason warns but stays disabled", () => {
    const dir = tmp();
    seedReviewers(
      dir,
      `reviewers:
  - id: consistency-analyzer
    enabled: false
`,
    );
    const cfg = loadReviewConfig(dir);
    assert.ok(
      hasCode(cfg.warnings, "DISABLED_WITHOUT_REASON"),
      `expected DISABLED_WITHOUT_REASON; got ${JSON.stringify(cfg.warnings)}`,
    );
    const r = cfg.reviewers.find((x) => x.id === "consistency-analyzer");
    assert.equal(r.enabled, false);
    assert.equal(r.disabled_reason, null);
  });

  test("a disabled reviewer is not required to declare a prompt or a package", () => {
    // The commonest reason to disable a reviewer is that what it pointed at is
    // gone. Validating a row that will never run would make the field unusable
    // in exactly that case.
    const dir = tmp();
    seedReviewers(
      dir,
      `reviewers:
  - id: consistency-analyzer
    enabled: false
    disabled_reason: 'prompt retired'
`,
    );
    const cfg = loadReviewConfig(dir);
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors));
  });
});

// ── diagnostics.yaml ────────────────────────────────────────────────────────

describe("enabled/disabled_reason — diagnostics.yaml", () => {
  test("a disabled diagnostic stays visible, carries its reason and is not run", async () => {
    const dir = tmp();
    seedDiagnostics(dir, [
      { id: "adev/off", enabled: false, disabled_reason: "noisy on this repo" },
      { id: "adev/on" },
    ]);

    const reg = await loadRegistry(dir);
    assert.deepEqual(reg.errors, [], JSON.stringify(reg.errors));
    const off = reg.entries.find((e) => e.id === "adev/off");
    assert.ok(off, "a disabled diagnostic must remain visible in the loaded registry");
    assert.equal(off.enabled, false);
    assert.equal(off.disabled_reason, "noisy on this repo");
    assert.ok(reg.disabled.some((e) => e.id === "adev/off"));

    const run = await runDiagnostics({ projectRoot: dir, tier: 1, scope: "workspace" });
    assert.equal(run.fired.some((f) => f.id === "adev/off"), false, "a disabled runner must not run");
    assert.ok(
      run.skipped.some((s) => s.id === "adev/off" && /disabled/.test(s.reason)),
      `expected a disabled skip for adev/off; got ${JSON.stringify(run.skipped)}`,
    );
    assert.ok(run.fired.some((f) => f.id === "adev/on"), "the enabled sibling still runs");
  });

  test("a diagnostic absent from the registry is not in `disabled` either", async () => {
    const dir = tmp();
    seedDiagnostics(dir, [{ id: "adev/on" }]);
    const reg = await loadRegistry(dir);
    assert.deepEqual(reg.disabled, []);
    assert.equal(reg.entries.find((e) => e.id === "adev/off"), undefined);
  });

  test("enabled: false without a reason warns but stays disabled", async () => {
    const dir = tmp();
    seedDiagnostics(dir, [{ id: "adev/off", enabled: false }]);
    const reg = await loadRegistry(dir);
    assert.ok(
      hasCode(reg.warnings, "DISABLED_WITHOUT_REASON"),
      `expected DISABLED_WITHOUT_REASON; got ${JSON.stringify(reg.warnings)}`,
    );
    const off = reg.entries.find((e) => e.id === "adev/off");
    assert.equal(off.enabled, false);
    assert.equal(off.disabled_reason, null);
  });

  test("registry schema warnings reach the CALLER of runDiagnostics", async () => {
    // `loadRegistry` raises DISABLED_WITHOUT_REASON on `warnings`, but
    // `runDiagnostics` used to forward only `registry.errors` — so the Error
    // Case was implemented into a return value nothing read. Warnings ride the
    // same channel the registry's other self-diagnostics already use, which is
    // the one `adev diagnose` prints and puts in its `--json` envelope.
    const dir = tmp();
    seedDiagnostics(dir, [{ id: "adev/off", enabled: false }]);
    const run = await runDiagnostics({ projectRoot: dir, tier: 1, scope: "workspace" });
    assert.ok(
      run.errors.some(
        (e) => e.severity === "warning" && /DISABLED_WITHOUT_REASON/.test(e.message),
      ),
      `expected DISABLED_WITHOUT_REASON on the run envelope; got ${JSON.stringify(run.errors)}`,
    );
  });

  test("a clean registry forwards no schema warnings", async () => {
    const dir = tmp();
    seedDiagnostics(dir, [{ id: "adev/on" }]);
    const run = await runDiagnostics({ projectRoot: dir, tier: 1, scope: "workspace" });
    assert.deepEqual(run.errors, [], JSON.stringify(run.errors));
  });

  test("a disabled diagnostic's runner is never containment-resolved", async () => {
    // Same reasoning as the reviewer case: disabling is how you turn off a row
    // whose runner no longer exists.
    const dir = tmp();
    seedDiagnostics(dir, [
      { id: "adev/off", runner: "project:gone.mjs", enabled: false, disabled_reason: "runner retired" },
    ]);
    const reg = await loadRegistry(dir);
    assert.deepEqual(reg.errors, [], JSON.stringify(reg.errors));
    assert.equal(reg.entries.find((e) => e.id === "adev/off").enabled, false);
  });
});

// ── boundaries.yaml ─────────────────────────────────────────────────────────

describe("enabled/disabled_reason — boundaries.yaml", () => {
  test("all rules disabled reports disabling, NOT 'no boundary rules declared'", async () => {
    const dir = tmp();
    seedRules(dir, [
      { id: "off-a", enabled: false, disabled_reason: "migrating" },
      { id: "off-b", enabled: false, disabled_reason: "migrating" },
    ]);
    writeFixture(dir, "src/a.mjs", "FORBIDDEN\n");
    const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
    assert.equal(r.verdict, "SKIP");
    assert.doesNotMatch(
      r.reason,
      /no boundary rules declared/,
      "an all-disabled registry is not an empty one and must not claim to be",
    );
    assert.match(r.reason, /disabled/);
    assert.match(r.reason, /2/);
  });

  test("a disabled rule surfaces its reason on the result", async () => {
    const dir = tmp();
    seedRules(dir, [{ id: "off", enabled: false, disabled_reason: "handled by eslint" }]);
    writeFixture(dir, "src/a.mjs", "FORBIDDEN\n");
    const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
    const off = r.disabled.find((d) => d.id === "off");
    assert.ok(off, "a disabled rule must remain visible on the result");
    assert.equal(off.enabled, false);
    assert.equal(off.disabled_reason, "handled by eslint");
    assert.match(off.disabledNote, /skipped/);
  });

  test("an empty registry is still 'no boundary rules declared' with an empty `disabled`", async () => {
    const dir = tmp();
    seedRules(dir, []);
    const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
    assert.equal(r.verdict, "SKIP");
    assert.match(r.reason, /no boundary rules declared/);
    assert.deepEqual(r.disabled, []);
  });

  test("enabled: false without a reason warns but stays disabled", async () => {
    const dir = tmp();
    seedRules(dir, [{ id: "off", enabled: false }]);
    writeFixture(dir, "src/a.mjs", "FORBIDDEN\n");
    const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
    assert.ok(
      hasCode(r.warnings, "DISABLED_WITHOUT_REASON"),
      `expected DISABLED_WITHOUT_REASON; got ${JSON.stringify(r.warnings)}`,
    );
    assert.equal(r.verdict, "SKIP");
    assert.equal(r.disabled.find((d) => d.id === "off").disabled_reason, null);
  });

  test("a disabled rule does not fire while its enabled sibling still does", async () => {
    const dir = tmp();
    seedRules(dir, [
      { id: "off", pattern: "FORBIDDEN", enabled: false, disabled_reason: "retired" },
      { id: "on", pattern: "ALSO_BAD" },
    ]);
    writeFixture(dir, "src/a.mjs", "FORBIDDEN\nALSO_BAD\n");
    const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
    assert.equal(r.verdict, "FAIL");
    assert.deepEqual(r.findings.map((f) => f.ruleId), ["on"]);
    assert.deepEqual(r.disabled.map((d) => d.id), ["off"]);
  });
});

// ── `flags` — evaluator and contribution boundary agree (item 5) ────────────

// ── the report surfaces that consume the loaders ────────────────────────────

describe("disabled entries reach a REPORT, not only a loaded config", () => {
  test("review-specs' consolidated report has a row for disabled reviewers", () => {
    // The loader retains a disabled reviewer with its reason, but the skill
    // emitted one section per DISPATCHED reviewer — so the disabled one
    // vanished from the report entirely, which is the half of Behavior 5 that
    // says "the REPORT records it as deliberately disabled".
    const md = readSkillSurface("review-specs");
    assert.match(md, /Disabled Reviewers/i);
    assert.match(md, /disabled_reason/);
    assert.match(md, /no reason given/i);
  });

  test("docs/governance.md's disable examples state a reason", () => {
    // Copied verbatim, a bare `enabled: false` now emits
    // DISABLED_WITHOUT_REASON. Shipped docs must not teach the pattern the
    // warning flags.
    const md = readFileSync(join(PLUGIN_ROOT, "docs/governance.md"), "utf8");
    for (const block of md.split("```").filter((b) => /enabled:\s*false/.test(b))) {
      assert.match(
        block,
        /disabled_reason:/,
        `a docs/governance.md example sets enabled: false with no disabled_reason:\n${block}`,
      );
    }
    assert.match(md, /DISABLED_WITHOUT_REASON/);
  });

  test("docs/extensions.md scopes the `flags` constraint to the contribution boundary", () => {
    const md = readFileSync(join(PLUGIN_ROOT, "docs/extensions.md"), "utf8");
    assert.match(md, /extension-contributed boundary rule/);
  });
});

// ── gates.yaml ──────────────────────────────────────────────────────────────

describe("enabled/disabled_reason — gates.yaml", () => {
  test("a disabled gate is not in the executable set but stays visible with its reason", () => {
    const dir = tmp();
    seedGates(dir, [
      { id: "lint", enabled: false, disabled_reason: "linter not configured yet" },
      { id: "test" },
    ]);

    const { gates, disabled } = loadCheck1Gates(dir);
    assert.equal(
      gates.some((g) => g.id === "lint"),
      false,
      "a disabled gate must not be resolved into the set consumers execute",
    );
    assert.ok(gates.some((g) => g.id === "test"), "the enabled sibling still resolves");

    const off = disabled.find((g) => g.id === "lint");
    assert.ok(off, "a disabled gate must remain visible on the resolved set");
    assert.equal(off.enabled, false);
    assert.equal(off.disabled_reason, "linter not configured yet");
    assert.match(off.disabledNote, /linter not configured yet/);
    // The declared row survives intact, so `adev governance materialize` can
    // write it back rather than dropping it.
    assert.deepEqual(off.command, ["npm", "test"]);
  });

  test("a gate absent from gates.yaml is not in `disabled` either", () => {
    const dir = tmp();
    seedGates(dir, [{ id: "test" }]);
    const { gates, disabled } = loadCheck1Gates(dir);
    assert.deepEqual(disabled, []);
    assert.equal(gates.find((g) => g.id === "lint"), undefined);
  });

  test("enabled: false without a reason warns but stays disabled", () => {
    const dir = tmp();
    seedGates(dir, [{ id: "lint", enabled: false }, { id: "test" }]);
    const { gates, disabled, warnings } = loadCheck1Gates(dir);
    assert.ok(
      hasCode(warnings, "DISABLED_WITHOUT_REASON"),
      `expected DISABLED_WITHOUT_REASON; got ${JSON.stringify(warnings)}`,
    );
    assert.equal(gates.some((g) => g.id === "lint"), false);
    const off = disabled.find((g) => g.id === "lint");
    assert.equal(off.enabled, false);
    assert.equal(off.disabled_reason, null);
  });

  test("a non-boolean enabled warns and the gate stays in the executable set", () => {
    const dir = tmp();
    seedGates(dir, [{ id: "test", enabled: "'false'" }]);
    const { gates, disabled, warnings } = loadCheck1Gates(dir);
    assert.ok(
      hasCode(warnings, "INVALID_ENABLED_VALUE"),
      `expected INVALID_ENABLED_VALUE; got ${JSON.stringify(warnings)}`,
    );
    assert.ok(gates.some((g) => g.id === "test"), "a quoting slip must not disable a gate");
    assert.deepEqual(disabled, []);
  });
});

describe("boundaries `flags` — evaluator and allowlist agree", () => {
  test("the evaluator honours a case-insensitive rule", async () => {
    const dir = tmp();
    seedRules(dir, [{ id: "ci", severity: "warning", pattern: "todo", flags: "i" }]);
    writeFixture(dir, "src/a.mjs", "// TODO: later\n");
    const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
    assert.equal(r.verdict, "WARN");
    assert.equal(r.findings[0].ruleId, "ci");
  });

  test("`flags` is contributable to boundaries.yaml", () => {
    // Decision (a): the evaluator's `flags` support is real and shipped, and
    // case-insensitivity is a genuine need. Refusing the field at the
    // contribution boundary while the evaluator accepts it left the two
    // disagreeing about the schema, so an extension shipping a working rule was
    // refused for a field the runtime honours.
    assert.ok(FIELD_ALLOWLIST.get("boundaries.yaml").has("flags"));
    assert.doesNotThrow(() =>
      validateEntryFields("boundaries.yaml", { id: "b", pattern: "x", flags: "i" }),
    );
    // "No flags" is the field being ABSENT. An explicit `flags: ''` is refused
    // one layer up by the pre-existing scalar round-trip rule (an empty YAML
    // scalar reparses as `{}`), which is correct and untouched here.
    assert.doesNotThrow(() =>
      validateEntryFields("boundaries.yaml", { id: "b", pattern: "x" }),
    );
    assert.throws(
      () => validateEntryFields("boundaries.yaml", { id: "b", pattern: "x", flags: "" }),
      /does not survive its own round trip/,
    );
  });

  test("`flags` is constrained to the matching-semantics characters", () => {
    // `i`, `m`, `s`, `u` change what a pattern MATCHES and nothing else.
    for (const flags of ["i", "m", "s", "u", "ims"]) {
      assert.doesNotThrow(
        () => validateEntryFields("boundaries.yaml", { id: "b", pattern: "x", flags }),
        `flags: ${flags}`,
      );
    }
    // `g` and `y` make the compiled RegExp STATEFUL through `lastIndex`. The
    // worker compiles fresh per task today, so they are inert — which is
    // precisely why they are refused: the day that changes, a stateful flag
    // starts silently skipping matches, and a boundary rule that stops firing
    // is a merge gate that fails OPEN.
    for (const flags of ["g", "y", "gi", "d", "v", "ii", "z", "  ", 7, true, ["i"]]) {
      assert.throws(
        () => validateEntryFields("boundaries.yaml", { id: "b", pattern: "x", flags }),
        (e) => e.code === "GOVERNANCE_FIELD_VALUE_INVALID",
        `flags: ${JSON.stringify(flags)}`,
      );
    }
  });

  test("the EVALUATOR refuses the stateful flags too, not only the contribution boundary", async () => {
    // The contribution allowlist refuses `g`/`y`; the evaluator used to accept
    // any string `new RegExp` accepts, so a PROJECT-authored rule bypassed the
    // constraint entirely. `g` is inert today only because the worker compiles
    // a fresh RegExp per task — an accident of the current implementation, not
    // a guarantee. One allowlist, both boundaries.
    for (const flags of ["g", "y", "gi", "d", "v"]) {
      const dir = tmp();
      seedRules(dir, [{ id: "stateful", pattern: "X", flags }]);
      await assert.rejects(
        () => checkBoundaries(dir, { changed: ["src/a.mjs"] }),
        (e) => e.code === "INVALID_BOUNDARY_PATTERN",
        `flags: ${flags}`,
      );
    }
  });

  test("the evaluator still accepts every matching-semantics flag", async () => {
    for (const flags of ["i", "m", "s", "u", "ims"]) {
      const dir = tmp();
      seedRules(dir, [{ id: "ok", pattern: "X", flags }]);
      const r = await checkBoundaries(dir, { changed: [] });
      assert.equal(r.verdict, "SKIP", `flags: ${flags}`);
    }
  });

  test("`flags` is confined to boundaries.yaml", () => {
    for (const target of ["validate.yaml", "review.yaml", "gates.yaml", "diagnostics.yaml"]) {
      assert.equal(FIELD_ALLOWLIST.get(target).has("flags"), false, target);
    }
  });
});
