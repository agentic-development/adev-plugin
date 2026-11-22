---
spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md
plan: .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.plan.md
date: 2026-11-22
overall_status: PASS_WITH_NOTES
rigor_tier: full
---

# Validation Report: Amendment: Live Spec: Auto-Retry Loop on Review BLOCK — Batched Operator Decisions (targeting rev 3)

> **Date:** 2026-11-22
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md
> **Plan:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.plan.md
> **Overall Status:** PASS_WITH_NOTES

**Rigor tier:** `full`, from the explicit `--tier full`.
**Change set:** commits ca4766d8..48477169 on `feat/operator-decision-round`. The base is 5dfa1c35.
**Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` come from the `browser-review` profile. They are informational.
**Infrastructure preflight:** PASS. The spec declares no systems.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

- Check 1a (fast): `npm test` (gate `test`): PASS (70s). 9058 tests, 9056 pass, 0 fail, 2 todo.
- Check 1a (fast): `npm test` (gate `quality-gate`): PASS. The argv and `command_sha` are identical to gate `test`, so this is the same run.
- Check 1b (integration): `npm run test:evals` (gate `integration-test`, `required: false` → warning): FAIL (11s). 364 tests, 347 pass, 17 fail.
  - **The failures are pre-existing.** I re-ran every failing eval file in a temporary worktree at base 5dfa1c35. Each file failed with the same count and the same test names:
    - `tests/evals/beads-live/claim-parity.test.mjs`: 3 failures, both runs. `BEADS_COMMAND_FAILED` from the `br` environment.
    - `tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs`: 1 failure, both runs. `REGISTRY_NOT_MATERIALIZED`, because `review.yaml` lacks `materialized_at`.
    - `tests/evals/integration-sandbox/build-with-db.test.mjs` (5), `build-without-db.test.mjs` (3) and `reality-check.test.mjs` (3): same failures in both runs. Causes are Postgres not running and the `pg` package missing.
    - `tests/evals/token-optimization/token-budget-eval/token-budget-eval.test.mjs`: 2 failures, both runs. The regex expects bare `skills/...` pointers, but CLAUDE.md requires `<ADEV_ROOT>`-anchored pointers. The test is stale relative to the constitution.
- Check 1c (e2e): no gates configured, skipped.
- `gate_outcomes` attested on one `validator_report`: test=pass, quality-gate=pass, integration-test=fail. Manifest sha `de82aa4`.

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify`: PASS. The manifest matches (sha `de82aa4`).
- All 45 manifest files exist, are committed, and are clean against HEAD.

## Check 1.6: Code-Side Drift — PASS

- `drift_detected` is false. No `code_drift_detected` event exists.

## Check 2: Spec Compliance — PASS_WITH_NOTES

