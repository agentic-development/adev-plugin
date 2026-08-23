---
partial_schema: implement@1
mode: cross-cutting
affects: [agent-reliable-state-artifacts, spec-lifecycle, strategic-planning, review]
kind: behavioral
status: implemented
risk_level: high
revision: 6
charter-revision: 1
amends: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
target-revision: 2
created: 2026-08-21
updated: 2026-08-23
source-manifest:
  sha: "b6f24f0"
  files:
    - .context-index/governance/diagnostics.yaml
    - lib/blockers-writer.mjs
    - lib/cli/governance.mjs
    - lib/cli/specify.mjs
    - lib/diagnostics/tier2/mechanism-existence.mjs
    - lib/governance/diff-scope.mjs
    - lib/governance/remedy-ref-render.mjs
    - lib/loop-convergence.mjs
    - lib/manifest.mjs
    - lib/specify-revise.mjs
    - lib/token-pricing.mjs
    - skills/build/SKILL.md
    - skills/build/blocker-auto-retry-loop.md
    - skills/review-specs/SKILL.md
    - skills/specify/SKILL.md
    - skills/specify/revise-mode-authoring-dispatch.md
    - tests/cli/governance-diff-scope.test.mjs
    - tests/cli/specify-check-mechanisms.test.mjs
    - tests/cli/specify-group-blockers.test.mjs
    - tests/cli/specify-revise.test.mjs
    - tests/diagnostics/tier2/mechanism-existence.test.mjs
    - tests/evals/convergence/README.md
    - tests/evals/convergence/results/convergence-eval-2026-08-22.md
    - tests/evals/convergence/results/convergence-eval-2026-08-23.md
    - tests/evals/convergence/run-convergence-eval.mjs
    - tests/evals/integration-sandbox/.context-index/governance/review.yaml
    - tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md
    - tests/evals/integration-sandbox/lib/loop-fixture/rate-limiter.mjs
    - tests/evals/token-optimization/run-ab-eval.mjs
    - tests/governance/diff-scope.test.mjs
    - tests/governance/finding-class-consolidation.test.mjs
    - tests/integration/build-loop-auto-retry.test.mjs
    - tests/lib/blockers-writer.test.mjs
    - tests/lib/governance/remedy-ref-render.test.mjs
    - tests/lib/loop-convergence.test.mjs
    - tests/lib/manifest.test.mjs
    - tests/lib/specify-revise.test.mjs
  computed-at: "2026-08-23T12:18:54.680Z"
drift_detected: true
---

# Amendment: Live Spec: Auto-Retry Loop on Review BLOCK (targeting rev 2)

> This spec **amends** `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` targeting revision 2.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

The base spec's Behavior 1 promises a "TARGETED patch addressing each blocker." In practice `lib/specify-revise.mjs::reviseSpec` never edits spec body content — `renderFrontmatter` rewrites only `revision`/`updated`/`status`; the body captured at parse time passes through byte-identical. `addressed`/`unresolved` are hardcoded (`addressed = all input blockers`, `unresolved = []`) regardless of what changed. Two consequences, tracked as `adev-plugin-revise-loop-no-content-edits-q6q0` (P1, this amendment's primary driver; `adev-plugin-j7pq.9`, an exact duplicate, closed in favor of it in the project's shared issue store — a worktree's local `.beads/issues.jsonl` copy may lag behind that closure until synced, the same class of staleness `lib/issues/resolve-root.mjs` documents for `tasks.json` shadow boards):

1. **False provenance.** The `spec_revised` event claims every blocker was addressed even when zero bytes changed. Anything reading the log (`/adev:retro`, `/adev:hygiene`, delivery metrics) sees fabricated progress.
2. **Guaranteed non-convergence for any content-requiring blocker.** No edit → identical re-review → identical `blocker_id`s → the loop can only "succeed" on blockers that needed no content change at all, which is close to the empty set. Observed cost: ~8-11 minutes and ~120-145K subagent tokens per cycle to discover the verb did nothing.

