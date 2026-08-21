---
spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
charter: .context-index/specs/features/output-personas/charter.md
date: 2026-08-20
verdict: PASS_WITH_NOTES
rigor-tier: full
last-reviewed-revision: 16
file-sha: c00bd6fa3ee33e980886e221d66b44df5bf2b9a959a9202abe262d2a184bae6b
---

# Architecture Review: skill-output-rules-wiring

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
> **Charter:** .context-index/specs/features/output-personas/charter.md
> **Revision reviewed:** 16
> **Rigor tier:** full (risk_level `medium` -> `review_mode: full`; no `--tier` override, no routing signal)
> **Verdict:** PASS_WITH_NOTES

## Registry Warnings

| Code | Message |
|---|---|
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'. |
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'. |
| BROADEN_NETWORK | Profile 'browser-review': network broadened 'deny' -> 'read-only'. |

None of the three apply to a reviewer dispatched for this spec (`browser-review` is not
referenced by any enabled reviewer); they are surfaced per the registry contract.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

No reviewer is disabled in `.context-index/governance/review.yaml`.

Module heuristics for `output-personas` were retrieved (`adev heuristics retrieve --module
output-personas --tier summary`) and injected into all three context packs: three entries,
all concerning token measurement and output-echo cost.

## Context-pack limitation (recorded)

Both the Structural Architect and the Security Reviewer independently reported that the
sibling spec `verbosity-axis-and-output-trimming.spec.md` was truncated in their packs at
the per-file cap (16,384 of 26,013 bytes, cutting mid-Actionable-Task-Map). Both stated
they read the live file where it was load-bearing rather than inferring from the truncated
copy. The Structural Architect additionally reported that nothing else in its pack was
truncated, and the Security Reviewer verified the packed target spec byte-identical to the
live file. No finding in this report rests on truncated context.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** — `warning` — *Preconditions, third bullet.* The claim "no sibling spec's
  `source-manifest.files[]` is disturbed" is false: the four edited `SKILL.md` files appear
  in the `source-manifest.files[]` of 14 other specs (including
  `cross-cutting/universal-skill-extensions.spec.md`,
  `features/multi-repo-workspace/workspace-status.spec.md`,
  `features/work/work-triage-and-routing.spec.md`, `cross-cutting/single-front-door.spec.md`),
  whose `sha` fingerprints go stale. The precondition reasons only about `templates/*`.
  Practical impact is nil — all 14 already carry `drift_detected: true` — and the conclusion
  ("no restamping required") still holds because ADR-0011 is Rejected.
  **Recommendation:** correct the justification, not the conclusion; the widening spec (15
  more skills) inherits this premise and needs it true for the right reason.

- **SA-2** — `warning` — *The governed sections / BEH-1 "Composed views".* The composed-view
  enumeration reads as exhaustive but is not. `skills/sample/SKILL.md:184` `## --from Mode`
  composes two governed sections ("Run Step 3 (Scoring)... Present the score breakdown",
  "Run Step 5 (Register)") and is not in the governed set, so BEH-1's clause "an inner
  section's terse form applies only when that section renders on its own" silently exempts
  `--from` from the increment. **Recommendation:** either govern `## --from Mode` or state
  the exemption deliberately in the governed-sections table.

- **SA-3** — `warning` — *Error Cases (`MISSING_TERSE_FORM`, `MARKER_OUT_OF_SCOPE`) and
  Task 1.* Section *extent* is never defined, yet both error codes depend on it ("beneath",
  "elsewhere"). The governed set mixes H2/H3/H4 with real nesting: `status`
  `### Mode: --all` (L162) contains six `####` children that are **not** governed, while
  `sample` `#### Present Results` (L123) is itself governed and nested under
  `### Step 3: Scoring` (L83). The spec anticipates fence-awareness and the duplicate-heading
  wrinkle but not this one. **Recommendation:** state the boundary rule normatively — a
  section extends to the next heading of the same or higher level, fence-aware.

- **SA-4** — `warning` — *BEH-3 vs BEH-7.* `skills/status/SKILL.md:12` instructs the Product
  persona to "omit file paths and technical detail"; `lib/persona.mjs:12` makes `product`
  default to `terse`; BEH-3 requires substituting further tables with "a count plus its
  repo-relative path". On the exact default combination ADR 0020 calls out, the file will
  carry two contradicting rules. BEH-7 replaces footnotes but the spec never says the
  replacement resolves this. **Recommendation:** state in BEH-7 that the canonical footnote
  supersedes per-persona clauses conflicting with BEH-2/BEH-3.

- **SA-5** — `warning` — *Postconditions vs Task 2.* Task 2 defines "the canonical footnote
  and marker", but the postcondition fixes the modified set to four `SKILL.md` files, their
  mirrors, one test and one charter row — so the convention can only exist duplicated four
  times with no single source of record, and the widening spec inherits a convention with no
  owner. **Recommendation:** name where the convention is normatively defined (this spec, or
  the charter row from task 8) even though no shared file is created.

