# Extraction Sweep Progress

> **Spec:** `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md`
> **Plan:** `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md`
> **Seeded:** 2026-05-15 (Task 0)
> **Allowlist test:** `tests/skills-no-inline-node.test.mjs`

Per-skill / per-block tracker for the inline-Node extraction sweep. Each
extraction PR updates the relevant row, shrinks `ALLOWLIST` in
`tests/skills-no-inline-node.test.mjs`, and lands the helper + paired
test + SKILL.md edit + verb registration in one atomic commit (per spec
Behavior 1).

## Canonical inline-Node footprint (initial state)

Seed command (re-run any time to verify):

```bash
grep -rc "Run inline Node\|node --input-type=module -e\|node -e" skills/*/SKILL.md | grep -v ':0$'
```

| Skill            | Inline blocks (initial count) | Status   | PR(s) | Notes |
|------------------|-------------------------------|----------|-------|-------|
| brainstorm       | 2                             | pending  | —     |       |
| build            | 4                             | extracted | PR 3 (reportStep), PR 4 (requireGate), PR 7 (build-state) | All inline blocks removed. PR 7 replaced the 3 `readBuildState`/`createBuildState`/`recordStepResult`/`getNextStep` heredocs with `adev build-state <read\|create\|record\|next>` calls. Removed from allowlist. |
| debug            | 4                             | pending  | —     |       |
| eval             | 2                             | pending  | —     |       |
| hygiene          | 1                             | extracted | PR 7 (verify spec) | Step 8 "Reality drift check" `verifySpecImplemented` heredoc replaced with `adev verify spec --spec <path>`. Removed from allowlist. |
| implement        | 10                            | partially-extracted | PR 3 (reportStep), PR 4 (requireGate), PR 5 (source-manifest compute), PR 6 (domain test-config + verification), PR 7 (context load + execution-state) | Step 1 `loadSpecContext + getPlanProgress` heredoc replaced with `adev context load --spec --plan`. Three `writeExecutionState` / `clearExecutionState` prose mentions (Steps 2c-pre, 2d-blocker, 4 Completion) replaced with `adev execution-state write|clear`. 4 forbidden-regex blocks remain (heuristics retrieval Step 1, infra-preflight Step 1.5); stays on allowlist. |
| plan             | 2                             | partially-extracted | PR 3 (reportStep), PR 4 (requireGate), PR 7 (context load) | Essential Context `loadSpecContext` heredoc replaced with `adev context load --spec`. 1 forbidden-regex block remains (heuristics retrieval Step 1 item 12); stays on allowlist. |
| prototype        | 6                             | pending  | —     |       |
| recover          | 3                             | pending  | —     |       |
| review-specs     | 2                             | partially-extracted | PR 3 (reportStep), PR 4 (requireGate), PR 6 (domain reviewers) | reportStep + requireGate + domain reviewers extracted (Step 0 entry, Step 8 exit; Step 3 "Domain-Aware Reviewer Loading" inline `node -e` JS block replaced with `adev domain load-reviewers`); 1 forbidden-regex block remains (heuristics inline `node -e` in Step 4 — not in PR 6 scope); stays on allowlist |
| specify          | 2                             | partially-extracted | PR 3 (reportStep) | reportStep extracted (Step 0 entry, Step 6 exit); specify has no Step 0a requireGate gate (it's the first lifecycle step); 2 forbidden-regex blocks remain; stays on allowlist |
| standalone       | 1                             | pending  | —     |       |
| status           | 1                             | extracted | PR 7 (state list) | Mode `--all` `findSpecsByStatus` loop replaced with `for s in …; do adev state list --status "$s"; done`. Removed from allowlist. |
| validate         | 8                             | partially-extracted | PR 1 (Check 13), PR 2 (reportValidator), PR 3 (reportStep), PR 4 (requireGate), PR 5 (source-manifest verify), PR 6 (domain gates), PR 7 (context load --plan + verify issue) | Check 12e plan-progress `getPlanProgress` heredoc replaced with `adev context load --plan`. After-Validation step 3 `verifyIssueCompleted + formatConfidenceNote` heredoc replaced with `adev verify issue --issue-json … --note Validated …`. 4 forbidden-regex blocks remain (infra-preflight Step 1.5, heuristics Step 0, Check 1.6 drift, etc.); stays on allowlist. |
| write-test       | 3                             | pending  | —     |       |
| **TOTAL**        | **51**                        |          |       |       |

Status legend:
- `pending` — skill still contains inline blocks, no extraction PR landed yet.
- `in-flight` — extraction PR open / under review for this skill.
- `partially-extracted` — some blocks lifted, more remain (rare; PR shapes are usually per-skill atomic).
- `extracted` — all inline blocks removed, all `adev <verb>` calls in place, allowlist entry removed.

## Sweep order (per silent-rate ranking)

Per `research/inline-node-extraction-scope.md` silent-rate measurements
and `research/adev-vs-compiler-dispatch-patterns.md` §5 sequencing
guidance. PR numbers are nominal — actual landing order follows the
named-PR sequence, with the long tail parallelizable.

| PR  | Title                                              | Skills affected                                         | Status   |
|-----|----------------------------------------------------|---------------------------------------------------------|----------|
| 0   | Sweep scaffolding (progress index + allowlist test)| —                                                       | merged   |
| 1   | Extract Check 13 — heuristic extraction            | `validate`                                              | merged   |
| 2   | Extract `reportValidator` per-check emission       | `validate`                                              | merged   |
| 3   | Extract `reportStep` lifecycle entry/exit emission | `specify, review-specs, plan, implement, validate, build` | merged   |
| 4   | Extract Step 0a `requireGate` calls                | `review-specs, plan, implement, validate, build`        | merged   |
| 5   | Extract source-manifest verify                     | `validate`, `implement`                                 | merged   |
| 6   | Extract domain-aware gate / reviewer / test-config / verification loading | `validate`, `review-specs`, `implement` | merged   |
| 7   | Extract context / verify / state / execution-state / build-state primitives | `implement`, `plan`, `validate`, `hygiene`, `status`, `build` | merged   |
| 8+  | Long-tail extractions (per remaining block)        | `brainstorm, debug, eval, prototype, recover, specify, standalone, write-test`, plus residual blocks in `implement, plan, review-specs, validate` | pending  |

## Canonical-verb registry (cross-PR re-use, per spec Behavior 9)

Tracks which `lib/cli/<verb>.mjs` helpers have been introduced and which
inline blocks they cover. Subsequent PRs MUST re-use existing verbs when
logic matches — naming is canonical and shared.

| Verb                  | Helper module                 | Introduced in | Covers blocks in                  |
|-----------------------|-------------------------------|---------------|-----------------------------------|
| `gate require`        | `lib/cli/gate.mjs`            | driver-substrate | lifecycle Step 0a in `review-specs, plan, implement, validate, build` (PR 4) |
| `diagnose`            | `lib/cli/diagnose.mjs`        | adev-diagnose-cli | (engine, not from this sweep)   |
| `heuristics extract`  | `lib/cli/heuristics.mjs`      | PR 1          | `validate` Check 13               |
| `report --type validator` | `lib/cli/report.mjs`      | PR 2          | `validate` Per-Check Event Emission |
| `report --type step`  | `lib/cli/report.mjs`          | PR 3          | step-started/completed emissions in `specify, review-specs, plan, implement, validate, build` |
| `source-manifest verify` | `lib/cli/source-manifest.mjs` | PR 5       | `validate` Check 1.5 (manifest verification) |
| `source-manifest compute` | `lib/cli/source-manifest.mjs` | PR 5      | `implement` Step 5 (compute and stamp source manifest) |
| `domain load-gates`      | `lib/cli/domain.mjs`          | PR 6          | `validate` Step 0 "Domain-Aware Gate Loading"   |
| `domain load-reviewers`  | `lib/cli/domain.mjs`          | PR 6          | `review-specs` Step 3 "Domain-Aware Reviewer Loading" |
| `domain load-test-config`| `lib/cli/domain.mjs`          | PR 6          | `implement` Step 2c "Domain-Aware Test Config"  |
| `domain load-verification`| `lib/cli/domain.mjs`         | PR 6          | `implement` Step 2e "Domain-Aware Verification Config" |
| `context load`            | `lib/cli/context.mjs`         | PR 7          | `implement` Step 1 (spec + plan progress), `plan` Essential Context, `validate` Check 12e (plan progress) |
| `verify spec`             | `lib/cli/verify.mjs`          | PR 7          | `hygiene` Step 8 (reality drift check)         |
| `verify issue`            | `lib/cli/verify.mjs`          | PR 7          | `validate` After-Validation Step 3 (issue confidence-annotated update) |
| `state list`              | `lib/cli/state.mjs`           | PR 7          | `status` Mode `--all` (`findSpecsByStatus` loop) |
| `state current`           | `lib/cli/state.mjs`           | PR 7          | (canonical verb introduced for future hygiene / recover extractions; no SKILL.md sites converted in PR 7) |
| `state events`            | `lib/cli/state.mjs`           | PR 7          | (canonical verb introduced for future hygiene / recover extractions; no SKILL.md sites converted in PR 7) |
| `execution-state read`    | `lib/cli/execution-state.mjs` | PR 7          | (canonical verb introduced for future recover/hygiene reads)  |
| `execution-state write`   | `lib/cli/execution-state.mjs` | PR 7          | `implement` 2c-pre (status=active), 2d-blocker (status=blocked) |
| `execution-state clear`   | `lib/cli/execution-state.mjs` | PR 7          | `implement` Step 4 Completion |
| `build-state read`        | `lib/cli/build-state.mjs`     | PR 7          | (read mode, canonical verb) |
| `build-state create`      | `lib/cli/build-state.mjs`     | PR 7          | `build` Dispatch Loop step 1 (creation branch) |
| `build-state record`      | `lib/cli/build-state.mjs`     | PR 7          | `build` Dispatch Loop steps 2 (skipped) and 4 (completed/failed) |
| `build-state next`        | `lib/cli/build-state.mjs`     | PR 7          | `build` Dispatch Loop steps 1, 2, 4 (next-step computation) |

## Acceptance (sweep-complete sentinel)

The sweep is complete when **all** of:

1. `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches.
2. `tests/skills-no-inline-node.test.mjs`'s `ALLOWLIST` is `new Set()` (empty).
3. All paired helper tests pass (`tests/cli/*.test.mjs`).
4. `tests/cli-driver-pattern.test.mjs` passes (driver-substrate invariant maintained).
5. Charter Capability Map row "Inline-Node extraction sweep" set to `implemented`.

Until then, this file is the live progress tracker. Update the row + PR
column for every extraction PR.
