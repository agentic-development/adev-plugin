<!-- DO NOT EDIT statuses inline — see lifecycle log diagnostic-registry.jsonl -->
# Implementation Plan: Diagnostic Registry

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md (rev 3)
> **Spec:** .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md (rev 2)
> **Review:** PASS (2026-05-14, second re-review)
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Build the `lib/diagnostics/` engine + 3 Tier-1 producers + shared `lib/spec-status.mjs` enum, plus the migration of lib-side writers to use the canonical enum. Engine is the foundation for `adev diagnose` (sibling spec) and the write-time hook (sibling spec).

**Architecture:** Layered. (1) Shared primitive `lib/spec-status.mjs` (SSoT enum). (2) Engine `lib/diagnostics/index.mjs::{runDiagnostics, loadRegistry}` with the four-step path-containment guard (`..` reject → prefix → realpath → per-root allowlist), `Promise.race` 500 ms timeout, message redaction, first-wins duplicate handling. (3) Three Tier-1 producers in `lib/diagnostics/tier1/` — `event-schema-valid.mjs`, `status-enum-legal.mjs`, `frontmatter-present.mjs` — plus `lib/diagnostics/event-schemas.mjs` (per-type required-field map mirroring `lifecycle-event-log.spec.md`). (4) Scaffolded `governance/diagnostics.yaml` + `templates/diagnostics-template.yaml`. (5) Lib-side writer migration (grep-confirmed: `meta-tools.mjs`, `reality-check.mjs`) + skill-side prose updates citing `SPEC_STATUSES`.

---

## File Structure

**Create:**
- `lib/spec-status.mjs` — exports `SPEC_STATUSES` (frozen array) + `assertLegalStatus(value)`.
- `lib/diagnostics/index.mjs` — `runDiagnostics({...})`, `loadRegistry(projectRoot)`, internal path-containment guard, `Promise.race` timeout wrapper, message redaction helper.
- `lib/diagnostics/event-schemas.mjs` — `KNOWN_EVENT_TYPES` + per-type required-field schema map (mirrors `lifecycle-event-log.spec.md`).
- `lib/diagnostics/tier1/event-schema-valid.mjs` — closed-discriminator / open-shape runner.
- `lib/diagnostics/tier1/status-enum-legal.mjs` — imports `SPEC_STATUSES`, checks frontmatter `status` field.
- `lib/diagnostics/tier1/frontmatter-present.mjs` — asserts YAML frontmatter parses.
- `.context-index/governance/diagnostics.yaml` — scaffolded with 3 Tier-1 entries.
- `templates/diagnostics-template.yaml` — byte-equivalent to `governance/diagnostics.yaml` for `/adev:init`.
- `tests/diagnostics/registry.test.mjs` — engine-level coverage (containment, timeout, redaction, duplicate-id, response shape).
- `tests/diagnostics/tier1/event-schema-valid.test.mjs`
- `tests/diagnostics/tier1/status-enum-legal.test.mjs`
- `tests/diagnostics/tier1/frontmatter-present.test.mjs`
- `tests/diagnostics/fixtures/` — minimal runner fixtures for containment + timeout + redaction tests (slow runner, hung runner, throwing runner, escape-attempt runner).

**Modify:**
- `lib/meta-tools.mjs:117` — replace literal status string in JSDoc with citation to `lib/spec-status.mjs::SPEC_STATUSES`.
- `lib/reality-check.mjs:319-330` — replace literal status strings in assignment sites with imports from `lib/spec-status.mjs`.
- `lib/lifecycle-state.mjs:171-172` — update docstring to reflect closed-discriminator / mode-dependent stance; mark `StateProjection.unknownEvents[]` deprecated.
- `cli/index.mjs::scaffoldContextKit` — copy `templates/diagnostics-template.yaml` to `.context-index/governance/diagnostics.yaml` on fresh install.
- `skills/specify/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/implement/SKILL.md`, `skills/validate/SKILL.md`, `skills/hygiene/SKILL.md` — update prose to cite `lib/spec-status.mjs::SPEC_STATUSES` instead of inlining the seven status strings.