- **SA-6** — `suggestion` — *Error Cases closing sentence.* "All three correspond to
  executing assertions" covers markers and mirrors only. BEH-7 ("names the three overlays by
  literal filename", "MUST NOT instruct interpolating a resolved value into a path") and
  BEH-8 carry acceptance criteria with no error case and no named verifier, despite both
  being script-checkable on the four files. Suggest folding them into task 1's test.

- **SA-7** — `suggestion` — *BEH-1, `sample` `## --refresh Mode`.* `--refresh` (L217) reuses
  `--score`'s *logic* ("Run `--score` logic first") but renders its own distinct table
  (L230-239); it does not render `--score`'s report block. Pairing it with `route`
  `## Dry-Run Mode` (L262, which literally displays "the summary table from Step 5")
  overstates the analogy and makes the composed-view statement near-vacuous there.

**Reviewer's own summary:** "Contracts are unusually well-bounded for a 16th revision: the
increment framing is honest, the layer-precedence reasoning is correct and correctly
applied, ADR 0020 and ADR-0011 are respected, and every factual claim I could check against
the repository held except SA-1. The seven findings are refinements, not structural
defects." The reviewer verified all 19 governed headings exist as real headings outside
fences, that `status` has exactly 10 `### Mode: ` headings with the duplicate text at
L126/L378, and that `using-adev/SKILL.md:137` and `:141`, `lib/persona.mjs:12` and `:183`,
`templates/verbosity/terse.md:8`, `persona-resolution-and-injection.spec.md:68`,
`completion-tokens.spec.md` B6-B8, ADR-0011's **Rejected** status,
`lib/session-summary.mjs:23-37`, `scripts/sync-provider-skills.mjs` and
`tests/sync/provider-skill-parity.test.mjs` all check out.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- **SEC-1** — `suggestion` — *BEH-3 / Preserved invariants.* BEH-3 lets `route`'s "Human-only
  tasks requiring attention" table collapse to a count plus a sidecar path under terse
  verbosity. The actual gate is enforced by `/adev:implement` reading
  `<plan-stem>.routing.json`, not by what is echoed to chat, so this is not an authorization
  bypass today. **Recommendation:** add a preserved-invariant line (alongside BEH-4/5/6)
  stating that human-only routing enforcement is sidecar-driven and independent of chat
  verbosity, so a future edit cannot accidentally couple the review gate to chat-rendered
  detail.

The reviewer verified live that `learn/SKILL.md`'s existing redaction check (Step 3,
L88-91) runs *before* the governed Step 4 display, so a terse rendering cannot bypass it,
and that no governed section references secrets or credentials. It explicitly declined to
re-raise the product-persona/`terse.md:8` security-finding visibility gap as a new finding,
on the grounds that the spec's own Out of Scope already flags it, routes it to
`issue-uvarlt`, and states the correct authoring layer. It records BEH-2 (repo-relative
paths only) and BEH-7 (no interpolation of a resolved value into a path) as defence-in-depth
controls in their own right.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES (post-adjudication; see CON-2)

- **CON-1** — `warning` — *BEH-7, naming.* BEH-7 writes the three overlays as
  "`templates/verbosity/terse.md`, `normal.md`, `deep.md`" — the directory prefix appears on
  the first filename only. Since BEH-7's whole point is that footnotes name the overlays by
  *literal filename*, the behavior that governs naming should itself be uniform.
  **Recommendation:** write all three with the full path.