Fixing only the authoring gap is not sufficient on its own. `adev-plugin-j7pq.1` recorded eight full-tier review cycles across two cross-cutting specs (~1.37M subagent tokens, zero PASS) in which **every content edit was authored by hand** — a real fix each time — and the loop still failed to converge, halting on `BUDGET_EXHAUSTED` or a coin-flip `REGRESSED`. Root cause: `persistent: 0` in all eight cycles, because an LLM reviser that is shown every blocker explicitly will always produce text that addresses each one literally, making the base spec's `NO_PROGRESS` guard (`persistent == prev_blockers`) structurally unreachable. `j7pq.1` also found the dominant defect class across all eight cycles was specifying behavior against a mechanism that does not exist in the codebase (a symbol, flag, or event variant with no implementation) — a class of defect that is mechanically checkable and was, in the observed runs, caught only after a full expensive review round.

This amendment therefore does two things together, because `j7pq.1`'s data shows one without the other does not converge: (1) gives the loop a real, AI-driven authoring step scoped per implicated section rather than per whole document, so it is both real and cheap; and (2) replaces the base spec's identity-based stall guard with a trend-based one, adds a deterministic pre-review gate for the dominant defect class, and classifies blockers so ones that can never be resolved by rewriting text stop consuming loop budget.

**Reviewer-registry correction.** The base spec's `source-manifest.files` lists `skills/review-specs/structural-architect-prompt.md`, `security-reviewer-prompt.md`, and `consistency-analyzer-prompt.md` — the generic three-specialist default that was accurate when the base spec was authored (2026-05-19). This project's registry has since been retargeted by the reviewer-domain-fit initiative (`adev governance reviewers --json`): `structural-architect` and `security-reviewer` are now `enabled: false` for this project's shape (Node CLI/plugin, not web-service), replaced by `referent-integrity`, `wiring-reviewer`, and `boundary-reviewer` (all `dispatch: always`, alongside `consistency-analyzer`), plus a `termination-reviewer` triggered on the keywords `loop`, `retry`, `poll`, `polling`, `iterate`, `iteration`, `recurring`, `convergence`, `auto-retry` — a set this very amendment's subject matter will trigger. Every behavior below is written against "the reviewer set `adev governance reviewers` resolves for the project," never a fixed count or named trio, and Behavior 8 and the diff-scoped dispatch task explicitly correct the drift.

**Live confirmation attempt (2026-08-22).** An eval harness (`tests/evals/convergence/run-convergence-eval.mjs`) was built to reproduce this defect against a planted fixture (`tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md`) and executed once. The run's own artifacts are inconclusive as evidence for this amendment: the fixture's lifecycle log (`tests/evals/integration-sandbox/.context-index/lifecycle-state/broken-loop-fixture.jsonl`) records only a `specify` step (`started` → `step_completed` verdict `PASS`) — zero `reviewer_report` or `spec_revised` events, so no review cycle actually ran against the fixture in that trial — and the results report (`tests/evals/convergence/results/convergence-eval-2026-08-22.md`) records cost as `n/a`, median tokens `0`, and `Verdicts observed: UNKNOWN`. The harness and fixture exist and are re-runnable, but this section does not claim a live reproduction occurred; this amendment's live-defect evidence rests on `q6q0`/`j7pq.9` and `j7pq.1`'s eight hand-authored review cycles (above), not on this smoke run. Re-running the harness to completion — so the fixture log actually carries reviewer and revise events — would strengthen this section but has not yet been done.

## Behavioral Delta

### Behaviors Added

<!-- retired-behavior-ids: BEH-10 (growth_ratio telemetry — dropped rev 1→2, no named consumer at time of drop) -->

