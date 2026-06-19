# Implementation Plan: First-Class Spec Amendments

> **Methodology:** adev
> **Charter:** cross-cutting (affects: lifecycle-artifacts, spec-lifecycle, agent-reliable-state-artifacts, cli-driver-surface)
> **Spec:** .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
> **Review:** PASS_WITH_NOTES (2026-06-19)
> **Platform:** Node.js (ESM, `.mjs`), npm, `node:test`; zero external dependencies

**Goal:** Give adev a first-class, machine-readable way to amend an already-shipped (validated) spec via a governed `amends:` + `target-revision:` relationship field, an `adev specify amend` CLI verb, a `spec_amended` lifecycle event, and status/hygiene traversal — without editing the base in place and without touching the closed `kind:` enum or the `slugFromSpec` `.spec.md` contract.

**Architecture:** A new `lib/specify-amend.mjs` mirrors the existing `lib/specify-revise.mjs` pattern (minimal frontmatter parse, path-containment via `assertWithin`, atomic temp-then-rename) but produces a **new co-located artifact** rather than mutating the base. A new `spec_amended` discriminator is added to the canonical event set (`lib/lifecycle-events.mjs::CANONICAL_EVENTS`) and its strict required-field schema to `lib/diagnostics/event-schemas.mjs`, with a `reportSpecAmended()` emitter in `lib/lifecycle-state.mjs` writing to the **base** spec's log. ADR-0009 is amended to record that amendment is a relationship overlay (not a 7th `kind:`). Status and hygiene gain shared amendment-graph traversal (effective-revision computation, dangling/incomplete/cycle findings). The `adev specify amend` subcommand wraps the lib following the `lib/cli/specify.mjs` dispatch shape, and `skills/specify/SKILL.md` gains a markdown-only `--amend` workflow axis naming the verb.

---

## Architecture Boundary Notes (from review PASS_WITH_NOTES)

Two changes touch architecture boundaries flagged in the spec's System Constitution Reference. **Reviewers confirmed both are intentional and human-approved**, not silent violations:

1. **Amending ADR-0009** (Task 7) — documents the amendment-relationship-overlay decision. Human-approved per the spec and the review verdict.
2. **Adding `spec_amended` to `CANONICAL_EVENTS`** (Task 2) — touches the lifecycle event schema governed by ADR-0009. Human-approved per the spec and the review verdict.

Both tasks below carry a `[BOUNDARY: human-approved]` marker so `/adev:implement` and `/adev:validate` treat them as sanctioned taxonomy changes rather than boundary violations.

**Folded review notes** (PASS_WITH_NOTES → tasks):
- **SA-1** (event-schema field strictness) → folded into **Task 2**: pin the exact required/optional `spec_amended` fields in `lib/diagnostics/event-schemas.mjs`, mirroring sibling CANONICAL_EVENTS schema validation, with a strict `reportSpecAmended()` emitter.
- **SA-2** (effective-revision for non-validated amendments) → folded into **Task 6**: make explicit that effective revision is computed from **validated** amendments only, and define how in-progress/unvalidated amendments are reported.
- **SEC-1** (descriptor sanitization) → folded into **Task 3**: sanitize the author-supplied `<descriptor>` at scaffold time against the kebab-case allowlist with a dedicated error code, rejecting path-traversal / illegal chars before constructing the amendment filename.

---

## File Structure

**Create:**
- `lib/specify-amend.mjs` — Amendment scaffolder: base resolution, descriptor sanitization, target-revision computation, co-located naming, atomic write, `spec_amended` emission, path containment. Mirrors `lib/specify-revise.mjs`.
- `lib/amendment-graph.mjs` — Shared amendment-graph traversal consumed by status + hygiene: read `amends:`/`target-revision:`, resolve base, compute effective revision, detect cycles, emit dangling/incomplete findings.
- `lib/cli/specify.mjs` — **already exists** (revise verb); `amend` subcommand is added there (see Modify).
- `tests/specify-amend.test.mjs` — Scaffold, frontmatter, descriptor sanitization, target-revision, path-containment, event emission, `--kind amendment` rejection, flag mutual-exclusion.
- `tests/amendment-graph.test.mjs` — Effective-revision (validated-only), chain, cycle (`AMENDMENT_CYCLE`), dangling, incomplete-link traversal.
- `tests/lifecycle/spec-amended-event.test.mjs` — `spec_amended` discriminator membership, required-field schema strictness, `reportSpecAmended()` emitter validation.

