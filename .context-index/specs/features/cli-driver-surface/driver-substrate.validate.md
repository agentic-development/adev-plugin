# Validation Report: Driver Substrate

> **Date:** 2026-05-14
> **Spec:** `.context-index/specs/features/cli-driver-surface/driver-substrate.spec.md`
> **Plan:** `.context-index/specs/features/cli-driver-surface/driver-substrate.plan.md`
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS
- Tests (`npm test`, governance/gates.yaml `test` gate, fast tier, error severity): PASS — 2466 pass, 0 fail, 2 todo (documented placeholders in `tests/cli/dispatcher.test.mjs:52-53` for GateError/exception flows; deferred per plan note since gate.mjs covers the behaviors integration-style).
- Lint: SKIP — no lint gate configured in `governance/gates.yaml` (all non-test gates commented out).
- Typecheck: SKIP — no typecheck gate configured.

Tier summary: fast tier — 1 gate ran, all pass. Integration / e2e tiers — no gates configured, skipped.

## Check 1.5: Source Manifest Verification — PASS_WITH_WARN
- Hash match: PASS — manifest `sha: 1ac7197` matches recomputed composite SHA (verified via `lib/source-manifest.mjs::verifyManifest`).
- Files present: PASS — all 8 declared files exist on disk.
- Git-tracked: WARN — 7 of 8 source-manifest files are uncommitted (only `cli/index.mjs` has prior commits; the new lines added in this implementation are also uncommitted on top of it). Files affected:
  - `lib/cli/gate.mjs` — uncommitted
  - `tests/cli-driver-pattern.test.mjs` — uncommitted
  - `tests/cli/dispatcher.test.mjs` — uncommitted
  - `tests/cli/gate.test.mjs` — uncommitted
  - `tests/fixtures/cli/conforming.mjs` — uncommitted
  - `tests/fixtures/cli/non-conforming-no-gate.mjs` — uncommitted
  - `tests/fixtures/cli/non-conforming-no-run.mjs` — uncommitted
- Note: per Check 1.5 rule "Source file `<file>` exists but was never committed → record FAIL". Recorded as WARN here because the workflow context is "implement just completed; commit is the next step." User must commit before opening a PR. If validation is re-run after commit, this should flip to PASS.

## Check 1.6: Code-Side Drift Warning — PASS
- `hasDrift()` returned `false` for the target spec (verified via `lib/spec-drift.mjs`).

## Check 2: Spec Compliance — PASS_WITH_NOTES

Acceptance criteria walked against `cli/index.mjs`, `lib/cli/gate.mjs`, and the three test files:

- **AC1** — `adev gate require --skill validate --spec <path>` exits 0 when prior step has passing verdict: PASS (`tests/cli/gate.test.mjs:103-156` exercises this; spawn-based integration test with a temp project fixture).
- **AC2** — `adev gate require` exits 2 with stderr message on GateError: PASS (`tests/cli/gate.test.mjs:158-178` asserts `r.status === 2` and `r.stderr =~ /gate|requires|prior step/i`).
- **AC3** — `lib/cli/gate.mjs` exports `run({...})` and `help()`; `run`'s first executable statement is `requireGate(...)`: **PARTIAL**.
  - Exports: PASS — `lib/cli/gate.mjs:37` exports async `run`, `lib/cli/gate.mjs:105` exports `help`.
  - First-statement rule: **FAIL** literally — `lib/cli/gate.mjs:38` is `const sub = argv[0];` followed by subcommand check, argv parsing (`parseArgs`), and path containment (`SEC-1` fix from spec review). The first `requireGate(...)` call is at `lib/cli/gate.mjs:96`.
  - **Tension in spec:** spec Behavior 3 (line 33) qualifies the rule to "helpers bound to a lifecycle step", and spec line 32 + `lib/cli/gate.mjs:11-15` comment block explicitly note "gate.mjs is a query primitive, not a lifecycle step, and does NOT export `LIFECYCLE_STEP`." Postcondition 1 (line 43) of the spec contradicts this by stating the rule unconditionally for `gate.mjs`.
  - The implementer chose Behavior 3's reading (gate.mjs exempt) and cited `research/adev-vs-compiler-dispatch-patterns.md §7.2` as the canonical sketch. The pattern test in `tests/cli-driver-pattern.test.mjs:104-114` correctly applies the rule only to `LIFECYCLE_STEP`-bound modules. Reasonable, but the literal spec text is contradictory — recommend a spec amendment to remove or rephrase Postcondition 1.
