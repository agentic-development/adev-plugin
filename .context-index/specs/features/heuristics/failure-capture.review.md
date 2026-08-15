---
spec: .context-index/specs/features/heuristics/failure-capture.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 2
file-sha: 80b1a424331dcd7dda7d5626db101a702d111cb05a97f95aba0bcec3d32340e3
---

# Architecture Review: failure-capture

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/failure-capture.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` would resolve identically)
> **Spec revision at review:** 2
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Domain resolution: `software` (source level: `default`). No governance reviewer overrides
(`.context-index/governance/review.yaml` declares `reviewers: []`). No load warnings.
Context pack `base` is empty; reviewers were given repo-relative read paths plus the module
heuristics block (3 entries at `summary` tier). No skill extensions (`__NONE__`).
Governance `transitions:` is `{}` — no `spec-to-plan` approver role to report.

## Prior-Blocker Partition (revision 1 → revision 2)

All seven revision-1 blockers were verified as addressed at source. **None is re-raised.**

| Prior blocker_id | Status at revision 2 |
|---|---|
| `structural-architect:missing-contract-input:9df6d845` | Fixed — Behavior 1a and the Input-scoping precondition define the consumed field set and the no-fallback rule |
| `structural-architect:false-codebase-claim:e0f815c6` | Fixed — the "Two keys" section retracts the signature-appends-evidence claim; matches `lib/heuristics.mjs:952` |
| `structural-architect:unsatisfiable-acceptance:d4ec3950` | Fixed — Behavior 4a's closed-loop argument holds against `autoPromote` (`lib/heuristics.mjs:893-894`) and `report_path` derivation (`hooks/post-validate-extract-heuristics.mjs:136-138`) |
| `structural-architect:unsatisfiable-contract:ffabead9` | Fixed — Behavior 5a's `--digest-only` closes the Behavior 7a integration gap |
| `security-reviewer:data-exposure:ffaf2f81` | Fixed for the vector it targeted — the FAIL path never reaches `tool_result` subprocess channels |
| `consistency-analyzer:domain-model:2f539e05` | Fixed — `id`/`signature` roles are disjoint and consistent across Behaviors 4/4a, Task Map, and Acceptance Criteria |
| `consistency-analyzer:contract:8863f48f` | Fixed — `--digest-only` supplies the bare digest recover needs |

The four blockers below are **new at revision 2** and disjoint from the prior set.

## Spec-vs-Implementation Verification

Every line citation in the spec was checked against live source on this branch. Accurate:
`lib/heuristics.mjs:952` (`findIndex((e) => e.id === entry.id)`), `lib/heuristics.mjs:894`
(`new Set(evidence.map(e => e.path)).size`), `hooks/post-validate-extract-heuristics.mjs:136-138`
(`report_path` defaulting to `<spec-stem>.validate.md`), `lib/cli/heuristics.mjs:519-523`
(`SIGNATURE_USAGE` and the closed `SIGNATURE_ORIGINS` enum), `skills/recover/SKILL.md:387-397`,
and the "27 references" count for `extract` in `tests/cli/heuristics.test.mjs`.
The hook's PASS gate is at line 72, not 73 as cited — an off-by-one that does not affect the claim.

`--digest-only` (Behavior 5a) is correctly treated as new in-scope work, not a codebase claim.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — blocker
- **blocker_id:** `structural-architect:false-codebase-claim:c4d27eaa`
- **section_anchor:** `behaviors-3`
- **Location:** Behavior 3; Task Map row "Outcome-derived title prefix"; Postconditions bullet 2
- **Finding:** Behavior 3 asserts the `"First-run PASS: "` prefix is duplicated in exactly two places
  (`lib/cli/heuristics.mjs` and the hook) and that "after this spec lands exactly one copy remains —
  the hook's"; the Task Map repeats "two copies exist now, one remains". A third live copy sits at
  `tests/skills/validate-success-heuristic-harness.mjs:112`, untouched by this spec. That harness is
  not a test of the hook — `tests/skills/validate-success-heuristic.test.mjs:19` and
  `tests/skills/validate-extraction.test.mjs` import `runCheck12` from it and never invoke
  `hooks/post-validate-extract-heuristics.mjs`. The PASS-path suite would therefore keep asserting the
  old prefix (`validate-success-heuristic.test.mjs:97-100`, `validate-extraction.test.mjs:106`) while
  the hook emits the new one: `npm test` stays green, the acceptance criterion "A PASS verdict still
  produces an entry, with an outcome-derived title prefix" is verified by nothing, and Postcondition 2
  ("No shipped code contains a second copy of the derivation rules") is false on landing. This repo
  already treats these harnesses as derivation copies — `failure-signature-key.spec.md`'s Task Map row
  "Update test harnesses" names `tests/skills/validate-success-heuristic-harness.mjs:145` for exactly
  this reason.
- **Recommendation:** Correct the copy count in Behavior 3 and the Task Map, and name the harness in
  the surviving-copy set so the ownership question — converge it on the hook's derivation, or retire
  it as `tests/cli/heuristics.test.mjs` is being retired — is decided in this spec rather than left to
  the implementer.

### SA-2 — blocker
- **blocker_id:** `structural-architect:contradictory-degradation:b6dae273`
- **section_anchor:** `system-constitution-reference`
- **Location:** System Constitution Reference bullet 2; interacts with Behaviors 5, 5a, 6
- **Finding:** The compliance argument states that if the verb is unavailable, recover's step
  "degrades to writing an entry without a signature rather than failing, so the skill still functions."
  That path is not reachable after this spec: Behavior 5 makes recover obtain **two** values from the
  verb, and Behavior 5a makes the `id`'s digest obtainable only via `--digest-only` once the prose rule
  is deleted from `skills/recover/SKILL.md` (an outcome the acceptance criterion "contains no
  derivation-rule text" locks in). `writeHeuristic` requires a valid `id`, so with no verb there is no
  entry to degrade to — the companion CLI becomes *required*, the inverse of the principle cited. The
  Error Cases table is hook-scoped and specifies no recover-side failure mode.
- **Recommendation:** Either state the recover-side error contract explicitly (what the step does when
  the verb is unavailable, given the `id` cannot be composed), or restate the constitution argument so
  it does not claim a degradation path the spec forecloses.

### SA-3 — warning
- **Location:** Task Map row "Retire the dead path's tests"; Acceptance Criteria bullet 14
- **Finding:** Both claim `tests/cli/heuristics.test.mjs` "is listed in the **source manifest**" of
  `cli-driver-surface/inline-node-extraction-sweep.spec.md`. That spec has no `source-manifest`
  frontmatter field and no Source Manifest section; in this repo source manifests live in `.validate.md`
  artifacts, and that spec has none. The real cross-spec collision is its **Acceptance Criteria line 89**,
  which asserts `adev heuristics extract` *works* — a criterion this spec supersedes. The path is also
  mis-prefixed: the file is under `specs/features/cli-driver-surface/`, not `specs/cross-cutting/`. The
  substantive requirement is sound; only its target is misnamed. (Same underlying issue as CON-1, which
  the Consistency Analyzer scored as a blocker.)
- **Recommendation:** Retarget both to the sweep spec's Acceptance Criteria line 89 and use the full
  `features/` path.

### SA-4 — warning
- **Location:** Error Cases row 4 (`adev heuristics signature` unavailable or errors) vs. Behavior 1
- **Finding:** Behavior 1 has the hook derive the signature "via the shared primitive", while the Error
  Cases row frames failure as the **CLI verb** being unavailable. These are different integration points
  with different failure surfaces. The hook is not a skill, so the constitution's name-a-CLI-verb
  anti-pattern does not bind it, and it already imports `deriveHeuristicId` directly from
  `lib/heuristics.mjs` — a lib import cannot be "unavailable" the way a subprocess can. Leaving this
  unresolved makes the hook's dependency direction ambiguous (domain lib vs. CLI surface).
- **Recommendation:** Name the hook's integration point once and align the Error Cases row to it.

### SA-5 — suggestion
- **Location:** Error Cases table
- **Finding:** Behavior 1a's "no non-PASS `checks[]` entry present → write nothing, exit 0" has an
  acceptance criterion but no Error Cases row, unlike every other early-return condition.
- **Recommendation:** Add the row so the table is the complete early-return contract.

### SA-6 — suggestion
- **Location:** Behaviors 5 and 6
- **Finding:** Removing the recover prose rule also discharges a deferred item the dependency explicitly
  assigned here — `lib/heuristics.mjs:131-136` records that the SKILL.md prose "states a different
  operation order and diverges on standalone punctuation tokens; correcting that prose belongs to
  `failure-capture.spec.md`".
- **Recommendation:** Note that divergence, and that byte-identity is preserved because the
  *implementation* is `normalizeRootCause = normalizeFailureText` rather than the prose, so Behavior 6's
  guarantee is self-evidencing rather than assertive.

**ADR check:** no conflict. ADR-0019 governs the check-**ID** registry and alias table;
`validate.check-12-heuristic-extraction` is already in `REMOVED_CHECK_IDS`
(`lib/governance/validate-config.mjs:68`), so deleting the orphan check *file* removes a document for an
already-retired ID and does not touch the registry. The hook-protocol reasoning against the
constitution's Architecture Boundaries is correct. No sibling-ordering dependency on
`signature-retrieval.spec.md` is asserted.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

### SEC-1 — blocker
- **blocker_id:** `security-reviewer:data-exposure:763ecb0b`
- **section_anchor:** `behaviors`
- **Category:** data-exposure
- **Location:** Behavior 1a (and the Input-scoping precondition it references)
- **Finding:** Behavior 1a treats all `checks[].detail` values as pre-redacted — "the same
  already-redacted values the quality-gate pipeline produced". The shipped redaction guarantee
  (`configurable-checks.spec.md` Behavior 25a, verified in force at that spec's line 136) covers **only**
  `kind: quality-gate` subprocess stdout/stderr. `kind: subagent-review` checks — Checks 2, 3, 4, 5, 6, 7,
  8, 9, 10 per that spec's Behavior 7, i.e. the majority of the check set — produce freeform LLM-authored
  findings that never pass through 25a. Worse, `skills/validate/SKILL.md:291,295,316` imposes an
  evidence-citation contract requiring every non-PASS verdict to cite `file:line` with quoted content —
  exactly the material that lands in a check's `detail`. A Check 2 or Check 4 FAIL quoting a hardcoded
  secret it found in source would flow through Behavior 1a's explicitly permitted fields into the
  git-tracked heuristic store, and from there via `/adev:sync` into `CLAUDE.md`, `AGENTS.md`,
  `.cursorrules`, and `copilot-instructions`. This is the same exposure class as the closed
  `ffaf2f81`, reached through a different and equally live channel. Separately, no live code constructs
  `verdict_metadata.checks[]` with `id`/`name`/`detail` today (only the hook's doc comment, tests, and a
  historical plan reference the shape), so the "already-redacted" premise cannot be checked against a
  real producer — it is asserted, not derived.
- **Recommendation:** Narrow Behavior 1a's scope claim to match the actual guarantee: capture
  `checks[].detail` only for check kinds where a redaction or bounding guarantee genuinely applies, or
  drop `detail` entirely and derive the failure heuristic from `id`/`name`/`outcome`, which carry no free
  text. If `detail` must be captured for `subagent-review` failures, require the check-registry contract
  to bound and sanitize `detail` before it reaches `verdict_metadata` (strip quoted code blocks, cap
  length, or reference `file:line` without inline content). Add an acceptance criterion covering a
  `subagent-review`-kind FAIL whose `detail` quotes source content — the current criterion exercises only
  the already-closed subprocess-style vector.

**Not flagged:** authentication, authorization, and rate-limiting are N/A for a local developer-tool
plugin with no network surface. Input validation is adequate (`title` capped at 120; path containment via
`toRepoRelative` before any derivation). No new secret-bearing configuration is introduced. The charter
`EvidenceRef.source` enum drift is pre-existing and out of scope per the review calibration.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

### CON-1 — blocker
- **blocker_id:** `consistency-analyzer:contract:72de9bcd`
- **section_anchor:** `actionable-task-map`
- **Category:** contract
- **This Spec:** The Task Map row "Retire the dead path's tests" and Acceptance Criteria bullet 14 assert
  that `tests/cli/heuristics.test.mjs` "is listed in the source manifest of another spec,
  `cli-driver-surface/inline-node-extraction-sweep.spec.md`", and require that "source manifest reflects
  the change".
- **Conflicts With:** `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md`
  has no `source-manifest:` frontmatter field (frontmatter is only
  `charter/kind/status/risk_level/milestone/revision/charter-revision/created/updated`) and no Source
  Manifest section in the body. The file is referenced only in that spec's Task Map (line 77) and
  Acceptance Criteria (line 89).
- **Recommendation:** Retarget the Task Map row and the acceptance criterion to the real mechanism — the
  reference in that spec's Acceptance Criteria line 89, which asserts `adev heuristics extract` works —
  or add a `source-manifest` field to the sweep spec first. As written the criterion is unsatisfiable:
  there is no manifest field to reflect a change.

### CON-2 — warning
- **Category:** contract
- **This Spec:** Behavior 5a and the Task Map say `--digest-only` "is rejected together with
  `--blocker-id`" but name no error code, and this spec's own Error Cases table has no row for the new
  rejection.
- **Conflicts With:** `failure-signature-key.spec.md` Error Cases (lines 279-286) enumerates a typed code
  for every rejection path on this verb (`INVALID_SIGNATURE_ORIGIN`, `EMPTY_SIGNATURE_TEXT`,
  `CONFLICTING_SIGNATURE_INPUT`, `INVALID_BLOCKER_ID`), and the shipped `signatureError()` helper
  (`lib/cli/heuristics.mjs:561`) requires a code on every exit-1 path.
- **Recommendation:** Name the code in Behavior 5a — `CONFLICTING_SIGNATURE_INPUT` for symmetry with
  Behavior 3b — and add the row to this spec's Error Cases table, since the owning spec is already
  shipped and is not being revised here.

### CON-3 — suggestion
- **Category:** contract
- **This Spec:** Behavior 5a does not state which `--origin` values `--digest-only` is valid with.
- **Recommendation:** State that `--digest-only` applies only in derived mode (the caller in Behavior 5a
  is `--origin recover`), or define its behavior under `--origin review-specs`.

### Internal cross-section sweep

Task Map ↔ Behaviors ↔ Acceptance Criteria trace cleanly: all nine Task Map rows map to Behaviors
1/1a/3/4/5/5a/6/7, and all Acceptance Criteria trace to a numbered Behavior or the Error Cases table. No
superseded wording was found — Behavior 3's note about the duplicate PASS prefix and Behavior 7's removal
are explicitly ordered rather than contradictory (the revision-1 SA-5 concern is resolved).
`id`/`signature` terminology is used consistently with `failure-signature-key.spec.md` throughout. The
one exception is the copy-count claim itself, which SA-1 shows is wrong on the facts rather than
internally inconsistent.

## Known Defects (reported, not blocking)

Per the review calibration these are pre-existing and were deliberately not scored as blockers:

- The charter's Consumed/Exposed API rows and the `FailureSignature.digest` attribute lag the shipped
  verb's shape.
- The charter's `EvidenceRef.source` enum (`recovery`, `validation`, `debug`, `retro`, `manual`) does not
  match the live store's four spellings (`validation` 24, `learn` 4, `validate` 2, `recover` 2). Related:
  the FAIL-path Behaviors do not specify `evidence[].source` for hook-written entries.
- `failure-signature-key.spec.md` lags its implementation in five documented places; a
  documentation-only revision 9 is planned.

---

## Summary

**Total findings:** 10 (4 blockers, 3 warnings, 3 suggestions)

**Blockers:**

| blocker_id | Reviewer | Section |
|---|---|---|
| `structural-architect:false-codebase-claim:c4d27eaa` | Structural Architect | `behaviors-3` |
| `structural-architect:contradictory-degradation:b6dae273` | Structural Architect | `system-constitution-reference` |
| `security-reviewer:data-exposure:763ecb0b` | Security Reviewer | `behaviors` |
| `consistency-analyzer:contract:72de9bcd` | Consistency Analyzer | `actionable-task-map` |

**Action required:** Revision 2 is a substantial improvement — all seven revision-1 blockers are closed,
every line citation holds against live source, and the Behaviors/Task Map/Acceptance Criteria now trace
1:1 with no superseded wording. The four new blockers are narrower than the previous round and each has a
concrete, local fix: correct the prefix copy count and decide the harness's fate (SA-1); reconcile the
recover degradation claim with the two-values-from-the-verb design (SA-2); narrow Behavior 1a's redaction
premise to the check kinds where it actually holds (SEC-1); and retarget the sweep-spec reference from a
nonexistent source manifest to its Acceptance Criteria (CON-1).

Run `/adev:specify --revise` against
`.context-index/specs/features/heuristics/failure-capture.blockers.md` to produce revision 3, then
re-review.

> Governance note: `.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan`
> approver role is configured. `risk_level: high` sets `require_hitl_approval: true` in
> `risk-policies.yaml`, which applies at the plan transition, not here.