**Modify:**
- `lib/lifecycle-events.mjs` — add `'spec_amended'` to the `CANONICAL_EVENTS` set with an explanatory comment block (mirrors `spec_revised`). **[BOUNDARY: human-approved]**
- `lib/diagnostics/event-schemas.mjs` — add `spec_amended` entry to `REQUIRED_FIELDS_BY_EVENT` with the SA-1 pinned required fields + descriptive comment. **[BOUNDARY: human-approved]**
- `lib/lifecycle-state.mjs` — add `reportSpecAmended(projectRoot, baseSpecPath, args)` emitter (mirrors `reportSpecRevised`, lib:1068) writing to the **base** spec's log.
- `lib/cli/specify.mjs` — add `amend` to the subcommand dispatch (`sub === 'amend'` branch), arg parsing, flag mutual-exclusion, descriptor flag, JSON-line output; extend `help()`.
- `skills/specify/SKILL.md` — add `--amend <base-spec>` row to the arguments table, an orthogonality note, mutual-exclusion sentence, and an `## Amend Mode (--amend <base-spec>)` step-set naming `adev specify amend` (markdown-only, no inline Node).
- `lib/cli/status.mjs` (or the status query lib it dispatches to) — surface base↔amendment relationship + effective revision via `lib/amendment-graph.mjs`.
- `lib/cli/hygiene/*` — add an amendment-audit pass emitting `DANGLING_AMENDMENT`, `INCOMPLETE_AMENDMENT_LINK`, `AMENDMENT_CYCLE` via `lib/amendment-graph.mjs`.
- `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` — append an amendment section recording the relationship-overlay decision + intentional `--kind amendment` rejection. **[BOUNDARY: human-approved]**
- `templates/spec-template.behavioral.md` (and the amendment-relevant template[s]) — document the `amends:` + `target-revision:` frontmatter fields as commented optional fields.

**Reference (read, do not modify):**
- `lib/specify-revise.mjs` — primary pattern to mirror for `lib/specify-amend.mjs` (frontmatter parse, `assertWithin`, atomic temp-then-rename, event emission, error-code style).
- `lib/cli/specify.mjs` (revise dispatch) — pattern for the `amend` subcommand wiring.
- `lib/lifecycle-state.mjs:1068-1097` (`reportSpecRevised`) — pattern for `reportSpecAmended`.
- `lib/diagnostics/event-schemas.mjs:149-170` (`spec_revised` schema) — pattern for the `spec_amended` schema entry.
- `lib/kinds.mjs` (`SPEC_KINDS`, `isValidKind`, `INVALID_KIND`) — the closed enum and the existing `INVALID_KIND` thrower reused by `--kind amendment` rejection.
- `lib/lifecycle-state.mjs:64` (`slugFromSpec`) — confirm it is **unchanged**; amendments keep `.spec.md`.
- `lib/workspace.mjs:376` (`validateModuleName`) — kebab/slug allowlist reference for descriptor sanitization.
- `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` §1, §7 — closed-enum + accepted-deviation precedent.

---

## Context Packets

### Task 1 Context (Frontmatter contract + templates)
- Spec: `.context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md` (Behaviors 2, 8; AC 1)
- Source: `templates/spec-template.behavioral.md` (full read), sibling templates (signatures of frontmatter blocks)
- ADR: `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` §1, §2 (decision + closed-enum rationale)