All 20 acceptance criteria PASS against the code and tests the reviewer read. The reviewer re-ran the 15 feature test files plus `skill-size-cap`: 316 pass, 0 fail.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | question/options round-trip; truncate, then gate; an over-length question reaches `DEC-<n>` | PASS | `lib/decision-text.mjs:57-79`, `lib/blockers-writer.mjs:199-243`; `tests/lib/decision-text.test.mjs:90-123`, `tests/lib/specify-revise.test.mjs` |
| 2 | Unsafe text is refused with `DECISION_TEXT_REJECTED` | PASS | `lib/decision-text.mjs:25-48`; `tests/lib/decision-text.test.mjs:49-63` |
| 3 | `OPTIONS_REJECTED` / `DECISION_FIELDS_IGNORED` | PASS | `lib/blockers-writer.mjs:199-226`; `tests/lib/blockers-writer.test.mjs:582-603` |
| 4 | `decisionsRequired` + the `## Decisions Required` table | PASS | `lib/decision-text.mjs:132-150`; `tests/lib/decision-text.test.mjs:181-191` |
| 5 | All 8 reviewer prompts carry question/options and the settled-decision rule | PASS | `skills/review-specs/structural-architect-prompt.md:44-55`; `tests/skills/review-specs-finding-class-prompts.test.mjs` |
| 6 | pending/answered/decided, ordering, `structured`, absent sidecar | PASS | `lib/decisions.mjs:228-311`; `tests/lib/decisions.test.mjs:61-129` |
| 7 | `QUESTION_DERIVED` fallback; `DECISION_MARKER_MALFORMED` | PASS | `lib/decisions.mjs:252-256`, `lib/decisions-of-record.mjs:105-138` |
| 8 | `duplicate_of` marking | PASS | `lib/decisions.mjs:268-270`; `tests/lib/decisions.test.mjs:161-176` |
| 9 | Step 8 bounded ask round, `--defer-decisions` | PASS | `skills/review-specs/references/steps/step-8-decision-ask-round.md:13-59`; `tests/skills/review-specs-decisions-ask-round.test.mjs` |
| 10 | `record` is the sole writer; replace/remove; error codes | PASS | `lib/decisions.mjs:335-369`, `lib/blockers-writer.mjs:586-603` |
| 11 | realpath containment, 64 KiB cap | PASS | `lib/decisions.mjs:72-186`; `tests/lib/decisions.test.mjs:306-329` |
| 12 | group-blockers attaches decisions; binding dispatch | PASS (see N1) | `lib/specify-revise.mjs:318-368`, `lib/cli/specify.mjs:279-301` |
| 13 | Decisions of Record placement, DEC allocation, re-check, write before clear | PASS | `lib/decisions-of-record.mjs:49-78,161-259`, `lib/specify-revise.mjs:465-500,847-874` |
| 14 | Byte-identity abort | PASS | `lib/specify-revise.mjs:523-534` |
| 15 | An authored `<!-- adev:decision` is refused per anchor | PASS | `lib/specify-revise.mjs:395-398,746-749` |
| 16 | Interactive build ask round, `LOOP_BUDGET_EXHAUSTED`, `--auto` halt | PASS | `skills/build/references/blocker-auto-retry-loop.md:24-32,100,112` |
| 17 | `--defer-decisions` contract test, pending → record → group-blockers | PASS | `skills/build/references/pipeline/step-1-review.md:12,18`; `tests/skills/build/blocker-loop-decisions.test.mjs:49-114` |
| 18 | End-to-end integration | PASS | `tests/integration/decisions-end-to-end.test.mjs:69-125` |
| 19 | npm test, size cap, no inline Node | PASS | Check 1; `tests/skills/skill-size-cap.test.mjs` |
| 20 | No constitutional violations | PASS | Check 4 |

### Notes

- **N1 (warning): group-blockers does not gate recorded answers, which BEH-2 requires.** The spec says at line 139 that every reader (`pending`, `group-blockers`, revise) gates the parsed string. `groupBlockersByAnchor` passes `choice: entry.decision_choice` and `note: entry.decision_note` through unchanged (`lib/specify-revise.mjs:332`), and `lib/cli/specify.mjs:279-286` emits them into the authoring dispatch. A tampered sidecar `decision_choice` containing ESC, a newline and `**` reaches the author prompt intact. Revise's BEH-9 re-check still refuses the spec write, so the spec body stays safe. The exposure is prompt injection into the authoring subagent. `pending`'s `answered` list strips the value but does not gate it. No acceptance criterion names this path. Fix: run `checkUnsafeDecisionText` on `choice` and `note` in `groupBlockersByAnchor`, refuse with an advisory, and add a test.
- **N2 (note): `NOTHING_TO_REVISE` is mode-scoped in the code but not in the spec.** BEH-6 (spec lines 233-235) says that when no section changed at all, revise exits `NOTHING_TO_REVISE` and writes no `DEC-<n>` entry. `lib/specify-revise.mjs:839` raises it only under `--auto`/`--same-revision`. An interactive revise with no authored change writes the DEC entry and clears the sidecar, and `tests/cli/specify-revise.test.mjs` asserts that behaviour. Either the code or BEH-6's wording needs to change.
- **N3 (note): the ask-round cap is not in the spec.** `ASK_ROUND_GROUP_LIMIT = 16` with `ask`/`overflow` (`lib/decisions.mjs:39,274-283`) came from review note TR-2 in the plan. BEH-3/BEH-4 still describe an uncapped ceil(n/4). The spec should state the cap and what happens to overflow groups.
- **Scope expansion detected (warning).** These paths are outside `source-manifest.files` (spec lines 18-61):
  - `tests/governance/context-pack-consistency-glob.test.mjs`: the live spec count went from 24 to 25.
  - `.context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md`: size and pointer figures were updated.
  - Action for both: add the path to `source-manifest.files`, or revert the change.
