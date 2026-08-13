---
date: 2026-08-12
spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 1
file-sha: c057a52d7edb1cccf1b7bd047bfa7f6d1c9205c5af296a86bac8d4f92889d77e
---

# Architecture Review: pr-body-advisories

> **Date:** 2026-08-12
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` (revision 1)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md`
> **Rigor tier:** full (risk_level: medium → review_mode: full)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### Empirical finding on the spec's central claim

138 plan files carry a line-anchored `## Parallelization`. Against the spec's grammar `- Group <LETTER> (<qualifier>): <remainder>`:

| Outcome | Plans | Share |
|---|---|---|
| Reach rung 1 | 87 | 63% |
| Reach rung 2 | 4 | 3% |
| **Reach no rung the ladder defines** | **47** | **34%** |

Of 336 `- Group` lines, 328 (97.6%) match — but that per-line figure hides that a third of plans emit no `- Group` line at all. **The spec's "grammar verified against real shapes" claim does not hold.** The spec's author checked two samples; the corpus is 138.

### SA-1 — blocker — A third of the corpus falls through the ladder into a silent empty reading order

- **blocker_id:** `structural-architect:undefined-fallback-rung:8b35fee4`
- **section_anchor:** `reading-order-input-grammar-and-fallback-ladder`
- **Location:** Reading Order ladder table, rungs 1 and 3

47 of 138 plans (34%) have a present, non-empty `## Parallelization` containing zero `- Group` lines. Rung 1's condition ("every one of its `- Group` lines matches") is *vacuously true* for these, so they render a normal-case reading order that is empty, with no annotation. Rung 3 requires the section absent; the Error Cases row covers only "present but empty" — neither applies. 20 of the 47 use the bold variant `- **Group A (sequential):** Task 1 → Task 2` (`spec-amendment-artifacts.plan.md`, `store-and-helper.plan.md`, `validate-extraction.plan.md`, +17); the other 27 use unstructured prose (`completion-tokens.plan.md`: `- Task 1 (test) first — establishes RED.`).

This is precisely the silent-omission failure the spec says the ladder exists to prevent, and it fires on a third of the corpus.

**Recommendation:** Make rung 1 require at least one matching group line; define the rung for "section present and non-empty, zero conforming group lines"; restate the match rate against the real corpus.

### SA-2 — blocker — Two task-extraction rules conflict, and both mis-handle real input

- **blocker_id:** `structural-architect:ambiguous-behavior:344ab78b`
- **section_anchor:** `reading-order-input-grammar-and-fallback-ladder`
- **Location:** Reading Order — input grammar, task-number extraction

(a) Four lines match the grammar exactly yet yield zero `Task <N>` tokens — `- Group F (skill prose — …): Tasks 14, 15, 16, 17 (parallel)` (`retro-session-consumption.plan.md`), `- Group H (sequential): Tasks 8-14 (…)` (`domain-aware-skill-integration.plan.md`). They sit at rung 1, annotation-free, dropping every task in the group. (b) "Task numbers are the `Task <N>` occurrences in `<remainder>`" contradicts "parenthetical descriptions are ignored" for 22 lines where a parenthetical carries task numbers — `- Group G (sequential): Task 7 (refactor existing modules -- depends on Tasks 2, 3, 5, 6)` yields either `[7]` or `[7,2,3,5,6]` depending on which rule wins.

**Recommendation:** Define the task-token grammar as strictly as the group-line grammar, specify which text in `<remainder>` is in scope, and make a conforming group line yielding zero tasks a ladder-triggering condition rather than a rung-1 outcome.

### SA-3 — blocker — Rungs 2 and 3 depend on a `## Task Summary` that 35% of plans lack

- **blocker_id:** `structural-architect:missing-precondition:28421e36`
- **section_anchor:** `reading-order-input-grammar-and-fallback-ladder`
- **Location:** Fallback ladder rungs 2–3, Error Cases (unmatched `Task <N>`)

48 of 138 plans (35%) have no `## Task Summary` heading — including **all 4** plans that actually reach rung 2 (`contradiction-tracking.plan.md`, `hygiene-and-injection.plan.md`, `keyword-tags-and-tiered-retrieval.plan.md`, `unified-gate-system.plan.md`) and 18 of the 47 from SA-1. Rung 4 may absorb these, but the spec does not state the transition — and if it fires, rung 2's observability requirement (*name the offending line verbatim*) is lost in 100% of real rung-2 cases.

**Recommendation:** State the rung-2/3 → rung-4 transition when `## Task Summary` is absent, and whether the higher rung's annotation is preserved, replaced, or both.