- **CON-2** — `warning` *[orchestrator-adjudicated: blocker -> warning; rationale below]* —
  *Acceptance Criteria / charter coupling.* AC-11 mandates an edit to the parent charter
  (whose capability row still reads "Connect the verbosity axis to the 17 `SKILL.md`
  mandated-output sections", status `specified`). The reviewer asked for (i) task 8 to be
  executed before validation completes, (ii) the charter's capability status to be synced,
  and (iii) a `depends-on` entry naming the parent charter.

  **Adjudication.** Demoted to `warning`, recorded rather than silently dropped. The
  reviewer's factual premise is correct — the charter row does still say "17" — but the spec
  already resolves it three times over: task 8 exists solely to rewrite that row, AC-11
  asserts it, and the Postconditions name "the parent charter's capability row updated by
  task 8" inside the exhaustive modified-file set. Sub-point (i) is therefore already
  satisfied by the spec as written. Sub-point (ii) is lifecycle machinery owned by
  `/adev:review-specs` Step 7 and `/adev:validate`, not by a behavioral spec. Sub-point (iii)
  asks for a convention — `depends-on` naming a spec's *own* parent charter — that no spec in
  this repository follows; `depends-on` is for cross-spec and cross-repo references. Nothing
  in CON-2 changes what an implementer builds, and the same substance is rated a `warning` by
  this reviewer's own CON-3, which is direct evidence the blocker severity was miscalibrated.
  Reviewer prompts instruct against flagging concerns the spec explicitly handles.

- **CON-3** — `warning` — *Charter scope wording.* The charter's capability row conflates
  scope ("17 `SKILL.md` mandated-output sections") with what this increment delivers (4
  skills, 19 sections). **Recommendation:** the task-8 rewrite should distinguish the
  delivered increment from the deferred widening explicitly. This overlaps CON-2 and is
  already assigned to task 8.

The reviewer found the spec internally consistent with its sibling specs
(`persona-resolution-and-injection`, `verbosity-axis-and-output-trimming`,
`completion-tokens`) and with constitution principles.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict, computed
> from post-cap findings across all reviewers (`verdict_rules.blocker_threshold: 1`).

## Orchestrator checks for revision 16

These were verified directly against the spec file, independently of the reviewers.

**Stale-prose sweep after the BEH-14 withdrawal — CLEAN.** `BEH-14` occurs at exactly three
lines: L65 (the `retired-behavior-ids` tombstone), L86 (Layer precedence, named as
withdrawn), and L145 (Out of Scope, named as withdrawn). No live reference survives. Five
behaviors are defined as live — BEH-1, BEH-2, BEH-3, BEH-7, BEH-8 at L68-72 — so L86's "All
five behaviors here bind at the SKILL.md layer" matches the actual count. The three
preserved invariants (BEH-4, BEH-5, BEH-6) are correctly kept out of that count. No
acceptance criterion references a withdrawn behavior: the thirteen criteria cite only BEH-1,
BEH-2, BEH-3, BEH-7 and BEH-8. No task references a withdrawn behavior: task 2 cites BEH-7
and task 3 cites BEH-3, both live.

**Ledger completeness — satisfied.** The `retired-behavior-ids` comment now records all six
withdrawals (BEH-9, BEH-10, BEH-11, BEH-12, BEH-13, BEH-14) with the revision and reason for
each, and states none are reassigned. This closes the gap flagged in revisions 14 and 15.

**Criterion-to-task mapping, both directions — complete.** Every acceptance criterion maps
to at least one task: AC-1 to task 1; AC-2/AC-3 to tasks 3-6 verified by task 1; AC-4/AC-5/
AC-6/AC-8 to tasks 3-6; AC-7 to task 2 plus tasks 3-6; AC-9 to the postcondition binding all
tasks; AC-10 to task 7; AC-11 to task 8; AC-12/AC-13 global. Every task maps to at least one
criterion, task 2 via AC-7. No criterion was stranded by the BEH-14 removal, because BEH-14
never had one.

**Task 1's derived-set contract.** Task 1 now specifies derivation only: scan fence-aware for
the nine named headings plus every `^### Mode: ` heading in `status`, assert each carries a
`**Terse form:**` marker, assert no marker appears elsewhere, key on line position because
`status` repeats a heading text at L126/L378, and MUST NOT hardcode a count. Two
implementers would derive the same *expected set*. What they could still differ on is
section *extent* — how far "beneath" reaches and what counts as "elsewhere" — which is SA-3,
recorded as a warning. The conventional resolution (a section runs to the next heading of
the same or higher level) is what a competent implementer will pick, and getting it wrong
produces a failing test rather than a silently wrong wiring, so it does not block.

**Decision-gate risk after the BEH-14 withdrawal — acceptable at increment level.** The
three decision-gate sections (`sample` `#### Present Results`, `learn` `## Step 4: Present
for Confirmation`, `sample` `## --refresh Mode`) stay in scope and will receive terse forms,
and with BEH-14 gone no rule in this spec constrains what those terse forms may omit. The
residual risk is real but bounded: the Out of Scope entry names the hazard, names all three
sections, and routes the durable fix to `issue-uvarlt` at the overlay layer, so an
implementer authoring those three terse forms reads the hazard before writing them. A
narrower in-layer rule *would* be authorable without repeating the BEH-12/BEH-14 defect —
"a terse form does not omit content the same section's next step requires the user to act
on" is of the form *this section offers X*, not *X renders even when the overlay would trim
it* — and is recommended for the widening spec. Its absence here is not blocking.

## Summary

**Total findings:** 11 (0 blockers, 8 warnings, 3 suggestions)

One finding was emitted at `blocker` severity (CON-2) and adjudicated down to `warning` with
the reasoning recorded in full above; no severity cap was applied (all three reviewers carry
`severity_cap: blocker`). No `.blockers.md` sidecar is written.

**Action required:** none blocking. Revision 16 fixes both revision-15 blockers and the
ledger gap without introducing a contradiction of its own. The eight warnings are
refinements a competent implementer handles in-flight or that belong to the widening spec;
SA-1 (correct the source-manifest justification), SA-3 (state section extent normatively)
and SA-4 (say that the canonical footnote supersedes conflicting per-persona clauses) are
the three worth folding in before or during planning. The spec is ready for `/adev:plan`.

> **Transition gate note:** `.context-index/governance/gates.yaml` defines no
> `approver_role` for the `spec-to-plan` transition, so no human approval is recorded as
> required. `risk_level: medium` sets `require_hitl_approval: false`.