**Reference (read, do not modify):**
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — canonical event-log shape (mirror `event-schemas.mjs` against it).
- `.context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md` rev 2 amendment block (clauses 1–15).
- `lib/cli/gate.mjs:69-80` — the spec-resolution containment pattern (explicitly NOT sufficient for runner imports; runner guard must be stricter).
- `.context-index/adrs/0009-governance-check-layering.md` — articulates the diagnostic surface vs other governance surfaces.

---

## Context Packets

### Task 1 Context (`lib/spec-status.mjs`)
- Spec: Behavior 8 + Postcondition for shared module + AC for module shape
- Cross-cutting: `lib/cli/gate.mjs::SKILL_STEP_MAP` (similar pattern for exported enums)

### Task 2 Context (Lib-side migration)
- Source files (full read): `lib/meta-tools.mjs:115-120`, `lib/reality-check.mjs:315-335`
- Re-run grep at task time: `grep -rn "'review-passed'\|'review-blocked'\|'review-pending'\|'implemented'\|'validated'\|'superseded'" lib/`
- Spec amendment clause (10): scope is whatever grep returns at implementation time

### Task 3 Context (`lib/diagnostics/event-schemas.mjs`)
- Authoritative source: `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (read the event-shape section in full)
- Cross-check: `lib/lifecycle-state.mjs::reportStep, reportValidator, reportReviewer, reportPlanTask, reportIntervention` (lines 423-575) for actual field shapes emitted by each writer

### Task 4 Context (`lib/diagnostics/index.mjs` engine)
- Spec: Behaviors 1–6, 10, plus all Error Cases
- Containment design (Behavior 2 Steps A–D) — implement EXACTLY as written; the spec explicitly forbids string-prefix shortcuts
- Message redaction (Behavior 3) — 4-form rewrite
- Timeout (Behavior 5 Stage 2) — `Promise.race([runner.run(ctx), timeout(500)])` with sentinel rejection

### Task 5 Context (`lib/diagnostics/tier1/event-schema-valid.mjs`)
- Spec: Behavior 7 (closed-discriminator, open-shape); requires reading `event-schemas.mjs` from Task 3

### Task 6 Context (`lib/diagnostics/tier1/status-enum-legal.mjs`)
- Spec: Behavior 8; imports `SPEC_STATUSES` from `lib/spec-status.mjs` (NOT inline)

### Task 7 Context (`lib/diagnostics/tier1/frontmatter-present.mjs`)
- Spec: Behavior 9; shared YAML helper (none exists today — extract from `lib/manifest.mjs` or use existing inline parser; cite Constitution Principle 1 — no new deps)

### Task 8 Context (Registry scaffold)
- Spec: Postcondition + AC for `governance/diagnostics.yaml` + `templates/diagnostics-template.yaml`
- Cross-cutting: `governance/gates.yaml`, `governance/review.yaml` for scaffold style precedent

### Task 9 Context (Engine tests)
- Spec: Acceptance Criteria — full list, especially the containment-test AC (6 cases) and timeout-test AC (3 cases) and redaction-test AC (3 cases)

### Task 10 Context (Producer tests)
- Spec: per-producer Behavior + per-producer AC + Error Cases that fire on each producer

### Task 11 Context (Lib docstring update)
- Source: `lib/lifecycle-state.mjs:165-190` (the `normaliseEventInPlace` JSDoc block)
- Spec amendment clause (8): docstring update is part of this spec's implementation

### Task 12 Context (Skill-side prose updates)
- Source: `skills/{specify,review-specs,implement,validate,hygiene}/SKILL.md` — locate sites that inline status string literals
- Spec amendment clause (3): documentation discipline — cite `lib/spec-status.mjs::SPEC_STATUSES` in prose

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 6. `spec-status.mjs` exists first, then migration consumes it, then the status-enum-legal producer consumes both.
- Group B (sequential): Task 3 → Task 5. `event-schemas.mjs` exists first, then `event-schema-valid.mjs` consumes it.
- Group C (sequential): Task 4 → Task 8 → Task 9. Engine first, then scaffold, then engine tests.
- Group D (independent): Task 7 (frontmatter-present.mjs — depends only on engine being able to load it, which doesn't require runtime; could land before engine if shimmed).
- Group E (sequential): Task 10 (producer tests) — after Tasks 5, 6, 7.
- Group F (independent): Task 11 (lib docstring update) — can run any time.
- Group G (independent): Task 12 (skill prose updates) — can run any time.

A and B can run in parallel. C waits on engine. E waits on producers.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Extract lib/spec-status.mjs | Small | unit | — | 1 create, 0 modify |
| 2 | Migrate lib-side status-string writers | Small | unit | Task 1 | 0 create, 2 modify |
| 3 | lib/diagnostics/event-schemas.mjs | Medium | unit | — | 1 create, 0 modify |
| 4 | lib/diagnostics/index.mjs engine | Large | unit | — | 1 create, 0 modify |
| 5 | tier1/event-schema-valid.mjs | Medium | unit | Tasks 3, 4 | 1 create, 0 modify |
| 6 | tier1/status-enum-legal.mjs | Small | unit | Tasks 1, 4 | 1 create, 0 modify |
| 7 | tier1/frontmatter-present.mjs | Small | unit | Task 4 | 1 create, 0 modify |
| 8 | Scaffold governance/diagnostics.yaml + template | Small | unit | Task 4 | 2 create, 1 modify |
| 9 | Engine tests (containment, timeout, redaction, duplicates) | Large | unit | Task 4 | 1 create, +fixtures |
| 10 | Producer tests | Medium | unit | Tasks 5, 6, 7 | 3 create |
| 11 | Update normaliseEventInPlace docstring | Small | unit | — | 0 create, 1 modify |
| 12 | Skill-side prose updates (5 SKILL.md files) | Small | unit | Task 1 | 0 create, 5 modify |

---

## Test Infrastructure Requirements

None. All tests use `node:test` against in-tree fixtures. The containment tests create symlinks in a temp directory; the timeout tests use deliberately-slow/hung runners. No external systems.

---

### Task 1: Extract lib/spec-status.mjs [specialist: none]

**Charter capability:** Tier-1 producers (v1 set) — shared enum prerequisite
**Strategy:** unit
**Files:**
- Create: `lib/spec-status.mjs`
- Test: `tests/lib/spec-status.test.mjs`

**Tests:** verifies exported `SPEC_STATUSES` array contents, frozen-ness, and `assertLegalStatus()` throw behavior.

- [ ] **Write failing test** — node:test asserting `SPEC_STATUSES` is a 7-element frozen array and `assertLegalStatus('review-passed')` returns `void` while `assertLegalStatus('bogus')` throws `SPEC_STATUS_INVALID`.
- [ ] **Verify fails** — module doesn't exist yet.
- [ ] **Implement** — `export const SPEC_STATUSES = Object.freeze(['draft', 'review-pending', 'review-passed', 'review-blocked', 'implemented', 'validated', 'superseded']); export function assertLegalStatus(v) { if (!SPEC_STATUSES.includes(v)) throw mkErr('SPEC_STATUS_INVALID', ...); }`. Reuse the existing `mkErr` pattern from `lib/lifecycle-state.mjs`.
- [ ] **Verify passes.**
- [ ] **Commit:** `feat(lib): extract SPEC_STATUSES + assertLegalStatus to lib/spec-status.mjs`

---

### Task 2: Migrate lib-side status-string writers [specialist: none]

**Charter capability:** Tier-1 producers (v1 set) — eliminate divergence
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/meta-tools.mjs:117` (JSDoc), `lib/reality-check.mjs:319-330` (assignment sites)
- **Re-grep at implementation time** (`grep -rn "'review-passed'\|'review-blocked'\|'review-pending'\|'implemented'\|'validated'\|'superseded'" lib/`); migrate whatever the grep returns, not the spec-authoring-time list.