### SA-4 — blocker — Undeclared `/adev:plan` dependency, and a second incompatible grammar for the same on-disk section

- **blocker_id:** `structural-architect:module-boundary-violation:1b16ef11`
- **section_anchor:** `reading-order-input-grammar-and-fallback-ladder`
- **Location:** Reading Order input grammar, charter Dependencies

The charter's Dependencies table lists `cli-driver-surface`, trailers, `/adev:route`, and `/adev:validate` — **not `/adev:plan`**, whose `## Parallelization` output is this spec's primary input. `worktree-parallelization/charter.md:140` already declares `plan ## Parallelization groups` as a consumed API, and `lib/parallel/groups.mjs:13-16` parses the same section under an incompatible grammar: qualifier restricted to `independent|sequential`, group id `[A-Za-z0-9]+`, task token `Task\s+([A-Za-z0-9.]+)`, bullet `[-*]` with leading whitespace tolerated. Two consumers, two grammars, no spec owning the contract — the same plan file yields different group sets to `/adev:implement --parallel` and to `adev pr body`. (`parallel-implement.review.md:28` raised this exact gap for the other consumer.)

**Recommendation:** Declare the `/adev:plan` dependency in the charter and name where the `## Parallelization` grammar is owned, or state explicitly that a second divergent grammar is intended and why it is safe.

### SA-5 — warning — The predicate for "a `- Group` line" is never defined, yet it decides whole-plan rung assignment

`unified-gate-system.plan.md` has conforming group lines plus the prose bullet `- Group by tier, execute in order: fast → integration → e2e`; under a `- Group` prefix test that bullet drops an otherwise-fully-parseable plan to rung 2. `- Groups A and B are independent…` and `- Group A and B can run in parallel after Task 1 completes` are summary prose that `skills/plan/SKILL.md:458` itself models.

**Recommendation:** Define the predicate distinguishing a group *declaration* subject to the all-or-nothing rule from prose that merely begins `- Group`.

### SA-6 — suggestion — Error Cases row 3 contradicts the ladder table

"Plan file present but unreadable → Rung 5" conflicts with rung 5's condition ("No plan file"). A present-but-unreadable plan matches rung 4's shape, and rung 5's annotation ("names the missing plan path") is wrong for a path that exists.

> **Checked and dismissed:** the `pr:` manifest block matches the existing `hygiene:`/`repomap:` top-level shape — no finding. No ADR conflict: the spec reads plans and writes nothing, leaving ADR-0012's closed four-peer sidecar set untouched. The charter's "size-advisory wiring — `cicd`" Out of Scope entry covers CI delivery, not stdout content generation; no boundary violation. Section Placement's marker-ordering rationale and the deferral of exception-class assertion to the author are both structurally sound.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

Authentication and Authorization are N/A — local read-only CLI verb with no auth boundary, consistent with the charter's threat model.

### SEC-1 — blocker — Plan path derived from a `Spec:` trailer with no containment, and its *content* is rendered

- **blocker_id:** `security-reviewer:input-validation:e838659b`
- **section_anchor:** `reading-order-input-grammar-and-fallback-ladder`
- **Category:** input-validation

The reading order derives `<spec-stem>.plan.md` directly from the `Spec:` trailer. Neither this spec nor `pr-body-composition.spec.md` requires `<spec-stem>` to resolve within `.context-index/specs/`. Any commit author can influence trailer content. Unlike the composition spec — which only checks *existence* of a trailer-derived path — this spec *reads file content* and renders it (opaque qualifiers, offending lines) into a public PR body.

**Failure scenario:** A commit author adds `Spec: ../../../../etc/some-file`. The verb resolves `<that-value>.plan.md`, reads whatever exists there, and echoes path and content details verbatim into a brief CI posts publicly.

**Recommendation:** Require the resolved plan path to normalize to a path under `.context-index/specs/**` before any read; reject and fall to rung 5 (naming the trailer value as invalid) rather than reading whatever the path points to.

### SEC-2 — blocker — "Verbatim" plan content is rendered with no escaping contract covering it

- **blocker_id:** `security-reviewer:data-exposure:6a3edc27`
- **section_anchor:** `reading-order-input-grammar-and-fallback-ladder`
- **Category:** data-exposure

This spec introduces rendered values the composition spec's escaping contract does not cover — that contract is scoped explicitly to *trailer values*. This spec's grammar defines the qualifier as "opaque: reproduced verbatim… and never interpreted," and rung 2's annotation "names the offending line verbatim." Both are plan-file content, and the grammar places no restriction on characters beyond excluding `)`.