### Task 2 Context (`spec_amended` event)
- Spec: spec-amendment-artifacts (Behavior 4; AC 3) — payload `{ amendment_slug, amendment_path, target_revision }`
- Source: `lib/lifecycle-events.mjs` (full), `lib/diagnostics/event-schemas.mjs:90-172` (full — `spec_revised` schema to mirror), `lib/lifecycle-state.mjs:1068-1097` (`reportSpecRevised` to mirror)
- Cross-cutting: `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (event-log authority — the spec that wins on divergence)
- Note: SA-1 — pin required/optional fields precisely; the spec is the schema authority.

### Task 3 Context (`lib/specify-amend.mjs`)
- Spec: spec-amendment-artifacts (Behaviors 1, 2, 3, 4; Error Cases `INVALID_AMENDMENT_BASE`, `INVALID_SPEC_PATH`, `INVALID_TARGET_REVISION`; AC 1, 2, 3)
- Source: `lib/specify-revise.mjs` (full — primary mirror), `lib/lifecycle-state.mjs` (`appendEvent`, `reportSpecAmended`), `lib/partial-artifact.mjs` (`assertWithin`), `lib/workspace.mjs:376` (`validateModuleName` for SEC-1 descriptor allowlist), `lib/kinds.mjs` (`defaultKindFor`/base-kind inheritance)
- Note: SEC-1 — sanitize `<descriptor>` before constructing the filename; dedicated error code.

### Task 4 Context (`adev specify amend` verb)
- Spec: spec-amendment-artifacts (Behaviors 1, 10; Error Cases `INVALID_KIND`, `CONFLICTING_FLAGS`; AC 1, 4, 7)
- Source: `lib/cli/specify.mjs` (full — revise dispatch to extend), `lib/specify-amend.mjs` (Task 3 output), `cli/index.mjs:1677` (verb already registered — no new registration)
- Note: `--amend` mutually exclusive with `--revise`/`--extract`/`--refactor`/`--from-diff`/`--cross-cutting`.

### Task 5 Context (`/adev:specify --amend` surface)
- Spec: spec-amendment-artifacts (Behavior 1; AC 8 — SKILL.md no inline Node)
- Source: `skills/specify/SKILL.md` (Revise Mode section L892+, arguments table L18-22, orthogonality note L24-33 — patterns to mirror)
- Constitution: cli-driver-surface anti-pattern (no inline Node; name the verb only)

### Task 6 Context (status / hygiene traversal)
- Spec: spec-amendment-artifacts (Behaviors 5, 6, 7, 8, 9; Error Cases `DANGLING_AMENDMENT`, `INCOMPLETE_AMENDMENT_LINK`, `AMENDMENT_CYCLE`; AC 5, 6)
- Source: `lib/amendment-graph.mjs` (this task's primary output), `lib/cli/status.mjs`, `lib/cli/hygiene/*`, `lib/spec-status.mjs` (`SPEC_STATUSES` — to identify `validated` status for SA-2)
- Note: SA-2 — effective revision = `max(base.revision, highest target-revision among **validated** amendments)`; in-progress/unvalidated amendments are reported in the relationship line but excluded from the effective-revision max.

### Task 7 Context (ADR-0009 amendment)
- Spec: spec-amendment-artifacts (Relationship to prior decisions; Behavior 10; AC 8)
- Source: `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` (full — §7 accepted-deviation precedent for amendment-section style)

### Task 8 Context (Tests)
- Spec: all behaviors + every Error Case row + all acceptance criteria
- Source: `tests/` (existing test style; `node:test` patterns), all task outputs above
- Note: each prior task ships its own RED test; this task adds cross-cutting integration coverage (full scaffold→event→traversal round-trip, cycle/dangling/incomplete error paths).

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

The retrieved cross-cutting heuristics concern token-cost measurement and skill-output summarization (session-JSONL measurement, cache-read cost dominance, summarized-output artifact parity). They are not directly actionable for this lib/CLI implementation work but inform keeping subagent returns terse during `/adev:implement`.

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 — Task 1 establishes the frontmatter contract that Task 2's event payload references; Task 2 lands the `spec_amended` event that Task 3 consumes.
- **Group B (sequential, depends on A):** Task 3 → Task 4 → Task 5 — the lib, then its CLI verb, then the skill surface. All three touch the amend scaffolding path.
- **Group C (depends on Task 2 + Task 1):** Task 6 — status/hygiene traversal; reads frontmatter (Task 1) and amendment events but shares no files with Group B (`lib/amendment-graph.mjs` is new).
- **Group D (independent):** Task 7 — ADR-0009 amendment; doc-only, no code overlap.
- **Group E (last):** Task 8 — cross-cutting integration tests; depends on all prior tasks.

Group D (Task 7) can run in parallel with everything. Group C (Task 6) can run in parallel with Group B once Group A is done.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Frontmatter contract + templates | small | unit | — | 0 create, 2 modify |
| 2 | `spec_amended` lifecycle event `[BOUNDARY]` | medium | unit | Task 1 | 1 create, 3 modify |
| 3 | `lib/specify-amend.mjs` scaffolder (SEC-1) | medium | unit | Task 1, Task 2 | 1 create, 0 modify |
| 4 | `adev specify amend` CLI verb | small | unit | Task 3 | 0 create, 1 modify |
| 5 | `/adev:specify --amend` skill surface | small | unit | Task 4 | 0 create, 1 modify |
| 6 | status / hygiene traversal (SA-2) | medium | unit | Task 1, Task 2 | 2 create, 2 modify |
| 7 | ADR-0009 amendment `[BOUNDARY]` | small | unit | — | 0 create, 1 modify |
| 8 | Integration tests | medium | unit | Tasks 1-7 | 1 create, 0 modify |

> All tasks resolve to the `unit` strategy (source: fallback) — pure Node.js
> `node:test` with no external infrastructure. Strategy Summary and Test
> Infrastructure Requirements sections are omitted (backward compatible).

---

## Tasks

### Task 1: Frontmatter contract + templates [specialist: none]

**Charter capability:** lifecycle-artifacts — define the `amends:` + `target-revision:` frontmatter contract.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/spec-template.behavioral.md` — document `amends:` + `target-revision:` as commented optional frontmatter fields
- Modify: `lib/kinds.mjs` — (no enum change) confirm/comment that `kind:` stays closed at 6; amendment is a relationship overlay, not a kind
- Test: `tests/amendment-graph.test.mjs` (frontmatter-parse cases; shared with Task 6)

**Tests:** `tests/amendment-graph.test.mjs` — assert the frontmatter parser reads `amends:` + `target-revision:` as a paired contract and that exactly-one-present is detectable.

**Context to load:** spec Behaviors 2 & 8; ADR-0009 §1-§2; `templates/spec-template.behavioral.md`.

- [ ] **Write failing test** — parse a spec carrying both `amends:` and `target-revision:`; expect both fields surfaced. Parse a spec carrying only `amends:`; expect an incomplete-link signal.
- [ ] **Verify test fails** — Run: `node --test tests/amendment-graph.test.mjs` → FAIL (parser/helper not defined).
- [ ] **Implement** — add the documented fields to the template; ensure the (Task 6) frontmatter reader recognizes the pair. No `kind:` enum change.
- [ ] **Verify test passes** — Run: `node --test tests/amendment-graph.test.mjs` → PASS.
- [ ] **Commit**
  Branch: `feat/lifecycle-artifacts/amendment-frontmatter`
  ```bash
  git add templates/spec-template.behavioral.md lib/kinds.mjs tests/amendment-graph.test.mjs
  git commit -m "feat(lifecycle-artifacts): document amends/target-revision frontmatter contract

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 1"
  ```

### Task 2: `spec_amended` lifecycle event [specialist: none] [BOUNDARY: human-approved]

**Charter capability:** agent-reliable-state-artifacts — add `spec_amended` to `CANONICAL_EVENTS` + its schema + emitter.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-events.mjs` — add `'spec_amended'` to `CANONICAL_EVENTS`
- Modify: `lib/diagnostics/event-schemas.mjs` — add `spec_amended` to `REQUIRED_FIELDS_BY_EVENT` (SA-1)
- Modify: `lib/lifecycle-state.mjs` — add `reportSpecAmended(projectRoot, baseSpecPath, args)` emitter
- Create + Test: `tests/lifecycle/spec-amended-event.test.mjs`

**Tests:** `tests/lifecycle/spec-amended-event.test.mjs`

**SA-1 (pinned schema, folded review note):** Mirror the `spec_revised` entry. The `spec_amended` event payload is, per Behavior 4, `{ amendment_slug, amendment_path, target_revision }`. Required fields (in addition to the universal `event` + `ts`): `amendment_slug` (string), `amendment_path` (string, project-root-relative), `target_revision` (integer ≥ 2). No optional fields beyond pass-through. `reportSpecAmended()` validates each field's primitive type and rejects with `EVENT_SCHEMA_INVALID` on any failure, exactly as `reportSpecRevised` does (lib:1068). The event is written to the **base** spec's log (the `specPath` argument is the base spec path).

**[BOUNDARY: human-approved]** Adding a canonical event touches the lifecycle event schema governed by ADR-0009. Confirmed intentional and human-approved by reviewers (PASS_WITH_NOTES). Task 7 records the decision in the ADR.

**Context to load:** spec Behavior 4 & AC 3; `lib/lifecycle-events.mjs`; `lib/diagnostics/event-schemas.mjs:149-170`; `lib/lifecycle-state.mjs:1068-1097`.

- [ ] **Write failing test** — assert `isKnownEventType('spec_amended')` is `true`; assert `getRequiredFields('spec_amended')` lists the SA-1 fields; assert `reportSpecAmended` appends a well-formed event to the base log and throws `EVENT_SCHEMA_INVALID` on a missing/mistyped field.
- [ ] **Verify test fails** — Run: `node --test tests/lifecycle/spec-amended-event.test.mjs` → FAIL (`spec_amended` unknown; emitter undefined).
- [ ] **Implement** — add the discriminator, the schema entry, and the emitter (mirror `reportSpecRevised`).
- [ ] **Verify test passes** — Run: `node --test tests/lifecycle/spec-amended-event.test.mjs` → PASS.
- [ ] **Commit**
  Branch: `feat/lifecycle-artifacts/amendment-frontmatter`
  ```bash
  git add lib/lifecycle-events.mjs lib/diagnostics/event-schemas.mjs lib/lifecycle-state.mjs tests/lifecycle/spec-amended-event.test.mjs
  git commit -m "feat(agent-reliable-state-artifacts): add spec_amended canonical event + schema + emitter

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 2"
  ```

### Task 3: `lib/specify-amend.mjs` scaffolder [specialist: none]

**Charter capability:** cli-driver-surface — base resolution, target-revision computation, co-located naming, atomic write, event emission, path containment.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `lib/specify-amend.mjs`
- Create + Test: `tests/specify-amend.test.mjs`

**Tests:** `tests/specify-amend.test.mjs`

**SEC-1 (descriptor sanitization, folded review note):** Before constructing the amendment filename, sanitize the author-supplied `<descriptor>` against the project's kebab-case allowlist (reuse the `validateModuleName` allowlist from `lib/workspace.mjs:376`, or a stricter `^[a-z0-9]+(-[a-z0-9]+)*$` kebab pattern). Reject path-traversal sequences (`..`, `/`, leading/trailing/`--` separators) and any illegal character with a dedicated error code **`INVALID_AMENDMENT_DESCRIPTOR`** *before* the path is built. This prevents a malicious/typo descriptor from escaping `<base-dir>`.

**Behavior coverage:** Behavior 1 (co-located `<base-stem>-rev-<target>-<descriptor>.spec.md`), Behavior 2 (frontmatter: `amends:`, `target-revision:`, inherited/overridable `kind:`, `revision: 1`, `status: review-pending`), Behavior 3 (`target-revision = base.revision + 1`, override must be strictly greater → else `INVALID_TARGET_REVISION`), Behavior 4 (emit `spec_amended` on base log via `reportSpecAmended`). Error cases: `INVALID_AMENDMENT_BASE` (base missing), `INVALID_SPEC_PATH` (out-of-root via `assertWithin`), `INVALID_TARGET_REVISION`, `INVALID_AMENDMENT_DESCRIPTOR` (SEC-1). Atomic temp-then-rename; `slugFromSpec` unchanged (amendment keeps `.spec.md`).

**Context to load:** spec Behaviors 1-4 + error cases; `lib/specify-revise.mjs` (full mirror); `lib/partial-artifact.mjs` (`assertWithin`); `lib/workspace.mjs:376`; `lib/kinds.mjs`.

- [ ] **Write failing test** — happy path (file created at co-located path with correct frontmatter + `spec_amended` on base log); `INVALID_AMENDMENT_BASE`; `INVALID_TARGET_REVISION` (override ≤ base); `INVALID_AMENDMENT_DESCRIPTOR` for `../evil`, `foo/bar`, `Foo_Bar`; base file is NOT modified.
- [ ] **Verify test fails** — Run: `node --test tests/specify-amend.test.mjs` → FAIL (`amendSpec` not defined).
- [ ] **Implement** — author `lib/specify-amend.mjs` mirroring `specify-revise.mjs` structure.
- [ ] **Verify test passes** — Run: `node --test tests/specify-amend.test.mjs` → PASS.
- [ ] **Commit**
  Branch: `feat/cli-driver-surface/specify-amend`
  ```bash
  git add lib/specify-amend.mjs tests/specify-amend.test.mjs
  git commit -m "feat(cli-driver-surface): add lib/specify-amend.mjs amendment scaffolder

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 3"
  ```

### Task 4: `adev specify amend` CLI verb [specialist: none]

**Charter capability:** cli-driver-surface — CLI subcommand wrapping the lib; flag mutual-exclusion.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/cli/specify.mjs` — add the `amend` subcommand branch + `help()` text
- Test: `tests/specify-amend.test.mjs` (CLI-level cases appended) or a `tests/cli/specify-amend.test.mjs` sibling

**Tests:** `tests/specify-amend.test.mjs`

**Coverage:** dispatch `sub === 'amend'`; parse `--spec`, `--descriptor`, `--kind`, `--target-revision`; reject `--kind amendment` with the closed-enum `INVALID_KIND` (Behavior 10, reuse `lib/kinds.mjs`); enforce `--amend` mutual-exclusion with `--revise`/`--extract`/`--refactor`/`--from-diff`/`--cross-cutting` → `CONFLICTING_FLAGS` (AC 7); path-containment re-assertion; JSON-line stdout (`{ amendment_path, target_revision, base_spec, ... }`). `cli/index.mjs:1677` already registers the `specify` verb — no new top-level registration.

**Context to load:** spec Behaviors 1 & 10, AC 4 & 7; `lib/cli/specify.mjs` (revise dispatch); `lib/specify-amend.mjs` (Task 3).

- [ ] **Write failing test** — `adev specify amend --spec <base> --descriptor foo` produces JSON output + the amendment file; `--kind amendment` exits non-zero with `INVALID_KIND`; `--amend` + `--revise` exits with `CONFLICTING_FLAGS`.
- [ ] **Verify test fails** — Run: `node --test tests/specify-amend.test.mjs` → FAIL (amend subcommand unhandled).
- [ ] **Implement** — extend `lib/cli/specify.mjs` dispatch + `help()`.
- [ ] **Verify test passes** — Run: `node --test tests/specify-amend.test.mjs` → PASS.
- [ ] **Commit**
  Branch: `feat/cli-driver-surface/specify-amend`
  ```bash
  git add lib/cli/specify.mjs tests/specify-amend.test.mjs
  git commit -m "feat(cli-driver-surface): add 'adev specify amend' subcommand

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 4"
  ```

### Task 5: `/adev:specify --amend` skill surface [specialist: none]

**Charter capability:** cli-driver-surface — skill workflow-axis prose naming the verb (no inline Node).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `skills/specify/SKILL.md` — arguments-table row, orthogonality + mutual-exclusion note, `## Amend Mode (--amend <base-spec>)` step-set
- Test: `tests/no-inline-node.test.mjs` (or the existing SKILL.md guard test) covers the no-inline-Node invariant

**Tests:** the repository's existing SKILL.md inline-Node guard test (e.g. `tests/no-inline-node.test.mjs` / pre-commit guard) — assert the new section names `adev specify amend` and contains no `node -e` / inline-Node directive.

**Coverage:** AC 8 (SKILL.md contains no inline Node). The new mode mirrors the Revise Mode section (L892+): add `--amend <base-spec>` to the arguments table, state it is mutually exclusive with the other workflow flags, and a step-set that names `adev specify amend --spec <base> [--descriptor <slug>] [--kind <kind>] [--target-revision <N>]` and describes prompting for `<descriptor>` when omitted. Markdown only — control flow lives in Task 3/4.

**Context to load:** spec Behavior 1, AC 8; `skills/specify/SKILL.md` (Revise Mode + arguments table); constitution cli-driver-surface anti-pattern.

- [ ] **Write failing test** — guard test asserts a `--amend` arguments row + an Amend Mode section exist and that no inline-Node pattern is present in the new section. (RED before editing.)
- [ ] **Verify test fails** — Run: `node --test tests/no-inline-node.test.mjs` (or the SKILL guard suite) → FAIL (section absent).
- [ ] **Implement** — add the markdown-only `--amend` axis + step-set.
- [ ] **Verify test passes** — Run the guard suite → PASS.
- [ ] **Commit**
  Branch: `feat/cli-driver-surface/specify-amend`
  ```bash
  git add skills/specify/SKILL.md
  git commit -m "feat(cli-driver-surface): add /adev:specify --amend workflow axis

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 5"
  ```

### Task 6: status / hygiene amendment traversal [specialist: none]

**Charter capability:** spec-lifecycle — `/adev:status` + `/adev:hygiene` traversal, effective-revision computation, dangling/incomplete/cycle findings.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `lib/amendment-graph.mjs` — shared traversal (resolve base, compute effective revision, detect cycle, classify dangling/incomplete)
- Create + Test: `tests/amendment-graph.test.mjs`
- Modify: `lib/cli/status.mjs` (or its query lib) — report base↔amendment relationship + effective revision
- Modify: `lib/cli/hygiene/*` — amendment-audit pass emitting the three findings

**Tests:** `tests/amendment-graph.test.mjs`

**SA-2 (effective revision for non-validated amendments, folded review note):** Effective revision is `max(base.revision, highest target-revision among **validated** amendments only)`. In-progress / unvalidated amendments (status not `validated` per `lib/spec-status.mjs::SPEC_STATUSES`) are **reported** in the relationship line (e.g. "amends `<base>` targeting rev `<N>`, status `<amendment-status>`") but are **excluded** from the effective-revision `max` computation. Document this explicitly in `lib/amendment-graph.mjs` and assert both halves in tests (a `review-pending` amendment does NOT raise effective revision; a `validated` one does). The base file is never silently rewritten (Behavior 6).

**Coverage:** Behavior 5 (relationship report), Behavior 6 (effective revision — SA-2), Behavior 7 (`DANGLING_AMENDMENT` non-fatal), Behavior 8 (`INCOMPLETE_AMENDMENT_LINK`), Behavior 9 (chain report + `AMENDMENT_CYCLE` halt). AC 5, AC 6.

**Context to load:** spec Behaviors 5-9 + error cases, AC 5-6; `lib/cli/status.mjs`; `lib/cli/hygiene/*`; `lib/spec-status.mjs` (`SPEC_STATUSES`).

- [ ] **Write failing test** — effective revision excludes a `review-pending` amendment, includes a `validated` one; cycle → `AMENDMENT_CYCLE` (no infinite loop); missing base → `DANGLING_AMENDMENT`; one-of-pair → `INCOMPLETE_AMENDMENT_LINK`; chain reported in order.
- [ ] **Verify test fails** — Run: `node --test tests/amendment-graph.test.mjs` → FAIL (module not defined).
- [ ] **Implement** — author `lib/amendment-graph.mjs`; wire into status + hygiene.
- [ ] **Verify test passes** — Run: `node --test tests/amendment-graph.test.mjs` → PASS.
- [ ] **Commit**
  Branch: `feat/spec-lifecycle/amendment-traversal`
  ```bash
  git add lib/amendment-graph.mjs lib/cli/status.mjs lib/cli/hygiene tests/amendment-graph.test.mjs
  git commit -m "feat(spec-lifecycle): traverse amends graph in status + hygiene with effective-revision

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 6"
  ```

### Task 7: ADR-0009 amendment [specialist: none] [BOUNDARY: human-approved]

**Charter capability:** lifecycle-artifacts — record the relationship-overlay decision + `--kind amendment` rejection rationale.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` — append an amendment section

**Tests:** No automated test (doc artifact). Validation is by `/adev:validate` doc-consistency + reviewer read. (This is the one task whose deliverable is a static ADR amendment; the spec's AC 8 is satisfied by content, and AC for `--kind amendment` rejection is tested in Task 4.)

**[BOUNDARY: human-approved]** Amending ADR-0009 is a sanctioned architecture-boundary change confirmed by reviewers (PASS_WITH_NOTES).

**Coverage:** AC 8. Record: (1) amendment is modeled as an orthogonal relationship field (`amends:` + `target-revision:`), NOT a 7th `kind:`; (2) the closed 6-value `kind:` enum is unchanged; (3) `--kind amendment` is intentionally rejected with `INVALID_KIND`; (4) cross-reference the new `spec_amended` canonical event. Follow the §7 "Accepted deviations" / amendment-callout style already in the ADR.

**Context to load:** spec Relationship-to-prior-decisions + Behavior 10; `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` (full).

- [ ] **Write failing test** — N/A (doc). Instead: confirm the section is absent before editing (visual RED).
- [ ] **Implement** — append the amendment section to ADR-0009.
- [ ] **Verify** — re-read; confirm all four points present and the closed-enum statement intact.
- [ ] **Commit**
  Branch: `feat/lifecycle-artifacts/amendment-frontmatter`
  ```bash
  git add .context-index/adrs/0009-lifecycle-artifact-taxonomy.md
  git commit -m "docs(lifecycle-artifacts): amend ADR-0009 for amendment relationship overlay

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 7"
  ```

### Task 8: Integration tests [specialist: none]

**Charter capability:** cross-cutting — end-to-end coverage of the amendment feature.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
**Files:**
- Create: `tests/specify-amend.integration.test.mjs`

**Tests:** `tests/specify-amend.integration.test.mjs`

**Coverage:** full round-trip — scaffold an amendment via the CLI verb against a temp base spec → assert co-located file + frontmatter + `spec_amended` on base log + base unchanged → run amendment-graph traversal → assert relationship report + effective revision (SA-2 validated-vs-unvalidated) → exercise cycle (`AMENDMENT_CYCLE`), dangling (`DANGLING_AMENDMENT`), incomplete (`INCOMPLETE_AMENDMENT_LINK`) error paths → `--kind amendment` rejection + flag mutual-exclusion. Uses `tests/helpers.mjs` (`createTempDir`, `writeFixture`).

**Context to load:** all spec behaviors + every Error Case row + all AC; outputs of Tasks 1-7; `tests/helpers.mjs`.

- [ ] **Write failing test** — author the integration suite against the (now-implemented) surface; any gap surfaces as a real failure, not a skip.
- [ ] **Verify test fails then passes** — Run: `node --test tests/specify-amend.integration.test.mjs`. Fix any integration gaps in the owning task's files until PASS.
- [ ] **Commit**
  Branch: `feat/cross-cutting/spec-amendment-artifacts`
  ```bash
  git add tests/specify-amend.integration.test.mjs
  git commit -m "test(cross-cutting): end-to-end coverage for first-class spec amendments

  Spec: .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
  Plan-task: 8"
  ```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (and per-file `node --test tests/specify-amend.test.mjs`, `tests/amendment-graph.test.mjs`, `tests/lifecycle/spec-amended-event.test.mjs`, `tests/specify-amend.integration.test.mjs`)
- No-inline-Node guard passes for `skills/specify/SKILL.md` (pre-commit `hooks/pre-commit-no-inline-node.sh`)
- Provider skill-mirror parity holds if `skills/specify/SKILL.md` changed (sync test)
- All acceptance criteria from the spec satisfied:
  - Scaffold produces co-located `<base-stem>-rev-<N>-<descriptor>.spec.md` with `amends:` + `target-revision:` + inherited/overridable `kind:`
  - Amendments keep `.spec.md`; `slugFromSpec` unchanged
  - `spec_amended` appended to the **base** log; base file unmodified
  - `--kind amendment` rejected with `INVALID_KIND`
  - status/hygiene report relationships + effective revision (`max(base, validated amendment target-revisions)`)
  - `DANGLING_AMENDMENT` / `INCOMPLETE_AMENDMENT_LINK` / `AMENDMENT_CYCLE` findings emitted
  - `--amend` mutually exclusive with the other workflow flags (`CONFLICTING_FLAGS`)
  - ADR-0009 amended
  - All amend logic in `lib/specify-amend.mjs` + the CLI verb; SKILL.md has no inline Node
- No constitutional violations introduced (the two `[BOUNDARY: human-approved]` changes are sanctioned, version parity maintained if `package.json` / `plugin.json` bumped)