**Tests:** existing `tests/lib/meta-tools.test.mjs` and `tests/lib/reality-check.test.mjs` must continue to pass after migration. Add a regression test asserting no bare literals remain (use the grep pattern as a test).

- [ ] **Write failing regression test** — `tests/lib/spec-status-no-bare-literals.test.mjs`: walks `lib/**/*.mjs` and asserts no file except `lib/spec-status.mjs` contains any of the six multi-word literals as a bare string.
- [ ] **Verify fails** — current `lib/meta-tools.mjs:117` and `lib/reality-check.mjs` will trip the regex.
- [ ] **Implement** — replace `'review-passed'` etc. with `SPEC_STATUSES[i]` (or named constants if a `STATUS_REVIEW_PASSED = SPEC_STATUSES[2]` pattern reads more clearly). Update JSDoc comments to point at `lib/spec-status.mjs`.
- [ ] **Verify passes** — both the regression test and existing tests.
- [ ] **Commit:** `refactor(lib): migrate spec-status string literals to lib/spec-status.mjs`

---

### Task 3: lib/diagnostics/event-schemas.mjs [specialist: none]

**Charter capability:** Tier-1 producers (v1 set) — event-schema-valid input
**Strategy:** unit
**Files:**
- Create: `lib/diagnostics/event-schemas.mjs`
- Test: `tests/diagnostics/event-schemas.test.mjs`