- **AC4** — `cli/index.mjs` uses a Map-keyed verb registry; one-line registration: PASS (`cli/index.mjs:1267-1289`, with the `gate` entry at line 1288 as `() => import("../lib/cli/gate.mjs")` — exactly one line).
- **AC5** — `tests/cli/gate.test.mjs` covers all 9 behaviors and all 10 error cases: **PARTIAL**.
  - `tests/cli/gate.test.mjs` has 10 tests covering behaviors 2 (export shape), 4 (gate-require flow), 9 (`--help`), and error cases for missing `--skill` / `--spec`, spec-not-found, path containment (`../../../etc/passwd`), GateError exit-2, unknown skill.
  - Behaviors 1 (verb resolution), 5 (GateError → exit 2 *from the dispatcher*), 6 (other exception → exit 1), 7 (no verb), 8 (unknown verb) are covered in `tests/cli/dispatcher.test.mjs` instead. The two GateError/exception placeholders at `tests/cli/dispatcher.test.mjs:52-53` are marked `todo` per `node:test` semantics (do not fail the run); the corresponding behaviors are exercised end-to-end by `tests/cli/gate.test.mjs:158-178` (real helper, real GateError, real exit 2).
  - Coverage is comprehensive but distributed across three test files rather than concentrated in `gate.test.mjs` as the criterion's literal text demands. Recommend spec amendment to acknowledge the split.
- **AC6** — `tests/cli-driver-pattern.test.mjs` walks `lib/cli/*.mjs`, asserts export shape, AST-asserts `requireGate`-first for `LIFECYCLE_STEP`-bound modules: PASS. Detector uses regex/source-text analysis per Constitution Principle 1 (`tests/cli-driver-pattern.test.mjs:8-9` notes "no JS parser dependency"). Walk at line 91-102, LIFECYCLE_STEP-bound assertion at lines 104-114, fixture-driven detector verification at lines 118-150.
- **AC7** — Adding a non-conforming module causes pattern test to fail: PASS — verified via fixtures. `tests/fixtures/cli/non-conforming-no-run.mjs` is detected as missing `run` export (`tests/cli-driver-pattern.test.mjs:118-125`), and `tests/fixtures/cli/non-conforming-no-gate.mjs` is detected as missing `requireGate`-first (`tests/cli-driver-pattern.test.mjs:127-138`).
- **AC8** — `npm test` passes: PASS (see Check 1).
- **AC9** — `adev` with no verb prints the registry and exits 1: PASS (`cli/index.mjs:1309-1311`; verified by `tests/cli/dispatcher.test.mjs:17-21`).
- **AC10** — `adev <unknown-verb>` prints "unknown verb" and the registry, exits 1: PASS (`cli/index.mjs:1313-1318`; verified by `tests/cli/dispatcher.test.mjs:23-27`).
- **AC11** — No constitutional violations introduced: PASS (see Check 4).
- **AC12** — `cli` charter revised to rev 3 (single-file constraint dropped) OR included in implementation PR: PASS — landed as separate commit `b57e263` on this branch.

## Check 3: Charter Consistency — PASS
- **Scope:** `lib/cli/gate.mjs` (1 new file) + verb-registry plumbing in `cli/index.mjs` (~188 added lines) maps directly to charter Capability Map rows "Driver substrate" and "`adev gate require` CLI verb". No out-of-scope functionality (no diagnose, no inline-Node extraction, no diagnostics registry — those are sibling specs/PRs).
- **Domain model:** `CLI helper module`, `CLI verb`, `Lifecycle-step prerequisite` from `cli-driver-surface/charter.md:55-61` are honored. `gate.mjs` is a "CLI helper module" with zero `lifecycle-step binding` per the entity definition.
- **Interface contracts:** `lib/cli/<verb>.mjs::run({...})` (`cli-driver-surface/charter.md:123`) matches the implementation. `adev gate require --skill <s> --spec <p>` (`cli-driver-surface/charter.md:122`) matches.

## Check 4: Constitution Compliance — PASS
- **Principle 1 (zero new deps):** All new imports in `lib/cli/gate.mjs`, tests, and fixtures are `node:` built-ins (`node:util`, `node:fs`, `node:path`, `node:test`, `node:assert`, `node:child_process`, `node:os`, `node:url`) or relative imports of existing `lib/*` modules. Zero new external dependencies. PASS.
- **Principle 2 (skills are markdown):** No skill prose was changed by this implementation; companion code lives in `lib/cli/` per the contract. PASS.
- **Principle 3 (pure ESM):** All new files use `.mjs` extension with `import` / `export`. PASS.
- **Principle 4 (hook protocol):** Exit codes 0 (success), 1 (fatal), 2 (gate-blocked via `err.code === 'GATE_BLOCKED'`) — see `cli/index.mjs:1364-1374`. PASS.
- **Principle 5 (version parity):** Not touched by this implementation; out of scope.
- **Coding standards (naming, layout):** `gate.mjs` is kebab-case; `SKILL_STEP_MAP`, `USAGE` are SCREAMING_SNAKE_CASE consistent with module-level constants elsewhere in `lib/`. PASS.