**Failure scenario:** A plan file contains a group line or malformed line whose text includes `|` (breaks the table), a crafted link, or the literal `<!-- /adev:pr-brief -->` — spoofing the closing marker that `cicd` delivery searches for.

**Recommendation:** Explicitly extend the composition spec's escaping invariant to all plan-derived verbatim values (qualifier, task labels, rung-2 offending line): escape table-breaking characters and neutralize embedded marker strings. State it in the Reading Order section rather than leaving it implied by "verbatim", which currently means "not semantically parsed", not "output-safe".

### SEC-3 — warning — rate-limiting — No length bound on verbatim-reproduced values

`<qualifier>` is "any run of characters containing no `)`" — unbounded. A pathologically long group line inflates the rendered body; since `cicd` posts this into a forge comment, an oversized brief could hit comment-size limits and fail delivery of the *entire* brief, undermining "degrades loudly, never blocks" for a transport reason rather than a lifecycle-state gap.

**Recommendation:** Cap verbatim reproduction length with an explicit `…(truncated)` annotation, so truncation is itself a named, visible degradation.

### SEC-4 — suggestion — rate-limiting — `mirror_globs` pattern complexity is unbounded

Low risk since it comes from human-reviewed `manifest.yaml`, not per-commit input, but worth an implementation note pointing to anchored, non-nested-quantifier glob-to-regex translation so a pathological pattern cannot stall the verb on a large diff.

> No findings on Secrets/Configuration: the `pr:` block carries no credentials, and malformed values degrade to safe defaults with visible annotation as already specified.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-1 — warning — pattern — Stale renderer task in the sibling spec leaves marker-wrap ownership unnamed

**This spec:** both new sections render inside the single existing marker at slots 1 and 3; Postconditions require "no second marker is introduced."

**Conflicts with:** `pr-body-composition.spec.md` Actionable Task Map, row "Markdown renderer": *"Emit the three sections inside the marker, in fixed order, deterministically."* Not updated when that spec's revision 2 split the marker's contents across two owning specs. Neither Task Map names which module performs the single final marker wrap.

**Recommendation:** `pr-body-composition.spec.md` should change — a Task Map row describing emission of "this spec's three owned sections, in fixed relative order, for insertion into the shared marker", and one of the two specs should name the module responsible for the outer wrap. The behavioral contracts in both specs are already correct on "exactly one marker", so this is stale implementation guidance, not a behavioral contradiction. (Same defect as SA-5 on the composition spec.)

### Verified consistent (no finding)

- **Five-slot table** — identical in both specs: names, numbering, order, owning-spec assignment. No "three sections" wording survives as a *current-state* claim in the composition spec; its one "three" reference correctly describes revision-1 history.
- **Marker placement claim** — this spec's assertion that the packet template places the marker pair after all four author sections with the closing marker last is verified verbatim against that spec's Structural Shape and Acceptance Criteria.
- **`--amend` claim** — verified against `spec-amendment-artifacts.spec.md`: amendment artifacts are reserved for already-`validated` specs, so in-place revision of a `review-pending` spec is correctly the non-amendment path.
- **Manifest `pr:` block** — shape and snake_case keys match `hygiene:`/`repomap:`/`completion:` conventions; `<subject>_threshold_<unit>` mirrors `staleness_threshold_days`.
- **Terminology, constitution citations, file-suffix conventions** — all verified against source.

---

## Summary

**Total findings:** 11 (6 blockers, 2 warnings, 3 suggestions)

**Action required:** Revise the spec to address the six blockers, then re-review.

The structural blockers are all one root cause: **the grammar and ladder were designed against two hand-picked samples, not the corpus.** Measured against all 138 plans, 34% fall through every defined rung into a silent empty reading order (SA-1) — the exact failure the ladder was written to prevent, and the spec's own stated reason for existing. SA-2 and SA-3 are further instances: conforming lines that yield no tasks, and two rungs that depend on a `## Task Summary` that 35% of plans lack, including every plan that actually reaches rung 2.

SA-4 is separate and structural: `lib/parallel/groups.mjs` already parses this same section under a different grammar, and the charter never declares the `/adev:plan` dependency. Shipping a second divergent grammar for one on-disk format needs an explicit decision, not silence.

SEC-1 and SEC-2 mirror the composition spec's SEC-1/SEC-2 but are more severe here, because this spec reads and renders plan-file *content*, not just checks a path's existence.

Run `/adev:specify --revise .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` to produce revision 2, then re-review.