**Tests:** assert (a) `KNOWN_EVENT_TYPES` enumerates the six types, (b) each known type has a required-field schema entry, (c) shapes match the writers in `lib/lifecycle-state.mjs` (cross-check via a property test).

- [ ] **Read** `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` event-shape section.
- [ ] **Read** `lib/lifecycle-state.mjs:423-575` for actual emitter shapes.
- [ ] **Write failing tests** — assertions per above.
- [ ] **Implement** — export `KNOWN_EVENT_TYPES` + per-type map. Required-field schemas per the canonical event-log spec (mechanical mirror).
- [ ] **Verify passes.**
- [ ] **Commit:** `feat(diagnostics): event-schemas.mjs (KNOWN_EVENT_TYPES + per-type schemas)`

---

### Task 4: lib/diagnostics/index.mjs engine [specialist: none]

**Charter capability:** Diagnostic registry engine (`lib/diagnostics/index.mjs`)
**Strategy:** unit
**Files:**
- Create: `lib/diagnostics/index.mjs` exporting `runDiagnostics({...})`, `loadRegistry(projectRoot)`, and internal helpers for path resolution, timeout, redaction.

**Tests:** in Task 9 (split out for readability — engine test file is large).

**Implementation outline:**

1. `loadRegistry(projectRoot)` — read `governance/diagnostics.yaml`, validate each entry shape against the registry schema (`id`, `runner`, `severity`, `tier`, `scope`), apply containment guard (Behavior 2 Steps A–D), return `{ entries, errors }`. First-wins on duplicate IDs.
2. `runDiagnostics({ projectRoot, spec, tier, only, scope })` — filter entries by tier / only / scope, invoke each runner under `Promise.race` with 500 ms timeout, apply message redaction to all surfaced strings, aggregate into `{ fired, skipped, errors }`.
3. Containment helper (private): `assertRunnerContained(runner, { realPluginDiagRoot, realProjectDiagRoot })` implementing Steps A–D verbatim. Pure-string-prefix containment is forbidden — use `fs.realpathSync` and `path.sep` joins.
4. Timeout helper (private): `runWithTimeout(promiseFn, ms, sentinelId)` → uses `Promise.race`; on timeout, emits sentinel verdict and returns; abandoned promise still runs in event loop but engine has already moved on.
5. Redaction helper (private): `normaliseMessage(msg, { realProjectRoot, realPluginRoot, home })` → 4-form rewrite per Behavior 3.

Total LoC estimate: 250–350 lines. Comments per the constitution's "non-obvious WHY" rule — call out the realpath / containment / TOCTOU caveats inline.

- [ ] **Write skeleton + module exports.**
- [ ] **Implement `loadRegistry`** including containment (Steps A–D).
- [ ] **Implement `runDiagnostics`** including dispatch, `Promise.race`, redaction, aggregation.
- [ ] **Verify tests pass** (Task 9 tests).
- [ ] **Commit:** `feat(diagnostics): runDiagnostics + loadRegistry with containment, timeout, redaction`

---

### Task 5: tier1/event-schema-valid.mjs [specialist: none]

**Charter capability:** Tier-1 producers (v1 set)
**Strategy:** unit
**Depends on:** Tasks 3, 4
**Files:**
- Create: `lib/diagnostics/tier1/event-schema-valid.mjs` exporting `run({ projectRoot, spec, event })`.
- Test: in Task 10.

**Implementation outline:** import `KNOWN_EVENT_TYPES` + per-type schema from `event-schemas.mjs`. Validate discriminator first (error severity on unknown). For known discriminator, validate required-field presence + primitive types. Extra fields pass through. Return `{ fired: true, id: 'adev/event-schema-valid', severity: 'error', message: ... }` or `{ fired: false }`.