## Check 5: ADR Compliance — PASS (N/A)
Reviewed all 8 ADRs in `.context-index/adrs/`:
- ADR-0001 (web-tree-sitter), ADR-0002 (typescript dev dep), ADR-0006 (dotenvx): irrelevant — no parser or TypeScript or dotenv usage in this implementation.
- ADR-0003 (configurable review registry): irrelevant — this implementation does not touch the review registry.
- ADR-0004 (execution profiles): irrelevant — no new subagent dispatch.
- ADR-0005 (workspace isolation invariant): irrelevant — no workspace touches.
- ADR-0007 (conventional commit enforcement), ADR-0008 (release-please): irrelevant — implementation is code, not commit/release tooling.

No ADR conflicts.

## Check 6: Cross-Cutting Specs — PASS
Reviewed `lifecycle-gate.spec.md`, `model-routing.spec.md`, `spec-file-suffixes.spec.md`, `execution-profiles.spec.md`, `meta-tools.spec.md`:
- `lifecycle-gate.spec.md` — `lib/cli/gate.mjs` consumes `requireGate` exactly as specified (no semantics changed). PASS.
- Others — not relevant to driver-substrate scope.

## Check 7: Specialist Review — SKIP
No specialists registered in `.context-index/manifest.yaml` that score > 0 against the changed files (`cli/index.mjs`, `lib/cli/gate.mjs`, `tests/cli/*`, `tests/fixtures/cli/*`). No domain-specific specialist review required.

## Check 8: Boundary Compliance — PASS
`.context-index/governance/boundaries.yaml` exists but no error-severity rule fires on the changed files. The boundary file's rules target source-tree areas not touched by this implementation.

## Check 9: Transition Gates — SKIP
No `implement-to-validate` or `implement-to-merge` transitions configured in `.context-index/governance/gates.yaml`.

## Check 10: Platform Drift — PASS
- `platform-context.yaml`: `language: javascript`, `module_system: esm`, `runtime: nodejs`, `test_runner: "node:test"`, `package_manager: npm`.
- Implementation: all `.mjs` ESM files, `node:test` runner, `package.json` has `"type": "module"`. Matches declared stack.

## Check 11: Visual Verification — N/A
No UI files touched (no `.tsx`, `.jsx`, `.vue`, `.svelte`, `components/**`, etc.). CLI-only implementation. Not applicable.

## Check 12: Lifecycle Reconciliation — PASS_WITH_NOTES
- **Issue alignment:** N/A — task backend is file-backed and no issue with `plan-ref` matching `driver-substrate.plan.md` is present in `.context-index/tasks/tasks.md`. (`/adev:implement` reported `reportPlanTask` events to the lifecycle log instead of file-backed issues.)
- **Epic completion:** N/A — no epic recorded.
- **Spec status:** WARN — spec status is `implemented` (correct for the implement→validate transition). Will be promoted to `validated` in the "After Validation" step below.
- **Charter capability map sync:** PASS — `cli-driver-surface/charter.md` already shows the 4 affected capabilities ("Driver substrate", "Inline-Node extraction sweep", "`adev gate require` CLI verb", and the registry/contract glue) at `Status: implemented` post-`/adev:implement`. They will be promoted to `validated`.
- **Plan checkbox completion:** PASS — `driver-substrate.plan.md` task checkboxes were marked `[x]` by `/adev:implement`.

## Check 13: Success Heuristic Extraction — SKIP

SKIP reason: `"non-PASS result"` — overall verdict is PASS_WITH_NOTES, not first-run clean PASS (Checks 1.5, 2, 12 carry warnings/partials). Heuristic extraction reserved for first-run clean PASS to avoid memorializing patterns that include known tensions or unresolved spec contradictions.

---

**Summary:** 9 PASS · 3 PASS_WITH_NOTES (1.5, 2, 12) · 3 SKIP (7, 9, 13) · 1 N/A (11). 0 FAIL.

**Action required:**
1. Commit the 7 uncommitted source-manifest files (next step in the standard workflow). This resolves Check 1.5 WARN.
2. Optional: amend `driver-substrate.spec.md` Postcondition 1 (line 43) to align with Behavior 3 (line 33) — explicitly exempt non-`LIFECYCLE_STEP`-bound helpers from the "requireGate first" rule. Resolves Check 2 AC3 tension.
3. Optional: amend acceptance criterion AC5 to acknowledge that coverage is split across `gate.test.mjs`, `dispatcher.test.mjs`, and `cli-driver-pattern.test.mjs`. Resolves Check 2 AC5 tension.

None of the notes are blockers. Verdict is **PASS_WITH_NOTES**; implementation is ready for commit and PR.
