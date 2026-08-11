# Architecture Review: test-depth-policy (revision 6)

> **Date:** 2026-08-11
> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Rigor tier:** full (explicit `--tier full`; risk_level `medium` → `review_mode: full`)
> **Verdict:** BLOCK
> **last-reviewed-revision:** 6
> **file-sha:** d256c5be2cb38bce629dce22d0b1af3376adf99e2d7a9dd51729fcb1badf8c52

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## The Descope Is Clean

All three reviewers independently confirm the descope succeeded on its own terms:

- **No dangling references.** `DEPTH_CONFORMANCE_FAILED` and `FLOOR_EVASION_DETECTED` appear
  nowhere in `.context-index/`. No behavior, error row, Interface Contract row, Task Map row,
  postcondition, or AC still asserts conformance, evasion, raise-on-extend, or a Handoff Block
  extension. Surviving mentions are explicit out-of-scope statements.
- **Structural integrity clean.** The Consistency Analyzer read the whole file and checked
  behavior numbering (1–19 contiguous), fence balance, heading order, table cell counts, and
  duplicate lines. The scripted regex edits did not corrupt the document.
- **The advisory framing is honest.** The Security Reviewer judged it "not theatre" — the depth
  value reaching the write-test prompt works, and the event record is a real intent signal —
  conditional on fixing the audit-trail defect below.
- **All nine round-5 blockers arising from the removed machinery are resolved**
  (SA-29, SA-30, SEC-13, SEC-14, SEC-15, SEC-18, CON-33, CON-34, CON-35).

## Every Remaining Blocker Is From One Bundled Fix

The seven blockers all attach to the `**Files:**` parse fix that revision 6 bundled with the
descope, not to the descope. Four cluster on Behavior 8's no-block fallback, three on the
`floor_inputs` field.

**The root cause is a measurement error.** Revision 6 justified its fallback with "17 of 150
shipped plans have no `**Files:**` block". That measured *plans with no block at all*, but
`skills/plan/SKILL.md:608` places the block **per task**. Measured per task, **131 of 149 plans
contain tasks with no block of their own** (`lifecycle-gate.plan.md`: 18 tasks, 9 blocks;
`incremental-artifact-writes.plan.md`: 28 tasks, 17 blocks). A per-plan exemption built on a
per-plan count cannot address a per-task format — and as the Security Reviewer notes, under the
permissive reading it becomes a bypass: deleting a task's block evades the sensitive-path leg,
strictly easier than the emptying that fails closed.

---

## Structural Architect — BLOCK

### SA-37 · blocker · the inline `**Files:**` form is unparsed
`blocker_id: structural-architect:missing-interface:9daf8d94` · `section_anchor: behaviors-8`

Behavior 8's rules govern sub-bullets and never say whether the label line is scanned. Shipped
plans use `- **Files:** \`skills/init/SKILL.md\``, `- **Files:** (no source changes)`, and bare
filenames with no directory. Each yields zero paths from a *present* block — routed to
`MISSING_FLOOR_INPUT`, the identical hard-fail the fallback exists to remove.
**Verified by aggregator:** the inline form is in shipped plans; the aggregator counted 11 plans
against the reviewer's 24, so the magnitude differs but the defect holds.

### SA-38 · blocker · `floor_inputs` has no home in the event contract
`blocker_id: structural-architect:contract-mismatch:fd5a643c` · `section_anchor: behaviors-13`

Mandated by Behavior 8 and one AC; absent from Behavior 13's closed payload, the
`test_depth_assigned` Interface Contract row, and ADR-0016 §4. `resolveTestDepth`'s pinned
signature has no parameter by which a pure function could learn its inputs were unavailable.
**Verified by aggregator:** `floor_inputs` appears twice in the spec, zero times in the ADR.

### SA-39 · blocker · the fallback contradicts four other statements, two of them ACs
`blocker_id: structural-architect:ambiguous-behavior:38eb3c3f` · `section_anchor: behaviors-8`

Behavior 8's own "no qualifier and no exemption" opening, the Preconditions, and two mutually
exclusive ACs. Underlying issue: two opposite policies for one missing-input class, and
`MISSING_FLOOR_INPUT` as a hard fail is the last passage reading as enforcement.

### SA-40 · warning · the floor Postcondition carves out only Behavior 17, not the no-block mode
### SA-41 · warning · the sibling `**Tests:**` field is still unaddressed — under the inline form the test path exists only there
### SA-42 · warning · `assert-assigned` is close to hollow but earns its place — it still guards orchestration bugs, `--parallel` group prompts, and `/adev:recover` re-dispatch
### SA-34 · warning · **still open** — Behavior 18's `/adev:status` change has no Task Map row
### SA-35 · warning · **still open** — "most recent" has no ordering key
### SA-43 · suggestion · the "17 of 150" figure does not reproduce; cite the invariant, not the count
### SA-44 · suggestion · the revision-5 header paragraph still asserts enforcement, contradicting the revision-6 paragraph above it

---

## Security Reviewer — BLOCK

### SEC-23 · blocker · the exemption is a floor bypass, keyed at the wrong granularity
`blocker_id: security-reviewer:authorization:86a11e2d` · `section_anchor: behaviors-8`

Fail-closed is per task, the exemption is per plan, and the format is per task. Under the
permissive reading the sensitive-path leg is evaded by deleting a task's block. The exemption is
unbounded — nothing pins it to legacy plans, so it governs everything authored from here on.
**Recommendation:** state the rule per task; bound the exemption to a legacy snapshot or
authored-before date; require `/adev:plan` to emit a block per task.

