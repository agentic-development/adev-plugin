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
| brainstorm       | 2                             | extracted | PR 8-9 (heuristics retrieve + domain resolve) | Step 1 `retrieveHeuristics` → `adev heuristics retrieve --format text`. "Domain-Aware Charter Template" `resolveDomain` → `adev domain resolve --module …`. Allowlist entry removed. |
| build            | 4                             | extracted | PR 3 (reportStep), PR 4 (requireGate), PR 7 (build-state) | All inline blocks removed. PR 7 replaced the 3 `readBuildState`/`createBuildState`/`recordStepResult`/`getNextStep` heredocs with `adev build-state <read\|create\|record\|next>` calls. Removed from allowlist. |
| debug            | 4                             | extracted | PR 8-9 (heuristics retrieve --keyword, preflight run, verify format-note) | Phase 1 `retrieveHeuristics` keyword path → `adev heuristics retrieve --module … --keyword …`. Phase 1.5 `runPreflight` heredoc → `adev preflight run`. Phase 6 step 4 `formatConfidenceNote` heredoc → `adev verify format-note`. Allowlist entry removed. |
| eval             | 2                             | extracted | PR 8-9 (preflight run) | Preflight `runPreflight` heredoc → `adev preflight run`. Allowlist entry removed. |
| hygiene          | 1                             | extracted | PR 7 (verify spec) | Step 8 "Reality drift check" `verifySpecImplemented` heredoc replaced with `adev verify spec --spec <path>`. Removed from allowlist. |
| implement        | 10                            | extracted | PR 3 (reportStep), PR 4 (requireGate), PR 5 (source-manifest compute), PR 6 (domain test-config + verification), PR 7 (context load + execution-state), PR 8-9 (heuristics retrieve + preflight run) | All Step 1 heuristic retrieval / Step 1.5 preflight heredocs replaced with `adev heuristics retrieve` + `adev preflight run`. Allowlist entry removed. |
| plan             | 2                             | extracted | PR 3 (reportStep), PR 4 (requireGate), PR 7 (context load), PR 8-9 (heuristics retrieve) | Step 1 item 12 `retrieveHeuristics` heredoc replaced with `adev heuristics retrieve --module … [--injection-limit N] --format text`. Allowlist entry removed. |
| prototype        | 6                             | extracted | PR 8-9 (prototype helpers + heuristics retrieve) | All 6 inline blocks replaced: validate-module-name, discover-charters, heuristics retrieve (text format), start-server (backgrounded `&`), ensure-gitignore. Comment-only line 350 block removed. Allowlist entry removed. |
| recover          | 3                             | extracted | PR 8-9 (preflight run + heuristics write) | Step 1.5 preflight → `adev preflight run`. Step 7 `writeHeuristic` heredoc → `adev heuristics write --id … --scope … …`. Allowlist entry removed. |
| review-specs     | 2                             | extracted | PR 3 (reportStep), PR 4 (requireGate), PR 6 (domain reviewers), PR 8-9 (heuristics retrieve) | Step 4 heuristics inline block replaced with `adev heuristics retrieve`. Allowlist entry removed. |
| specify          | 2                             | extracted | PR 3 (reportStep), PR 8-9 (heuristics retrieve + domain resolve) | "Heuristics" heredoc → `adev heuristics retrieve`; "Domain-Aware Spec Template" `resolveDomain + loadDomainConfig` heredoc → `adev domain resolve` + plugin-root template lookup. Allowlist entry removed. |
| standalone       | 1                             | extracted | PR 8-9 (execution-state write) | `writeExecutionState` heredoc → `adev execution-state write --status standalone`. Allowlist entry removed. |
| status           | 1                             | extracted | PR 7 (state list) | Mode `--all` `findSpecsByStatus` loop replaced with `for s in …; do adev state list --status "$s"; done`. Removed from allowlist. |
| validate         | 8                             | extracted | PR 1 (Check 13), PR 2 (reportValidator), PR 3 (reportStep), PR 4 (requireGate), PR 5 (source-manifest verify), PR 6 (domain gates), PR 7 (context load --plan + verify issue), PR 8-9 (preflight + heuristics retrieve + verify spec --check-drift) | All four remaining heredocs replaced: Preflight → `adev preflight run`; Step 0 heuristics → `adev heuristics retrieve`; Check 1.6 drift `hasDrift` → `adev verify spec --check-drift`. Allowlist entry removed. |
| write-test       | 3                             | extracted | PR 8-9 (preflight + domain load-test-config) | Step 1a preflight heredoc → `adev preflight run`; Step 1b "Domain-Aware Test Config" heredoc → `adev domain load-test-config`. Allowlist entry removed. |
| **TOTAL**        | **51**                        | **all extracted** |       | Sweep complete after PR 8-9. Zero forbidden-regex matches across `skills/*/SKILL.md`; `ALLOWLIST` is `new Set()`. |

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
| 8-9 | Sweep finish — extract every remaining inline block | `brainstorm, debug, eval, implement, plan, prototype, recover, review-specs, specify, standalone, validate, write-test` | merged   |

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
| `heuristics retrieve`     | `lib/cli/heuristics.mjs`      | PR 8-9        | heuristic retrieval in `brainstorm`, `debug` (with `--keyword`), `implement`, `plan`, `prototype`, `recover`, `review-specs`, `specify`, `validate`. Covers all `retrieveHeuristics + renderHeuristic` heredoc forms. |
| `heuristics write`        | `lib/cli/heuristics.mjs`      | PR 8-9        | `recover` Step 7 lesson capture (`writeHeuristic`). |
| `report --type reviewer`  | `lib/cli/report.mjs`          | PR 8-9        | (canonical verb; available for review-specs reviewer-report emissions in future refinements) |
| `report --type plan-task` | `lib/cli/report.mjs`          | PR 8-9        | (canonical verb; available for `implement` plan-task transitions in future bash dispatch paths) |
| `report --type intervention` | `lib/cli/report.mjs`       | PR 8-9        | (canonical verb; available for `debug`/`recover` intervention emissions) |
| `preflight run`           | `lib/cli/preflight.mjs`       | PR 8-9        | `runPreflight + formatPreflightReport` heredocs in `write-test`, `eval`, `debug`, `recover`, `implement`, `validate`. |
| `prototype validate-module-name` | `lib/cli/prototype.mjs` | PR 8-9        | `prototype` Step 0a module-name validation. |
| `prototype discover-charters`    | `lib/cli/prototype.mjs` | PR 8-9        | `prototype` Step 0a charter discovery. |
| `prototype start-server`         | `lib/cli/prototype.mjs` | PR 8-9        | `prototype` Step 4 HTTP server startup (backgrounded `&`). |
| `prototype ensure-gitignore`     | `lib/cli/prototype.mjs` | PR 8-9        | `prototype` Step 6 `.adev/` gitignore enforcement. |
| `domain resolve`          | `lib/cli/domain.mjs`          | PR 8-9        | `brainstorm` Step 1 + `specify` Step 1 domain resolution (without loading any overlay). |
| `verify spec --check-drift` | `lib/cli/verify.mjs`        | PR 8-9        | `validate` Check 1.6 `hasDrift` heredoc. |
| `verify format-note`      | `lib/cli/verify.mjs`          | PR 8-9        | `debug` Phase 6 step 4 `formatConfidenceNote` heredoc (manual close after fix). |
| `execution-state write --status standalone` | `lib/cli/execution-state.mjs` | PR 8-9 | `standalone` skill's sole inline block. |

## Acceptance (sweep-complete sentinel)

The sweep is complete when **all** of:

1. `grep -rE "Run inline Node|node --input-type=module -e|node -e" skills/**/SKILL.md` returns zero matches.
2. `tests/skills-no-inline-node.test.mjs`'s `ALLOWLIST` is `new Set()` (empty).
3. All paired helper tests pass (`tests/cli/*.test.mjs`).
4. `tests/cli-driver-pattern.test.mjs` passes (driver-substrate invariant maintained).
5. Charter Capability Map row "Inline-Node extraction sweep" set to `implemented`.

Until then, this file is the live progress tracker. Update the row + PR
column for every extraction PR.
