---
mode: cross-cutting
affects: [agent-reliable-state-artifacts, spec-lifecycle, strategic-planning, review]
kind: behavioral
status: review-pending
risk_level: high
revision: 1
charter-revision: 1
amends: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
target-revision: 2
created: 2026-08-21
updated: 2026-08-21
---

# Amendment: Live Spec: Auto-Retry Loop on Review BLOCK (targeting rev 2)

> This spec **amends** `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` targeting revision 2.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

The base spec's Behavior 1 promises a "TARGETED patch addressing each blocker." In practice `lib/specify-revise.mjs::reviseSpec` never edits spec body content — `renderFrontmatter` rewrites only `revision`/`updated`/`status`; the body captured at parse time passes through byte-identical. `addressed`/`unresolved` are hardcoded (`addressed = all input blockers`, `unresolved = []`) regardless of what changed. Two consequences, tracked as `adev-plugin-revise-loop-no-content-edits-q6q0` (P1, this amendment's primary driver; `adev-plugin-j7pq.9` closed as its exact duplicate):

1. **False provenance.** The `spec_revised` event claims every blocker was addressed even when zero bytes changed. Anything reading the log (`/adev:retro`, `/adev:hygiene`, delivery metrics) sees fabricated progress.
2. **Guaranteed non-convergence for any content-requiring blocker.** No edit → identical re-review → identical `blocker_id`s → the loop can only "succeed" on blockers that needed no content change at all, which is close to the empty set. Observed cost: ~8-11 minutes and ~120-145K subagent tokens per cycle to discover the verb did nothing.

Fixing only the authoring gap is not sufficient on its own. `adev-plugin-j7pq.1` recorded eight full-tier review cycles across two cross-cutting specs (~1.37M subagent tokens, zero PASS) in which **every content edit was authored by hand** — a real fix each time — and the loop still failed to converge, halting on `BUDGET_EXHAUSTED` or a coin-flip `REGRESSED`. Root cause: `persistent: 0` in all eight cycles, because an LLM reviser that is shown every blocker explicitly will always produce text that addresses each one literally, making the base spec's `NO_PROGRESS` guard (`persistent == prev_blockers`) structurally unreachable. `j7pq.1` also found the dominant defect class across all eight cycles was specifying behavior against a mechanism that does not exist in the codebase (a symbol, flag, or event variant with no implementation) — a class of defect that is mechanically checkable and was, in the observed runs, caught only after a full expensive review round.

This amendment therefore does two things together, because `j7pq.1`'s data shows one without the other does not converge: (1) gives the loop a real, AI-driven authoring step scoped per implicated section rather than per whole document, so it is both real and cheap; and (2) replaces the base spec's identity-based stall guard with a trend-based one, adds a deterministic pre-review gate for the dominant defect class, and classifies blockers so ones that can never be resolved by rewriting text stop consuming loop budget.

**Reviewer-registry correction.** The base spec's `source-manifest.files` lists `skills/review-specs/structural-architect-prompt.md`, `security-reviewer-prompt.md`, and `consistency-analyzer-prompt.md` — the generic three-specialist default that was accurate when the base spec was authored (2026-05-19). This project's registry has since been retargeted by the reviewer-domain-fit initiative (`adev governance reviewers --json`): `structural-architect` and `security-reviewer` are now `enabled: false` for this project's shape (Node CLI/plugin, not web-service), replaced by `referent-integrity`, `wiring-reviewer`, and `boundary-reviewer` (all `dispatch: always`, alongside `consistency-analyzer`), plus a `termination-reviewer` triggered on the keywords `loop`, `retry`, `poll`, `polling`, `iterate`, `iteration`, `recurring`, `convergence`, `auto-retry` — a set this very amendment's subject matter will trigger. Every behavior below is written against "the reviewer set `adev governance reviewers` resolves for the project," never a fixed count or named trio, and Behavior 8 and the diff-scoped dispatch task explicitly correct the drift.

## Behavioral Delta