- [ ] Write tests (Task 10).
- [ ] Implement runner.
- [ ] **Commit:** `feat(diagnostics/tier1): event-schema-valid (closed discriminator / open shape)`

---

### Task 6: tier1/status-enum-legal.mjs [specialist: none]

**Charter capability:** Tier-1 producers (v1 set)
**Strategy:** unit
**Depends on:** Tasks 1, 4
**Files:**
- Create: `lib/diagnostics/tier1/status-enum-legal.mjs`.
- Test: in Task 10.

**Implementation outline:** import `SPEC_STATUSES` from `lib/spec-status.mjs` (must NOT inline the seven values). Parse the spec's frontmatter `status:` field. If absent, emit `{ fired: false }` (the frontmatter-present producer is responsible for missing-frontmatter case). If present and outside the enum, emit `{ fired: true, id: 'adev/status-enum-legal', severity: 'error', message: 'spec status "<v>" is not in SPEC_STATUSES' }`.

- [ ] Write tests + implement + commit.

---

### Task 7: tier1/frontmatter-present.mjs [specialist: none]

**Charter capability:** Tier-1 producers (v1 set)
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Create: `lib/diagnostics/tier1/frontmatter-present.mjs`.
- Test: in Task 10.

**Implementation outline:** read the artifact file. Assert the first non-empty line is `---` and that the YAML block between `---` markers parses (use existing parser in `lib/manifest.mjs` style, or extract a shared YAML helper if needed — but stay zero-dep per Constitution Principle 1). Works on `.spec.md`, `.charter.md`, `.review.md`, `.validate.md` (the spec's AC explicitly mentions all four).

- [ ] Write tests + implement + commit.

---

### Task 8: Scaffold governance/diagnostics.yaml + template [specialist: none]

**Charter capability:** `governance/diagnostics.yaml` schema + initial scaffold
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Create: `.context-index/governance/diagnostics.yaml` (in-repo for this project)
- Create: `templates/diagnostics-template.yaml` (for `/adev:init` to scaffold into new projects; byte-equivalent to the in-repo file)
- Modify: `cli/index.mjs::scaffoldContextKit` — add `diagnostics-template.yaml` → `governance/diagnostics.yaml` to the templates array (around line 211)

**Tests:** `tests/cli.test.mjs` (extend) — assert fresh `adev install` produces `.context-index/governance/diagnostics.yaml` with the 3 Tier-1 entries.

- [ ] Author `governance/diagnostics.yaml` with 3 entries (`adev/event-schema-valid`, `adev/status-enum-legal`, `adev/frontmatter-present`), each with `id`, `runner` (using `plugin:` prefix per Behavior 2 Step B), `severity: error`, `tier: 1`, `scope: event-impact`.
- [ ] Mirror to `templates/diagnostics-template.yaml`.
- [ ] Add to `scaffoldContextKit` templates list.
- [ ] Test the install path.
- [ ] **Commit:** `feat(diagnostics): scaffold governance/diagnostics.yaml + template`

---

### Task 9: Engine tests [specialist: none]

**Charter capability:** Diagnostic registry engine (test discipline)
**Strategy:** unit
**Depends on:** Task 4
**Files:**
- Create: `tests/diagnostics/registry.test.mjs`
- Create: `tests/diagnostics/fixtures/runners/*.mjs` (slow, hung, throwing, escape-attempt, conforming runners)

**Test cases (one or more `test()` per AC bullet):**

1. **Containment (6 cases per AC):** (i) symlink-escape rejection — create a symlink inside `lib/diagnostics/` pointing to `node_modules/x/y.mjs`; expect SCHEMA_INVALID. (ii) `..` traversal rejection — entry like `plugin:../../etc/passwd` rejected at Step A. (iii) absolute path rejection — entry like `/etc/passwd` rejected. (iv) cross-root deputy rejection — symlink inside `projectRoot` pointing into `pluginRoot`; expect SCHEMA_INVALID. (v) legitimate `plugin:` runner admitted. (vi) legitimate `project:` runner admitted.
2. **Timeout (3 cases per AC):** (i) slow runner (~250 ms) emits `adev/diagnostic-slow` (info) but completes; (ii) hung runner (`new Promise(() => {})`) is abandoned within ~600 ms and emits `adev/diagnostic-timeout` (error); (iii) engine continues to invoke remaining runners after a timeout.
3. **Redaction (3 cases per AC):** (i) throwing runner with absolute path under projectRoot → message starts with `project:`; (ii) absolute path under `$HOME` → message contains `~/`; (iii) external path → message contains `<external-path-redacted>`. All three: no `at ` stack-frame markers in `errors[].message`.
4. **First-wins duplicate:** two entries with same `id`; engine uses the first, emits `adev/diagnostic-duplicate-id` warning for the dropped one.
5. **Missing runner:** entry points to nonexistent file → `adev/diagnostic-runner-missing` (warning); engine continues.
6. **Tier filter:** `runDiagnostics({ tier: 1 })` filters to tier-1 entries only.
7. **Scope filter:** `runDiagnostics({ tier: 1, scope: 'event-impact' })` skips broader scopes silently.
8. **`only` allowlist:** `runDiagnostics({ tier: 1, only: ['adev/event-schema-valid'] })` runs only that producer.
9. **Response shape:** `{ fired, skipped, errors }` always present, even on empty registry.
10. **Empty/missing registry:** `governance/diagnostics.yaml` missing → returns shape with `adev/registry-missing` warning in `errors`.

- [ ] Write all tests.
- [ ] Run; verify all PASS against the Task 4 implementation.
- [ ] **Commit:** `test(diagnostics): engine coverage (containment, timeout, redaction, filters)`

---

### Task 10: Producer tests [specialist: none]

**Charter capability:** Tier-1 producers (v1 set) — test discipline
**Strategy:** unit
**Depends on:** Tasks 5, 6, 7
**Files:**
- Create: `tests/diagnostics/tier1/event-schema-valid.test.mjs`
- Create: `tests/diagnostics/tier1/status-enum-legal.test.mjs`
- Create: `tests/diagnostics/tier1/frontmatter-present.test.mjs`

**event-schema-valid tests:** all 6 known types accepted with valid required fields; unknown discriminator rejected (error); known type with missing required field rejected (error); extra fields permitted.

**status-enum-legal tests:** all 7 legal values accepted; out-of-enum value rejected (error); missing status field → not fired (different producer's responsibility).

**frontmatter-present tests:** runs against `.spec.md`, `.charter.md`, `.review.md`, `.validate.md`; missing leading `---` rejected; malformed YAML rejected; valid frontmatter accepted.

- [ ] Write all three test files.
- [ ] Verify PASS.
- [ ] **Commit:** `test(diagnostics/tier1): per-producer coverage`

---

### Task 11: Update normaliseEventInPlace docstring [specialist: none]

**Charter capability:** Tier-1 producers (v1 set) — lib coordination
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs:165-190` (JSDoc block)

**Tests:** `tests/lib/lifecycle-state.test.mjs` (extend) — assert docstring contains the new "closed-discriminator / mode-dependent" wording.

- [ ] Edit the docstring; mark `StateProjection.unknownEvents[]` as deprecated.
- [ ] Add test.
- [ ] **Commit:** `docs(lib): update normaliseEventInPlace docstring for closed-discriminator stance`

---

### Task 12: Skill-side prose updates [specialist: none]

**Charter capability:** Tier-1 producers (v1 set) — skill discipline
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `skills/specify/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/implement/SKILL.md`, `skills/validate/SKILL.md`, `skills/hygiene/SKILL.md`

**Tests:** none (documentation discipline). Optionally a grep-based regression test that asserts each of the 5 skills cites `lib/spec-status.mjs`.

- [ ] For each of the 5 skills, find the section where status values are referenced (e.g., the "After Validation" status promotion block in validate, the BLOCK status-update block in review-specs). Replace any inlined list with a single line: "Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`."
- [ ] Where individual transitions are described (e.g., `implemented → validated` in validate), keep the literal name in prose since the prose describes a specific transition.
- [ ] **Commit:** `docs(skills): cite lib/spec-status.mjs as canonical SPEC_STATUSES source`

---

## Quality Gates

- `npm test` — all new tests pass + existing tests preserved (no regressions)
- Manual smoke: scaffold a temp project via `adev install`, confirm `governance/diagnostics.yaml` lands with 3 entries
- Manual smoke: write a fixture spec with status `bogus`, run `runDiagnostics` programmatically, confirm `adev/status-enum-legal` fires error
- `/adev:validate --spec .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md`
