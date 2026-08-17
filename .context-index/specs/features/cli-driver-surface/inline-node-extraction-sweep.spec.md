---
charter: cli-driver-surface
kind: refactor
status: implemented
risk_level: high
milestone:
revision: 1
charter-revision: 2
created: 2026-05-14
updated: 2026-05-15
---

# Live Spec: Inline-Node Extraction Sweep

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

## Behavioral Contract

This is the master spec for the inline-Node extraction sweep across the 18 canonical `skills/*/SKILL.md` files in this repo. It defines the invariants, sequencing order, per-skill atomic migration discipline, and quality criteria that every individual extraction PR must satisfy. Concrete per-block extraction is decomposed by `/adev:plan` into ordered tasks. The empirical data behind the work — silent-rate measurements per block — is in `.context-index/research/inline-node-extraction-scope.md`; sequencing is per `.context-index/research/adev-vs-compiler-dispatch-patterns.md` §5. The success criterion is binary and grep-able: post-sweep, `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches, and `tests/cli-driver-pattern.test.mjs` (from `driver-substrate`) plus a new `tests/skills-no-inline-node.test.mjs` enforce the absence. The narrow `node --input-type=module -e` form (with the `=module` qualifier) is required so the pattern does not over-match unrelated `--input-type=commonjs` usages; this is consistent with `regression-prevention.spec.md` Behavior 3.

### Preconditions

- `driver-substrate` spec validated. The `lib/cli/<verb>.mjs` pattern + `cli/index.mjs` dispatch + helper-side `requireGate` discipline + pattern test are in place.
- `diagnostic-registry` spec validated. Many extracted helpers also register as diagnostic runners.
- `adev-diagnose-cli` spec validated for the helpers extracted from validate's Check 13, etc., that downstream consumers will call.
- `write-time-diagnostic-hook` spec validated. Once `appendEvent` tags events, extracted lifecycle helpers' calls become auditable.
- `cli` charter at rev 3 (single-file constraint dropped). Multi-file `lib/cli/` work is permitted.

### Behaviors

1. **When** any inline-Node block in a `skills/<name>/SKILL.md` is extracted to `lib/cli/<verb>.mjs`, **then** the same PR (a) creates the helper module conforming to the driver-substrate pattern, (b) creates `tests/cli/<verb>.test.mjs` covering the helper, (c) edits `skills/<name>/SKILL.md` to *delete* the inline block and *replace* it with the `adev <verb>` call, (d) registers `<verb>` in `cli/index.mjs`. No PR ships only a subset of these.
2. **When** an extraction PR is opened, **then** the per-skill atomic invariant (Charter Domain Model Invariant 2) is satisfied for that skill: zero inline-Node blocks remain AND `adev <verb>` calls are present.
3. **When** a SKILL.md is in the middle of the sweep across PRs, **then** it is either fully extracted (no inline-Node, all `adev <verb>` calls) OR untouched by the sweep. No SKILL.md ever contains both forms simultaneously in tree.
4. **When** sequencing is applied across the sweep, **then** the ordering follows the silent-rate ranking from the research artifact: Check 13 heuristic extraction first (PR 1), then `reportValidator`/`reportStep` (PR 2–3), then `requireGate` Step 0a (PR 4), then source-manifest verify (PR 5), then domain-aware gate loading (PR 6), then the long tail (PRs 7–N).
5. **When** an extracted helper maps to a lifecycle step (e.g., `reportStep`-equivalent), **then** the new `lib/cli/<verb>.mjs` calls `requireGate(state, <step>)` as its first executable line per the driver-substrate Invariant 1.
6. **When** the sweep is complete, **then** `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches.
7. **When** `tests/skills-no-inline-node.test.mjs` runs, **then** it scans `skills/*/SKILL.md` for the forbidden patterns and fails CI if any match. This test exists from the *first* extraction PR; until the sweep finishes, the test maintains an explicit allowlist of un-extracted skills (one allowlist entry removed per PR). The initial allowlist is seeded at PR 1 from `grep -rl "Run inline Node\|node --input-type=module -e\|node -e" skills/*/SKILL.md` at the time of authoring — this command is the canonical source of truth for "which 18 skills are in scope" and is what `/adev:plan` uses to enumerate the per-PR breakdown.
8. **When** a `skills/<name>/SKILL.md` that previously contained an inline block is edited post-extraction, **then** the pre-commit hook (per spec #6) rejects re-introducing inline-Node patterns; the allowlist is shrinking, not growing.
9. **When** a helper extracted from a SKILL.md has the same logical behavior as an inline block in another SKILL.md, **then** the second SKILL.md's PR re-uses the existing CLI verb rather than introducing a duplicate verb. CLI-verb naming is canonical and shared.
10. **When** an extracted helper has external dependencies the inline block did not have (e.g., needs to read multiple files), **then** the PR includes a runtime-cost note in the helper's module header comment; if cost exceeds 200 ms p50 for the call site's frequency, an integration test enforces the budget.
11. **When** the sweep edits a SKILL.md, **then** the surrounding prose explaining *what the step does* is preserved — only the executable code is replaced. SKILL.md remains primarily markdown (Constitution Principle 2).

### Postconditions

- Zero inline-Node blocks in `skills/*/SKILL.md` across the 18 canonical skills.
- `tests/skills-no-inline-node.test.mjs` exists from PR 1 and is green throughout (allowlist shrinks per PR).
- All extracted CLI verbs are registered in `cli/index.mjs` and have paired test files.
- A migration index lives at `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md` (created by `/adev:plan` when it decomposes this spec into tasks; tracks per-block status: pending / in-flight / extracted).
- Charter Capability Map: "Inline-Node extraction sweep" row has `Status: implemented` (set by `/adev:implement` after each PR; status reflects whether ALL 35+ blocks are extracted).

### Error Cases

| Condition | Expected Behavior |
|---|---|
| PR contains helper + test BUT no SKILL.md edit | CI fails — the per-skill atomic invariant requires all four changes in one commit; reviewer rejects |
| PR contains SKILL.md edit (deleting inline) but no helper or stale CLI verb | CI fails — `adev <verb>` won't resolve; tests fail |
| PR introduces a new inline-Node block to a previously-extracted SKILL.md | Pre-commit hook rejects locally; if bypassed, `tests/skills-no-inline-node.test.mjs` fails CI |
| Two PRs concurrently extract the same block | First-merged wins; second rebases and detects no-op |
| Extracted helper does not call `requireGate` despite being lifecycle-bound | `tests/cli-driver-pattern.test.mjs` (from driver-substrate) fails — the AST-grep asserts this |
| Extracted helper exceeds Tier-1 budget | `adev/diagnostic-slow` info-severity finding in `adev diagnose`; PR includes performance note and optional integration-test budget |
| Helper logic diverges from the original inline-Node behavior (regression) | Caught by the new test file paired with the helper; reviewer rejects |
| Helper has higher LOC than the inline block plus 50% | Reviewer flags; not blocking but invites simplification |

## System Constitution Reference

- **Principle 2 ("Skills are primarily markdown — companion code is allowed but must not be required for the skill to function"):** This sweep is the resolution of the principle's spirit. Post-sweep, SKILL.md prose names work (via `adev <verb>`) and helpers in `lib/cli/` do work. The current state — inline Node that fires 1–4% of the time — violates the principle's intent per `.context-index/research/inline-node-extraction-scope.md` Recommendation 1.
- **Principle 1 ("Minimize external dependencies"):** Helpers wrap existing `lib/` modules. No new external deps.
- **Principle 3 ("Pure ESM"):** All new `lib/cli/*.mjs` files ESM.
- **Principle 4 ("Hook protocol compliance"):** Each helper that maps to a lifecycle step throws `GateError`; dispatcher converts to exit 2.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| PR 1 — Extract Check 13 (heuristic extraction) | `lib/cli/heuristics.mjs::run`, replace inline in `skills/validate/SKILL.md`, register `adev heuristics extract`, paired test. Establishes the pattern. | Medium |
| PR 2 — Extract `reportValidator` per-check emission | New `lib/cli/report.mjs`, exposes `adev report --type validator --spec <p> ...`. Replace inline in `skills/validate/SKILL.md`. This single PR lifts `validator_report` from 0% → ~100% coverage of validate runs. | Medium |
| PR 3 — Extract `reportStep` lifecycle entry/exit emission | Same module as PR 2: `lib/cli/report.mjs` adds `--type step` mode (single verb `adev report`, multi-mode via `--type`). Single dispatch entry per driver-substrate pattern. Replace inline in every lifecycle skill that emits step transitions. | Large |
| PR 4 — Extract Step 0a `requireGate` (the meta-irony PR) | New `lib/cli/gate.mjs::run` from driver-substrate IS this; the SKILL.md edits replace inline `requireGate` blocks with `adev gate require` calls. | Medium |
| PR 5 — Extract source-manifest verify | `lib/cli/source-manifest.mjs::run --verify`, replace inline in `skills/validate/SKILL.md` and others using it. | Medium |
| PR 6 — Extract domain-aware gate loading | `lib/cli/domain.mjs` (probably `--load-gates` subcommand), replace inline in `skills/validate/SKILL.md`. | Medium |
| PRs 7–N — Long tail | Per remaining inline block: helper + test + SKILL.md edit + verb registration + allowlist removal. Exact PR count determined by `/adev:plan` decomposition; tracked in `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md`. PRs 2–3 may cover multiple skills (e.g., `reportStep` extraction spans all lifecycle skills); long-tail PRs typically cover one skill each. | Variable per skill |
| Create `tests/skills-no-inline-node.test.mjs` (in PR 1) | Scan `skills/*/SKILL.md` for forbidden patterns; explicit allowlist of un-extracted skills; each PR removes its skill from the allowlist | Small |
| Create `.context-index/specs/features/cli-driver-surface/extraction-sweep-progress.md` | Index of all extraction PRs and their status; updated by `/adev:plan` when it decomposes this spec | Small |

## Acceptance Criteria

- [ ] PR 1 extracts Check 13 heuristic extraction; ~~`adev heuristics extract` works~~ (superseded by `.context-index/specs/features/heuristics/failure-capture.spec.md` Behavior 7 — the verb was retired as unreachable); `skills/validate/SKILL.md` no longer contains the inline block; `tests/cli/heuristics.test.mjs` covers the surviving subcommands
- [ ] PR 2 extracts `reportValidator`; post-PR, `validator_report` events appear in `.context-index/lifecycle-state/*.jsonl` for every validate run
- [ ] PR 3 extracts `reportStep` across all lifecycle skills
- [ ] PR 4 extracts `requireGate` Step 0a usage from every lifecycle skill; all calls go through `adev gate require`
- [ ] PR 5 extracts source-manifest verify
- [ ] PR 6 extracts domain-aware gate loading
- [ ] Subsequent PRs (7–18) extract the long tail; each PR atomic per Invariant 2
- [ ] Final state: `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches
- [ ] `tests/skills-no-inline-node.test.mjs` has an empty allowlist post-sweep
- [ ] All paired helper tests pass; `tests/cli-driver-pattern.test.mjs` passes (driver-substrate invariant maintained)
- [ ] No SKILL.md contains both inline-Node and `adev <verb>` for the same step at any point in tree (pre-commit hook enforces, see spec #6)
- [ ] Lifecycle event log coverage: `validator_report` event count across `.context-index/lifecycle-state/*.jsonl` rises from baseline ~0 to ≥N where N = count of `.validate.md` files for which `appendEvent` was called post-extraction
- [ ] All quality gates pass at every PR
- [ ] SKILL.md word counts decrease overall (extracted blocks gone, replaced by single-line CLI calls)
- [ ] No constitutional violations
- [ ] Charter Capability Map row "Inline-Node extraction sweep" set to `implemented` after final PR merges