### Behaviors Added

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:review-specs` (or a reviewer subagent it dispatches) emits a BLOCK-severity finding **then** the finding carries a required `finding_class` field with value `defect` (the spec text itself is wrong), `decision` (the finding names an unresolved design choice, not a wording problem), or `external` (the remedy lives in a different artifact, named in a companion `remedy_ref` field). Reviewer output that predates this amendment and carries no `finding_class` defaults to `defect`.
- **BEH-2** — **When** the auto-retry loop reads `.blockers.md` and a blocker's `finding_class` is `decision` **then** the loop does not dispatch authoring (BEH-4) for that blocker; it halts immediately with verdict `DECISION_REQUIRED`, writes the sidecar+fail-loud artifacts, and reports the blocker's prose and `section_anchor` for a human decision.
- **BEH-3** — **When** a blocker's `finding_class` is `external` **then** the loop excludes it from this spec's convergence accounting (it can never be `addressed` here), surfaces its `remedy_ref` in the operator-facing report, and continues the loop for any remaining `defect`-classed blockers in the same batch.
- **BEH-4** — **When** `/adev:specify --revise <spec>` is invoked and `.blockers.md` contains one or more `defect`-classed blockers **then**, before the mechanics verb runs, the skill groups those blockers by `section_anchor` and dispatches one subagent per distinct anchor, in parallel, each given only that section's current text, the anchor's blocker prose entries, and minimal charter/frontmatter context — instructed to return a rewritten section body plus a one-line rationale. An anchor with no matching heading in the spec body is reported to the operator; authoring is skipped for that entry (mirrors the base spec's existing "hint, not enforced" handling of unmatched anchors).
- **BEH-5** — **When** all per-section authoring subagents from BEH-4 have returned **then** the mechanics verb splices each returned section body back into the spec at its anchor — every non-implicated section stays byte-identical, preserving the base spec's Behavior 1 guarantee — and computes `addressed_blocker_ids` as exactly the blockers whose anchored section text differs from its pre-authoring content, never by acknowledging the full input set. `unresolved_blocker_ids` is every loop-eligible blocker whose anchor text is unchanged after authoring.
- **BEH-6** — **When** a spliced revision is produced by BEH-5 **then**, before dispatching `/adev:review-specs` again, a deterministic CLI verb extracts every `file:line`, exported symbol, CLI flag, and error code the newly authored text names and checks that each resolves against the current repository tree — no reviewer subagent is dispatched for this check.
- **BEH-7** — **When** the mechanism-existence check in BEH-6 finds one or more unresolved references **then** each becomes a new blocker (its own deterministic `blocker_id`, `finding_class: defect`) and the loop returns to authoring (BEH-4) for the affected anchors within the current revision, or stops with `BUDGET_EXHAUSTED` if `max_review_retries` is already exhausted. A cycle resolved entirely at this gate never pays for a reviewer dispatch.
- **BEH-8** — **When** BEH-6 passes for a revision produced by `/adev:specify --revise` within an auto-retry loop, and it is not that spec's first review (the very first review of any spec or amendment remains full-tier per `graduated-rigor-tiers.spec.md`, unaffected by this behavior) **then** `/adev:review-specs` is dispatched in diff-scoped mode: only reviewers whose `dispatch` resolves to `always`, or whose `triggered` keyword match fires against the changed sections' text, are invoked, and each dispatched reviewer's context pack is restricted to the changed sections plus sections that cross-reference them, rather than the full spec body.
- **BEH-9** — **When** `lib/loop-convergence.mjs` evaluates a cycle **then**, in addition to the base spec's PASS / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED verdicts, it computes `NOT_CONVERGING`: true when the total loop-eligible blocker count has been non-decreasing for `not_converging_window` consecutive cycles (default 2, manifest-configurable under `build.not_converging_window`), independent of whether the specific `blocker_id`s churned. `NOT_CONVERGING` is evaluated before `NO_PROGRESS` and stops the loop via the same sidecar+fail-loud path, because `adev-plugin-j7pq.1` found `persistent == prev_blockers` structurally near-unreachable against an LLM reviser that always responds to every listed blocker.
- **BEH-10** — **When** an authored revision's line count exceeds the revision it replaced **then** the loop records `growth_ratio = (new_lines − old_lines) / old_lines` on the `spec_revised` event. Advisory telemetry only in this amendment — no behavior blocks on it.
- **BEH-11** — **When** `build.max_review_retries` is read from manifest with no explicit value **then** the default remains **2**, reaffirming the base spec's value against the drift recorded in `adev-plugin-j7pq.1` (raised to 5 on a misreading of `persistent: 0`, then validated back down by the already-closed `adev-plugin-lvcp`, "3rd iteration added no value"). This amendment closes that drift risk by putting the "why 2, not 5" reasoning in a spec rather than only in issue history.

### Behaviors Amended

- Base **Behavior 1** ("produces a TARGETED patch addressing each blocker") is superseded: the patch is produced by the per-section authoring subagents of BEH-4, not by the mechanics verb acknowledging blockers unconditionally.
- Base **Behavior 2**'s event payload shape is unchanged (`spec_revised` still carries `addressed_blocker_ids`/`unresolved_blocker_ids`), but its semantics change per BEH-5: the arrays now reflect a verified text diff, not blanket acknowledgement.
- Base **Behavior 7**'s `NO_PROGRESS` definition is retained unmodified but is no longer the loop's primary stall guard — BEH-9's `NOT_CONVERGING` fires first in practice, per the `j7pq.1` evidence above.

### Behaviors Retired

None. All ten base behaviors remain in force; three are superseded as described above, not deleted.

## Preconditions Delta

- Every reviewer entry in the active `.context-index/governance/review.yaml` registry resolves a `finding_class` on any BLOCK-severity finding (BEH-1); reviewer prompts pre-dating this amendment default to `defect`.
- The mechanism-existence check (BEH-6) requires read access to the repository tree from the loop's working directory — already satisfied by every existing loop invocation; no new infrastructure requirement.

## Postconditions Delta

- After a converged (PASS) loop run, every `addressed_blocker_id` recorded across the run's `spec_revised` events is backed by a verifiable pre/post text diff at its `section_anchor`.
- `decision`- and `external`-classed blockers are never silently retried — every `DECISION_REQUIRED` or `external` exit is visible in the lifecycle log and the operator-facing report.

## Error Cases Delta

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A BLOCK finding has no resolvable `finding_class` and is not from a pre-amendment legacy reviewer | Default to `defect`; log advisory | `FINDING_CLASS_DEFAULTED` (advisory) |
| A `decision`-classed blocker reaches the loop | Halt immediately with `DECISION_REQUIRED`; do not dispatch authoring | `DECISION_REQUIRED` |
| An `external`-classed blocker reaches the loop | Exclude from this spec's convergence accounting; surface `remedy_ref` | `EXTERNAL_REMEDY` (advisory) |
| A `section_anchor` in `.blockers.md` matches no heading in the spec body | Report to operator; skip per-anchor authoring for that entry | `ANCHOR_NOT_FOUND` |
| Mechanism-existence check (BEH-6) finds an unresolved reference | Record as a new `mechanism-existence` blocker; loop back to authoring or stop on budget exhaustion | `MECHANISM_NOT_FOUND` |
| Loop-eligible blocker count is non-decreasing for `not_converging_window` consecutive cycles | Stop with `NOT_CONVERGING`; sidecar+fail-loud; exit non-zero | `LOOP_NOT_CONVERGING` |

## System Constitution Reference

- **Principle: "Skills are primarily markdown."** — Per-section authoring (BEH-4) is a subagent dispatch from skill prose (`skills/specify/SKILL.md` Revise Mode), not executable logic embedded in SKILL.md; splicing, diffing, and mechanism-existence checking (BEH-5, BEH-6) are companion CLI verbs.
- **Principle: "Minimize external dependencies."** — Mechanism-existence checking uses `fs`/`path`/existing repo-map-equivalent built-ins; no new dependency for symbol resolution.
- **cli-driver-surface anti-pattern ("no inline Node in SKILL.md").** — The authoring dispatch, splice, diff, and mechanism-existence steps are all named CLI verbs or Agent dispatches from prose, never inline Node.

## Module Impact Map (Delta)

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `review` (skills/review-specs) | Medium | Reviewer output schema gains `finding_class` (+ `remedy_ref` for `external`); legacy output defaults to `defect`. |
| `spec-lifecycle` | High | `lib/specify-revise.mjs` gains per-section splice + real-diff `addressed`/`unresolved` computation; new mechanism-existence CLI verb; skill dispatches per-anchor authoring subagents before calling the mechanics verb. |
| `strategic-planning` | High | `skills/build/SKILL.md` loop gains `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exits, diff-scoped re-review dispatch (BEH-8), and `NOT_CONVERGING` handling in `lib/loop-convergence.mjs`. |
| `agent-reliable-state-artifacts` | Low | `spec_revised` event gains optional `growth_ratio` field (BEH-10); no schema-breaking change. |