### SEC-24 · blocker · the degraded marker has no persistence site
`blocker_id: security-reviewer:authorization:4eaa3562` · `section_anchor: behaviors-13`

Under advisory framing the record *is* the control, and it cannot distinguish *floor evaluated,
conditions did not hold* from *floor path leg never evaluated*. `floor_applied: true` reads to
an operator as a coverage guarantee.
**Recommendation:** persist `floor_inputs`; require `explain` to render three floor states and
to label the floor advisory.

### SEC-25 · warning · surviving guarantee-shaped passages
The floor Postcondition is false for the degraded mode; the assignment-event Postcondition is
stated as an invariant when nothing forces the `assert-assigned` call; **the Documentation
Requirements never require the docs to say the floor is advisory** — `docs/governance.md` is
where an operator forms their belief; and the `MISSING_FLOOR_INPUT` "fails closed" label now
describes a halt on an input to an advisory computation.

### SEC-26 · warning · Known Limitation 1 presents the modal case as an edge case
"May extend a suite authored at `minimal`" — under the shipped `per-behavior` default, extension
is the *normal* path, so the floor's coverage effect on extending tasks is frequently nil.

### SEC-27 · warning · the "is this token a path" predicate is unpinned, and its failure direction is open
### SEC-28 · warning · ADR-0016 is not part of the descope — it still says "the fail-closed floor" and claims "audit trail by construction", so the durable design record reads as enforcement
### SEC-29 · suggestion · the config's self-protection is now vacuous — "floored" means a larger number in a prompt

**Residual round-5 findings:** SEC-16 survives unchanged (the no-echo rule still contradicts the
requirement that `show` print the path set). SEC-17 survives as a warning (fails closed on a
malformed file, fails open on a deleted one). SEC-20 is moot. SEC-21 survives **and is now more
load-bearing**, since the presence check is the only remaining control.

---

## Consistency Analyzer — BLOCK

### CON-39 · blocker · two ACs give opposite verdicts for a plan with no `**Files:**` block
`blocker_id: consistency-analyzer:contract:46c9226c` · `section_anchor: behaviors-8`

One AC has the absent-block task resolve and stay implementable; another requires "fail-closed on
an empty **or absent** block"; a third asserts empty or absent `targetPaths` raises
`MISSING_FLOOR_INPUT` "unconditionally"; the `resolveTestDepth` row repeats the unconditional
form. The degradation path is the intended behaviour, so the ACs and the row change.

### CON-40 · blocker · `floor_inputs` is a payload field ADR-0016 §4 does not carry
`blocker_id: consistency-analyzer:contract:3eb95c7d` · `section_anchor: interface-contract`

A fresh instance of the CON-25 class round 5 marked resolved — the spec side was edited without
the ADR.

### CON-41 · warning · the Task Map's ADR row asks for work already landed; repurpose it for the `floor_inputs` edit
### CON-42 · warning · "in every path" is unqualified twice — the Postcondition and one AC carve out only standalone
### CON-36 · warning · **still open** — `CONFLICTING_ESCALATION_RULE`, `DEPTH_FLOOR_APPLIED`, `NO_RECORDED_ASSIGNMENT` named by no behavior; `INVALID_SENSITIVE_PATHS` has an AC but no behavior; Behavior 16 names no codes. **The descope created no new orphans.**
### CON-37 · warning · **still open, one added** — prose-asserting ACs; one is falsified twice by the spec's own text
### CON-26 · warning · **still open** — `affects:` lists `write-test` (not a module slug); omits `design` and `strategic-planning`
### CON-27 · warning · **still open** — the "103 prose-asserting test files" figure is still unreproducible (111 / 43 / 344 / 415)
### CON-45 · suggestion · Behavior 3 points at Scope Boundary for cross-task reconciliation; that content is in Known Limitations
### CON-46 · suggestion · the revision-5 header paragraph contradicts revision 6 in the present tense
### CON-47 · suggestion · the header's "filed as issue-559" has no resolvable pointer under `.context-index/` — the board lives in the main repo of this worktree
### CON-31 / CON-38 · suggestions · **still open**

**Behavior↔AC mapping:** 19 behaviors, 53 ACs; all behaviors carry at least one AC; no AC
references a removed behavior or error code.

**Spec↔ADR-0016:** the ADR describes nothing the spec no longer does — the descope opened no gap
in that direction. The one divergence runs the other way (CON-40).

---

## Summary

**Total findings:** 24 (7 blockers, 12 warnings, 5 suggestions). Blockers: 8 → 7 → 6 → 4 → 10 → **7**.

**The descope worked.** Every blocker created by the enforcement machinery is gone, the document
is mechanically intact, and the advisory framing was judged honest and worth having.

**The bundled fix did not.** All seven remaining blockers attach to the `**Files:**` parse and its
fallback, and they share one root cause: the fallback was designed against a per-plan measurement
of a per-task format. Three of the seven are the same `floor_inputs` defect seen through three
lenses; four are the same fallback defect through four lenses.

**For revision 7** the work is narrow and mechanical: state the parse rule per task, decide one
policy for missing floor inputs (degrade or fail — not both), scan the label line, persist
`floor_inputs` in the payload and ADR-0016 §4, and rewrite the contradicting ACs. Nothing here
requires a design decision of the kind rounds 4 and 5 turned on.

**Action required:** Revise to revision 7.

**Approver role (informational):** no `spec-to-plan` transition approver configured in
`governance/gates.yaml`.