- **BEH-1** — **When** `/adev:review-specs` (or a reviewer subagent it dispatches) emits a BLOCK-severity finding **then** the finding carries a required `finding_class` field with value `defect` (the spec text itself is wrong), `decision` (the finding names an unresolved design choice, not a wording problem), or `external` (the remedy lives in a different artifact, named in a companion `remedy_ref` field). Reviewer output that predates this amendment and carries no `finding_class` defaults to `defect`. **Persistence:** `lib/blockers-writer.mjs`'s sidecar entry schema gains `finding_class` and, when present, `remedy_ref` as additional YAML keys per entry in `.blockers.md` — alongside the existing `blocker_id`/`section_anchor`/`reviewer_count` — so BEH-2 and BEH-3 read these fields from the durable sidecar the loop actually consumes, not from ephemeral reviewer output that no longer exists once the reviewer subagent's turn ends. **Validation before persistence:** both fields are reviewer-authored and therefore untrusted, per this spec's own posture (BEH-6). Before `writeBlockers` interpolates either into the fenced YAML block, it refuses (never sanitizes, mirroring `lib/extensions/governance-values.mjs`'s `assertSafeScalar` posture) a `finding_class` value outside the closed three-value enum, and refuses a `remedy_ref` value containing a YAML flow indicator, a colon-space sequence, or any content that would reparse to a non-string type — the same refuse-don't-sanitize gate BEH-5a applies to authored section bodies, applied here to sidecar fields instead. **Disposition on refusal:** a refused value is never dropped and never aborts the write — the entry is retained with the offending field forced to its safe default (`finding_class: defect`; `remedy_ref` omitted entirely) and a `FINDING_CLASS_REJECTED` or `REMEDY_REF_REJECTED` advisory logged naming the blocker_id, mirroring BEH-5a's discard-and-preserve pattern rather than either silently dropping the entry (which would remove a real `defect` blocker from convergence accounting and let the loop falsely progress toward PASS) or letting the write throw uncaught. This is distinct from `FINDING_CLASS_DEFAULTED` (BEH-1's existing absent-value case) — that covers a missing field; this covers a present-but-invalid one. Independently of that write-time gate, every render path that displays `remedy_ref` (both channels named in BEH-3) applies control-character and ANSI-escape stripping plus a length bound at render time, mirroring `check-id-enum.spec.md`'s SEC-8 guard for externally-sourced identifiers rendered to a terminal — a value that passed the write-time gate is not assumed safe for every subsequent display context.
- **BEH-2** — **When** the auto-retry loop reads `.blockers.md` and a blocker's `finding_class` is `decision` **then** the loop does not dispatch authoring (BEH-4) for that blocker; it halts immediately with verdict `DECISION_REQUIRED`, writes the sidecar+fail-loud artifacts, and reports the blocker's prose and `section_anchor` for a human decision.
- **BEH-3** — **When** a blocker's `finding_class` is `external` **then** the loop excludes it from this spec's convergence accounting (it can never be `addressed` here), continues the loop for any remaining `defect`-classed blockers in the same batch, and — because this path does not halt, so BEH-2's sidecar+fail-loud reporting never fires for it — surfaces its `remedy_ref` through two named, concrete channels instead: (1) `skills/build/SKILL.md`'s per-cycle progress output gains an "External remedies" line per `external`-classed blocker, listing its `blocker_id`, `section_anchor`, and `remedy_ref`; (2) the next `/adev:review-specs` invocation's `.review.md` report (Step 5's Consolidated Report Format) carries a matching "External Remedies" section listing the same, so the artifact a human reads on disk and the loop's live console output agree.
- **BEH-4** — **When** `/adev:specify --revise <spec>` is invoked and `.blockers.md` contains one or more `defect`-classed blockers **then**, before the mechanics verb runs, the skill groups those blockers by `section_anchor` and dispatches one subagent per distinct anchor, in parallel, each given only that section's current text, the anchor's blocker prose entries, and minimal charter/frontmatter context — instructed to return a rewritten section body plus a one-line rationale. An anchor with no matching heading in the spec body is reported to the operator; authoring is skipped for that entry. This is new behavior this amendment introduces — the base spec's Behavior 3 treats `section_anchor` as an opaque component of `blocker_id`'s deterministic hash and defines no handling for an anchor that fails to resolve to a heading.
- **BEH-5** — **When** all per-section authoring subagents from BEH-4 have returned **then** the mechanics verb validates each returned section body before splicing — refusing (not sanitizing) any body containing a `---` frontmatter-fence line or a control character, mirroring `assertSafeScalar`'s refuse-don't-sanitize posture — splices every body that passes validation back into the spec at its anchor, then re-parses the full post-splice file to confirm the frontmatter still parses before the atomic write commits. Every non-implicated section stays byte-identical, preserving the base spec's Behavior 1 guarantee. The verb computes `addressed_blocker_ids` as exactly the blockers whose anchored section text differs from its pre-authoring content, never by acknowledging the full input set. `unresolved_blocker_ids` is every loop-eligible blocker whose anchor text is unchanged after authoring, plus any whose authored body failed validation (BEH-5a below).
- **BEH-5a** — **When** an authored section body fails BEH-5's validation (contains a frontmatter-fence line, a control character, or produces a file that fails to re-parse post-splice) **then** the verb discards that body, leaves the anchor's prior text in place, marks the blocker `unresolved`, and records a `SPLICE_VALIDATION_FAILED` advisory naming the anchor — the write is never partially applied.
- **BEH-6** — **When** a spliced revision is produced by BEH-5 **then**, before dispatching `/adev:review-specs` again, the CLI verb `adev specify check-mechanisms --spec <path>` extracts every `file:line` and `file::symbol` citation the newly authored text names and checks that each resolves against the current repository tree — no reviewer subagent is dispatched for this check. It additionally extracts `--flag` and `UPPER_SNAKE_ERROR_CODE` tokens **for visibility only**: neither names a single file to check against, so neither has a checkable filesystem invariant in this gate's scope, and their presence or absence never affects `fired`/blocker construction. Every extracted path candidate is first lexically pre-checked for a `../` traversal segment before any filesystem access — the same pre-check `assertContained` (`lib/extensions/exec-payload.mjs:174-183`) applies to relative candidates — and then resolved and realpath-contained against a realpath'd repo-root base: the check refuses (never silently treats as "not found") any candidate that fails the lexical pre-check, resolves outside the repository root, or cannot be resolved at all (`ENOENT`, broken symlink) — authored text is subagent-produced from blocker prose and spec content, which this spec's own security posture already treats as untrusted, so a path escape here must fail loud, not fail open.
- **BEH-7** — **When** the mechanism-existence check in BEH-6 finds one or more unresolved references **then** each becomes a new blocker (its own deterministic `blocker_id`, `finding_class: defect`) and the loop returns to authoring (BEH-4) for the affected anchors within the current revision, or stops with `BUDGET_EXHAUSTED` if `max_review_retries` is already exhausted. This inner authoring↔mechanism-check round-trip does **not** increment `max_review_retries` — that counter tracks outer review cycles (BEH-11), not inner gate retries — but each inner round-trip does increment its own fixed cap of 3 attempts per revision, independent of the outer budget; exhausting the inner cap stops with `BUDGET_EXHAUSTED` the same as the outer one. `BUDGET_EXHAUSTED` reached via this gate follows the identical sidecar+fail-loud, exit-non-zero path BEH-9 uses for `NOT_CONVERGING` — this is the same terminal-verdict handling the loop already applies everywhere, not a separate unattended-safety story to hold together across two behaviors. A cycle resolved entirely at this gate never pays for a reviewer dispatch.
- **BEH-8** — **When** BEH-6 passes for a revision produced by `/adev:specify --revise` within an auto-retry loop, and the lifecycle log already carries a `step_completed` event for this spec's `review` step at an earlier revision (i.e., this is not the spec's first review) **then** `/adev:review-specs` is dispatched in **diff-scoped context** mode: only reviewers whose `dispatch` resolves to `always`, or whose `triggered` keyword match fires against the changed sections' text, are invoked, and each dispatched reviewer's context pack is restricted to the changed sections plus any section containing a markdown link or heading-name mention targeting a changed section's anchor (a literal-text scan, not a general reference resolver), rather than the full spec body. **Diff-scoped context is orthogonal to the rigor tier (full/quick) `graduated-rigor-tiers.spec.md` defines** — that spec resolves reviewer *breadth* (three-plus specialists vs. one synthesized reviewer) via `--tier override > routing signal > risk policy > full`, and BEH-8 does not read, override, or otherwise interact with that resolution; whichever tier `resolveRigorMode` picks governs which reviewers are candidates, and BEH-8 only narrows *what those candidates see* on a non-first review. The very first review of any spec or amendment always uses full-context dispatch (every candidate reviewer sees the complete spec body) regardless of rigor tier — this is a rule this amendment introduces, not one inherited from any other spec.
- **BEH-9** — **When** `lib/loop-convergence.mjs` evaluates a cycle **then**, in addition to the base spec's PASS / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED verdicts, it computes `NOT_CONVERGING`: true when the total loop-eligible blocker count has been non-decreasing for `not_converging_window` consecutive cycles (default 2, manifest-configurable under `build.not_converging_window`), independent of whether the specific `blocker_id`s churned. `NOT_CONVERGING` is evaluated before `NO_PROGRESS` and stops the loop via the same sidecar+fail-loud path, because `adev-plugin-j7pq.1` found `persistent == prev_blockers` structurally near-unreachable against an LLM reviser that always responds to every listed blocker.
- **BEH-11** — **When** `build.max_review_retries` is read from manifest with no explicit value **then** the default remains **2**, reaffirming the base spec's Behavior 10 (`review-block-auto-retry.spec.md`) and its implementation default at `lib/manifest.mjs:147`, against the drift recorded in `adev-plugin-j7pq.1` (raised to 5 on a misreading of `persistent: 0`). This amendment closes that drift risk by putting the "why 2, not 5" reasoning in a spec rather than only in issue history.

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
| A BLOCK finding has a present `finding_class` outside the closed enum, or a `remedy_ref` containing a YAML flow indicator/colon-space/type-coercing content | Retain the entry; force the offending field to its safe default (`defect` / omitted); log advisory naming the `blocker_id` — never drop the entry, never abort the write | `FINDING_CLASS_REJECTED` / `REMEDY_REF_REJECTED` (advisory) |
| A `decision`-classed blocker reaches the loop | Halt immediately with `DECISION_REQUIRED`; do not dispatch authoring | `DECISION_REQUIRED` |
| An `external`-classed blocker reaches the loop | Exclude from this spec's convergence accounting; surface `remedy_ref` | `EXTERNAL_REMEDY` (advisory) |
| A `section_anchor` in `.blockers.md` matches no heading in the spec body | Report to operator; skip per-anchor authoring for that entry | `ANCHOR_NOT_FOUND` |
| An authored section body contains a frontmatter-fence line or control character, or the post-splice file fails to re-parse | Refuse the splice for that anchor; preserve prior text; mark `unresolved`; log advisory (BEH-5a) | `SPLICE_VALIDATION_FAILED` (advisory) |
| A mechanism-existence candidate path resolves outside the repository root, or cannot be resolved at all (including a relative candidate refused by a lexical pre-check before any filesystem access, mirroring `assertContained`'s `../` guard) | Refuse the candidate at the CLI-verb level (never silently "not found"); the verb's refusal is itself recorded as one `mechanism-existence` finding | `MECHANISM_PATH_ESCAPE` (refusal-event code; the resulting blocker is uniformly classified below) |
| Mechanism-existence check (BEH-6) finds an unresolved reference — whether a genuine non-existent referent or a path-escape refusal above | Record as a new `mechanism-existence` blocker (`finding_class: defect`); loop back to authoring, or stop with `BUDGET_EXHAUSTED` via the same sidecar+fail-loud, exit-non-zero path `NOT_CONVERGING` uses | `MECHANISM_NOT_FOUND` (the blocker's category; always this value regardless of which check above produced it) |
| Loop-eligible blocker count is non-decreasing for `not_converging_window` consecutive cycles | Stop with `NOT_CONVERGING`; sidecar+fail-loud; exit non-zero | `LOOP_NOT_CONVERGING` |

## System Constitution Reference

- **Principle: "Skills are primarily markdown."** — Per-section authoring (BEH-4) is a subagent dispatch from skill prose (`skills/specify/SKILL.md` Revise Mode), not executable logic embedded in SKILL.md; splicing, diffing, and mechanism-existence checking (BEH-5, BEH-6) are companion CLI verbs.
- **Principle: "Minimize external dependencies."** — Mechanism-existence checking uses `fs`/`path`/existing repo-map-equivalent built-ins; no new dependency for symbol resolution.
- **cli-driver-surface anti-pattern ("no inline Node in SKILL.md").** — The authoring dispatch, splice, diff, and mechanism-existence steps are all named CLI verbs or Agent dispatches from prose, never inline Node.

## Module Impact Map (Delta)

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `review` (skills/review-specs) | Medium | Reviewer output schema gains `finding_class` (+ `remedy_ref` for `external`); legacy output defaults to `defect`. `lib/blockers-writer.mjs`'s persisted sidecar schema gains the same two fields, so BEH-2/BEH-3 read them from `.blockers.md`, not from ephemeral reviewer output. |
| `spec-lifecycle` | High | `lib/specify-revise.mjs` gains per-section splice with pre-commit validation (BEH-5/5a) + real-diff `addressed`/`unresolved` computation; new mechanism-existence CLI verb with realpath containment (BEH-6); skill dispatches per-anchor authoring subagents before calling the mechanics verb. |
| `strategic-planning` | High | `skills/build/SKILL.md` loop gains `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exits (including the "External remedies" progress line, BEH-3), an `adev specify check-mechanisms` call inserted between the revise and re-review steps (BEH-6/7), diff-scoped context dispatch (BEH-8, orthogonal to rigor tier), and `NOT_CONVERGING` handling in `lib/loop-convergence.mjs` (BEH-9) — Step 5's existing `build.max_review_retries` read is extended to also resolve `build.not_converging_window` and pass it into `evaluateStopCondition`. |
| `agent-reliable-state-artifacts` | Low | `lib/blockers-writer.mjs`'s sidecar entry schema gains `finding_class`/`remedy_ref` YAML keys (BEH-1) with a refuse-don't-sanitize validation gate before interpolation; no lifecycle event schema change. |

## Integration Points (Delta)

1. **Authoring subagents ↔ `lib/specify-revise.mjs`**: the mechanics verb now accepts pre-authored section bodies (keyed by anchor) as input, rather than performing a no-op frontmatter-only rewrite.
2. **Mechanism-existence check ↔ repo tree**: new CLI verb reads authored section text, extracts referenced `file:line`/symbol/flag/error-code tokens, realpath-contains each candidate against the repo root (refusing escapes and unresolvable candidates per BEH-6), and checks resolution against the working tree before any reviewer dispatch.
3. **Diff-scoped review ↔ `adev governance reviewers`**: the review dispatch step (BEH-8) filters the already-resolved reviewer set by keyword-match-against-diff rather than keyword-match-against-full-spec for cycles after the first, independent of the rigor-tier resolution `graduated-rigor-tiers.spec.md` governs.
4. **`lib/loop-convergence.mjs` ↔ manifest**: `not_converging_window` becomes a new manifest key under `build.*`, default 2, validated non-negative at load (mirrors `max_review_retries`'s existing validation).
5. **Splice validation ↔ `lib/specify-revise.mjs`**: BEH-5/5a's refuse-and-preserve check runs against every authored body before the atomic write, re-parsing the full post-splice file's frontmatter before commit.

## Actionable Task Map (Delta)

| Task | Description | Estimated Complexity | Owner Module |
|------|-------------|---------------------|--------------|
| `finding_class` + `remedy_ref` schema | Reviewer output schema gains the field; `lib/blockers-writer.mjs`'s persisted sidecar schema gains matching YAML keys per entry so BEH-2/BEH-3 read from `.blockers.md`, not ephemeral reviewer output; default/back-compat for legacy reviewers. | small | review |
| Per-section authoring dispatch | `skills/specify/SKILL.md` Revise Mode dispatches one subagent per implicated anchor before calling the mechanics verb. | medium | spec-lifecycle |
| Real-diff `addressed`/`unresolved` + splice validation | `lib/specify-revise.mjs` splices sections, diffs pre/post text per anchor, refuses bodies with frontmatter-fence lines or control characters (BEH-5a), re-parses post-splice frontmatter before commit. | medium | spec-lifecycle |
| `adev specify check-mechanisms` CLI verb (path-contained) | New verb: extract + resolve `file:line`/`file::symbol` references, realpath-containing every candidate against the repo root per `assertContained`'s pattern, refusing escapes/unresolvable candidates; extracts `--flag`/`UPPER_SNAKE_ERROR_CODE` tokens for visibility only (no checkable filesystem invariant, per BEH-6). | medium | spec-lifecycle |
| `DECISION_REQUIRED` / `EXTERNAL_REMEDY` exits | Loop halts/excludes per `finding_class`. | small | strategic-planning |
| Diff-scoped review dispatch | Reviewer registry filtering restricted to changed-section context packs for cycles 2+, orthogonal to rigor-tier resolution. | medium | strategic-planning / review |
| Diff-scoped dispatch filter test | Deterministic test asserting BEH-8's reviewer-set and context-pack restriction actually narrows on a non-first review, independent of the expensive real-dispatch eval. | small | strategic-planning / review |
| `NOT_CONVERGING` verdict | `lib/loop-convergence.mjs` tracks blocker-count trend over `not_converging_window`. | small | strategic-planning |
| Deterministic convergence unit test | Synthetic multi-revision fixture asserting `lib/loop-convergence.mjs`'s `NOT_CONVERGING`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts, `DECISION_REQUIRED`/`EXTERNAL_REMEDY` halts/exclusions, and the mechanism-existence gate's short-circuit (including its path-containment refusal), mirroring `tests/lib/loop-convergence.test.mjs` and `tests/integration/build-loop-auto-retry.test.mjs`. No real dispatch — pure code paths. | medium | strategic-planning |
| Per-anchor authoring fan-out test | Deterministic test asserting BEH-4 dispatches exactly one subagent per distinct `section_anchor` present among `defect`-classed blockers, each scoped to only that anchor's text and blockers — not just asserting the splice's output. | small | spec-lifecycle |
| Real-dispatch convergence eval | `tests/evals/convergence/run-convergence-eval.mjs` — already built. Drives real `/adev:build --full --auto` (real reviewer dispatch, real `--revise`) against the planted fixture at `tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md`, ground-truthed against the fixture's own lifecycle event log. Run with `--baseline-ref <pre-implementation-commit>` once this amendment is implemented, for the real before/after this task map's claims depend on. | medium | strategic-planning |
| Reviewer-registry documentation fix | Update touched SKILL.md/spec prose to describe the dispatched set as "whatever `adev governance reviewers` resolves for the project," correcting the base spec's stale reference to the generic architect/security/consistency prompt trio. | small | review |

## Acceptance Criteria

- [ ] Every BLOCK finding schema carries `finding_class` (`defect|decision|external`); legacy reviewer output defaults to `defect`. `lib/blockers-writer.mjs`'s persisted `.blockers.md` sidecar schema carries the same fields per entry, and BEH-2/BEH-3 read them from there, not from ephemeral reviewer output.
- [ ] `decision`-classed blockers halt the loop immediately with `DECISION_REQUIRED`; they never enter authoring.
- [ ] `external`-classed blockers are excluded from this spec's convergence accounting and their `remedy_ref` is surfaced, with a named report/function that renders it.
- [ ] `/adev:specify --revise` dispatches one authoring subagent per implicated `section_anchor` (parallel), each scoped to only that section's text plus its blockers.
- [ ] `addressed_blocker_ids`/`unresolved_blocker_ids` on `spec_revised` are computed from an actual pre/post text diff at each anchor, never from unconditional acknowledgement of the input set. An authored body that fails BEH-5a's validation (frontmatter-fence line, control character, or failed post-splice re-parse) is refused, its anchor's prior text preserved, and the blocker marked `unresolved`.
- [ ] `adev specify check-mechanisms` runs on every authored section before any reviewer dispatch; every extracted candidate is realpath-contained against the repo root, refusing (not silently skipping) escapes and unresolvable candidates; unresolved references become new blockers without a reviewer round.
- [ ] Cycles after a spec's first review dispatch reviewers in diff-scoped **context** mode (changed sections + cross-references only, per BEH-8) — orthogonal to the rigor tier `graduated-rigor-tiers.spec.md` resolves, which BEH-8 neither reads nor overrides. The first review of any spec/amendment always uses full-context dispatch, a rule this amendment introduces directly rather than citing another spec for it.
- [ ] `lib/loop-convergence.mjs` computes `NOT_CONVERGING` (non-decreasing blocker count over `not_converging_window`, default 2) as a stop condition independent of blocker-ID identity.
- [ ] `build.max_review_retries` default remains 2 (reaffirmed, not changed) per the base spec's Behavior 10 and `lib/manifest.mjs:147`.
- [ ] A deterministic unit test demonstrates `lib/loop-convergence.mjs`'s `NOT_CONVERGING`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts, `DECISION_REQUIRED`/`EXTERNAL_REMEDY` halts/exclusions, the mechanism-existence gate's short-circuit (including its path-containment refusal), the per-anchor authoring fan-out itself, and the diff-scoped dispatch filter — all against synthetic fixtures, no real dispatch.
- [ ] `tests/evals/convergence/run-convergence-eval.mjs`, run in `--baseline-ref` A/B mode against a pre-implementation commit, shows the amended loop reaching PASS (or a correct `DECISION_REQUIRED`/`EXTERNAL_REMEDY` exit) with fewer reviewer dispatches and lower cost than the unamended loop on the same planted fixture, using real reviewer and authoring dispatch — not a synthetic assertion.
- [ ] Touched SKILL.md/spec prose names the reviewer set as "whatever `adev governance reviewers` resolves for the project," correcting the base spec's stale `source-manifest` reference to `structural-architect-prompt.md`/`security-reviewer-prompt.md`/`consistency-analyzer-prompt.md`.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
- [ ] `adev-plugin-revise-loop-no-content-edits-q6q0` and `adev-plugin-j7pq.1` both close referencing this amendment's spec path once it validates.