## Integration Points (Delta)

1. **Authoring subagents ↔ `lib/specify-revise.mjs`**: the mechanics verb now accepts pre-authored section bodies (keyed by anchor) as input, rather than performing a no-op frontmatter-only rewrite.
2. **Mechanism-existence check ↔ repo tree**: new CLI verb reads authored section text, extracts referenced `file:line`/symbol/flag/error-code tokens, and checks resolution against the working tree before any reviewer dispatch.
3. **Diff-scoped review ↔ `adev governance reviewers`**: the review dispatch step (BEH-8) filters the already-resolved reviewer set by keyword-match-against-diff rather than keyword-match-against-full-spec for cycles after the first.
4. **`lib/loop-convergence.mjs` ↔ manifest**: `not_converging_window` becomes a new manifest key under `build.*`, default 2, validated non-negative at load (mirrors `max_review_retries`'s existing validation).

## Actionable Task Map (Delta)

| Task | Description | Estimated Complexity | Owner Module |
|------|-------------|---------------------|--------------|
| `finding_class` + `remedy_ref` schema | Reviewer output schema gains the field; default/back-compat for legacy reviewers. | small | review |
| Per-section authoring dispatch | `skills/specify/SKILL.md` Revise Mode dispatches one subagent per implicated anchor before calling the mechanics verb. | medium | spec-lifecycle |
| Real-diff `addressed`/`unresolved` | `lib/specify-revise.mjs` splices sections, diffs pre/post text per anchor. | medium | spec-lifecycle |
| Mechanism-existence CLI verb | New verb: extract + resolve `file:line`/symbol/flag/error-code references. | medium | spec-lifecycle |
| `DECISION_REQUIRED` / `EXTERNAL_REMEDY` exits | Loop halts/excludes per `finding_class`. | small | strategic-planning |
| Diff-scoped review dispatch | Reviewer registry filtering restricted to changed-section context packs for cycles 2+. | medium | strategic-planning / review |
| `NOT_CONVERGING` verdict | `lib/loop-convergence.mjs` tracks blocker-count trend over `not_converging_window`. | small | strategic-planning |
| `growth_ratio` telemetry | `spec_revised` event gains the field; no consumer yet (advisory). | small | agent-reliable-state-artifacts |
| Deterministic convergence unit test | Synthetic multi-revision fixture asserting `lib/loop-convergence.mjs`'s `NOT_CONVERGING`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts and the mechanism-existence gate's short-circuit, mirroring `tests/lib/loop-convergence.test.mjs` and `tests/integration/build-loop-auto-retry.test.mjs`. No real dispatch — pure code paths. | medium | strategic-planning |
| Real-dispatch convergence eval | `tests/evals/convergence/run-convergence-eval.mjs` — already built. Drives real `/adev:build --full --auto` (real reviewer dispatch, real `--revise`) against the planted fixture at `tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md`, ground-truthed against the fixture's own lifecycle event log. Run with `--baseline-ref <pre-implementation-commit>` once this amendment is implemented, for the real before/after this task map's claims depend on. | medium | strategic-planning |
| Reviewer-registry documentation fix | Update touched SKILL.md/spec prose to describe the dispatched set as "whatever `adev governance reviewers` resolves for the project," correcting the base spec's stale reference to the generic architect/security/consistency prompt trio. | small | review |

## Acceptance Criteria

- [ ] Every BLOCK finding schema carries `finding_class` (`defect|decision|external`); legacy reviewer output defaults to `defect`.
- [ ] `decision`-classed blockers halt the loop immediately with `DECISION_REQUIRED`; they never enter authoring.
- [ ] `external`-classed blockers are excluded from this spec's convergence accounting and their `remedy_ref` is surfaced.
- [ ] `/adev:specify --revise` dispatches one authoring subagent per implicated `section_anchor` (parallel), each scoped to only that section's text plus its blockers.
- [ ] `addressed_blocker_ids`/`unresolved_blocker_ids` on `spec_revised` are computed from an actual pre/post text diff at each anchor, never from unconditional acknowledgement of the input set.
- [ ] A deterministic mechanism-existence check runs on every authored section before any reviewer dispatch; unresolved references become new blockers without a reviewer round.
- [ ] Cycles after a spec's first review dispatch reviewers in diff-scoped mode (changed sections + cross-references only); the first review of any spec/amendment remains full-tier.
- [ ] `lib/loop-convergence.mjs` computes `NOT_CONVERGING` (non-decreasing blocker count over `not_converging_window`, default 2) as a stop condition independent of blocker-ID identity.
- [ ] `build.max_review_retries` default remains 2 (reaffirmed, not changed) per `adev-plugin-lvcp`'s validated finding.
- [ ] A deterministic unit test demonstrates `lib/loop-convergence.mjs`'s `NOT_CONVERGING`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts and the mechanism-existence gate's short-circuit against synthetic multi-revision fixtures.
- [ ] `tests/evals/convergence/run-convergence-eval.mjs`, run in `--baseline-ref` A/B mode against a pre-implementation commit, shows the amended loop reaching PASS (or a correct `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exit) with fewer reviewer dispatches and lower cost than the unamended loop on the same planted fixture, using real reviewer and authoring dispatch — not a synthetic assertion.
- [ ] Touched SKILL.md/spec prose names the reviewer set as "whatever `adev governance reviewers` resolves for the project," correcting the base spec's stale `source-manifest` reference to `structural-architect-prompt.md`/`security-reviewer-prompt.md`/`consistency-analyzer-prompt.md`.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
- [ ] `adev-plugin-revise-loop-no-content-edits-q6q0` and `adev-plugin-j7pq.1` both close referencing this amendment's spec path once it validates.