- **Informational.** `skill-body-progressive-disclosure.spec.md`'s own source manifest fails verification. The cause is the missing file `tests/evals/skill-compression/token-budget-eval/token-budget-eval.test.mjs`, which commit 168f38c4 relocated to `tests/evals/token-optimization/...` before this branch. The problem is pre-existing, the hash is probably also stale after t9/t10, and that spec needs a re-stamp.
- **Test integrity:** nothing flagged. Assertions are strict, with no conditional skips or weakened matchers.

## Check 4: Constitution Compliance — PASS_WITH_NOTES

- Architecture boundaries: PASS. package.json, plugin manifests, hooks and templates are unchanged since 5dfa1c35. `cli/index.mjs` gains one `VERB_REGISTRY` entry for `decisions`. No new skill was added to the lifecycle.
- Non-negotiable principles: PASS. There are no new dependencies: the new libs import only `node:` built-ins and relative modules. Everything is pure ESM, and no version was bumped. Skills remain markdown, and the ask-round branching lives in `computePending` (`lib/decisions.mjs:228`).
- Coding standards: PASS. File names are kebab-case and functions camelCase. Imports are ordered. The CLI exits 1 on coded errors (`lib/cli/decisions.mjs:24-32`). There are no provenance comments, and no inline Node in any SKILL.md (`tests/skills-no-inline-node.test.mjs` 3/3). Pointers are anchored with `<ADEV_ROOT>`. SKILL.md bodies are well under the cap. Provider mirrors are in sync (`sync-provider-skills --dry-run`: 0 updated).
- Advisory notes:
  - **C1.** `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md:64` adds a rule about how the ADR itself changes: "A new producer of an existing peer is a table update, not an amendment." A human should confirm it.
  - **C2.** `skills/review-specs/SKILL.md:4` adds `AskUserQuestion` to `allowed-tools`. This changes the skill's interaction contract, and the change is gated by `--defer-decisions` and the attendance rule.
  - **C3.** There is an ESM import cycle: `lib/decisions.mjs:27` imports from `./specify-revise.mjs`, and `lib/specify-revise.mjs:43` imports `resolveDecisionPaths` from `./decisions.mjs`. It is benign at runtime, but it contradicts the leaf-module rationale in `lib/decision-text.mjs:1-5`.

## Check 8: Boundary Compliance — PASS

- `adev boundaries check --json`: PASS. No violations in 20 changed files against 3 rules.
- Disabled: `no-manual-version-bump`. The evaluator matches file content, not diffs, so this rule would fire on package.json forever. It needs a diff-aware evaluator.

## Check 9: Transition Gates — PASS

- Transition: implement-to-validate.
- `test`: pass (recorded-pass, `command_attested: true`).

## Check 11: Visual Verification — N/A

- SKIP. There are no UI files in the implementation diff, so visual verification does not apply.

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

- `gate-doctor/runner-unknown` ×3 (gates `test`, `quality-gate`, `integration-test`): collection could not be verified through `npm test` / `npm run test:evals`.
- `gate-doctor/ci-gate-not-invoked`: `integration-test` (`npm run test:evals`) is not run in any CI workflow.

---

**Summary:** 4 passed, 4 passed with notes, 0 failed, 1 skipped (Check 11, N/A). The spec status stays `implemented`. N1 is a BEH-2 deviation that should be fixed, or explicitly accepted, before the `validated` transition.

---

> **Note for users comparing with historic reports:** `check-set-restructure.spec.md` relocated Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12 and 13:
>
> - `/adev:review-specs` now covers ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7) and charter consistency (formerly Check 3, now Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 covers platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync covers lifecycle reconciliation (formerly Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` covers heuristic extraction (formerly Check 13).
