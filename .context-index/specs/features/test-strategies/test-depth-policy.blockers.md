# Blockers: test-depth-policy

> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Spec revision:** 6
> **Review date:** 2026-08-11
> **Verdict:** BLOCK
> **Blocker count:** 7 (down from 10)

**All seven are on one change: the `**Files:**` parse fix bundled into the descope.** The
descope itself is confirmed clean by all three reviewers — no dangling references, no
mechanical damage, and every blocker arising from the removed enforcement machinery resolved.
Four blockers cluster on Behavior 8's no-block fallback and three on the `floor_inputs` field.

---

## structural-architect:missing-interface:9daf8d94

- **section_anchor:** `behaviors-8` · **finding-type:** missing-interface

Behavior 8's rules govern *sub-bullets* and never say whether the `**Files:**` label line is
scanned. Shipped plans put paths on the label line — `- **Files:** \`skills/init/SKILL.md\`` —
and some carry no path at all (`- **Files:** (no source changes)`) or bare filenames with no
directory. Each yields zero paths from a *present* block, which Behavior 8 routes to
`MISSING_FLOOR_INPUT`: the identical hard-fail the absent-block fallback was added to remove.

**Resolution:** State whether the label line is scanned, and route "block present, zero paths
after normalisation" to the same degraded mode rather than a hard fail.

---

## structural-architect:contract-mismatch:fd5a643c

- **section_anchor:** `behaviors-13` · **finding-type:** contract-mismatch
- **duplicate lenses:** `security-reviewer:authorization:4eaa3562`, `consistency-analyzer:contract:3eb95c7d`

`floor_inputs: "unavailable"` is mandated by Behavior 8 and one AC but appears in no payload:
not Behavior 13's closed list, not the `test_depth_assigned` Interface Contract row
(`REQUIRED_FIELDS_BY_EVENT`), not ADR-0016 §4. Every peer flag (`escalated`,
`escalation_skipped`, `floor_applied`) is enumerated; this one is not. `resolveTestDepth`'s
pinned signature also has no parameter by which a pure function could learn its inputs were
unavailable. Under advisory framing the record *is* the product, so the degraded mode is
unrecordable and its audit trail is silently lost.

**Resolution:** Add `floor_inputs?` to Behavior 13, the Interface Contract row, and ADR-0016
§4, plus the corresponding input to `resolveTestDepth`. Repurpose the stale Task Map ADR row —
which asks for realignment work already landed — to carry this edit.

---

## structural-architect:ambiguous-behavior:38eb3c3f

- **section_anchor:** `behaviors-8` · **finding-type:** ambiguous-behavior
- **duplicate lens:** `consistency-analyzer:contract:46c9226c`

The fallback is an exemption and four passages deny one exists: Behavior 8's own opening
("There is no qualifier and **no exemption**"); the Preconditions ("The plan task under
resolution declares at least one target file path"); the AC asserting no "declares target
files" qualifier exists anywhere in the spec; and the AC requiring "fail-closed on an empty
**or absent** block" — the exact opposite of the AC requiring an absent block to resolve. Two
ACs specify opposite behaviour for identical input.

Underlying coherence issue: revision 6 runs two opposite policies for one missing-input class —
absent block degrades, empty block blocks the task and routes to `/adev:recover`. Under advisory
framing, aborting a task to protect an advisory record is disproportionate, and
`MISSING_FLOOR_INPUT` as a hard fail is the one passage still reading as enforcement.

**Resolution:** Delete "no qualifier and no exemption", qualify the Preconditions and the
`resolveTestDepth` row, rewrite the contradicting ACs, and pick one policy for missing inputs.

---

## security-reviewer:authorization:86a11e2d

- **section_anchor:** `behaviors-8` · **finding-type:** authorization

The two rules are keyed at different granularities: fail-closed is **per task** ("block present
but yields zero paths"), the exemption is **per plan** ("a task in a plan with no `**Files:**`
block at all"). But `skills/plan/SKILL.md:608` puts the block **per task**, and shipped plans
are partially covered — **131 of 149 plans contain tasks with no block of their own** (e.g.
`lifecycle-gate.plan.md`: 18 tasks, 9 blocks). Neither rule covers those tasks.

Under the permissive reading — the one that keeps in-flight plans working — the sensitive-path
leg is evaded by *deleting* a task's `**Files:**` block, strictly easier than the emptying that
fails closed. The exemption is also unbounded: nothing pins it to legacy plans, so it governs
every plan authored from here on.

**Resolution:** State the rule per task, not per plan. Bound the exemption (a snapshot of legacy
plan paths, or an authored-before date) and make a missing block in a newly authored plan raise
`MISSING_FLOOR_INPUT`. Add an AC that `/adev:plan` must emit a `**Files:**` block per task.

---

## security-reviewer:authorization:4eaa3562

- **section_anchor:** `behaviors-13` · **finding-type:** authorization
- **same defect as** `structural-architect:contract-mismatch:fd5a643c`

Because `floor_inputs` has no persistence site, `explain` cannot distinguish *floor evaluated,
conditions did not hold* from *floor path leg never evaluated*. An operator auditing a change to
`lib/governance/**` sees identical output for a checked-clean task and an unchecked one, and
`floor_applied: true` reads as a coverage guarantee.

**Resolution:** As for fd5a643c, plus require `explain` to render three distinct floor states
(held / not-held / not-evaluated) and to label the floor advisory.

---

## consistency-analyzer:contract:46c9226c

- **section_anchor:** `behaviors-8` · **finding-type:** contract
- **same defect as** `structural-architect:ambiguous-behavior:38eb3c3f`

Two ACs give opposite verdicts for a plan with no `**Files:**` block; a third asserts empty or
absent `targetPaths` raises `MISSING_FLOOR_INPUT` "unconditionally"; the `resolveTestDepth`
Interface Contract row repeats the unconditional form. The degradation path is the intended
behaviour, so the ACs and the row are what change.

---

## consistency-analyzer:contract:3eb95c7d

- **section_anchor:** `interface-contract` · **finding-type:** contract
- **same defect as** `structural-architect:contract-mismatch:fd5a643c`

Fresh instance of the CON-25 class that round 5 marked resolved: revision 6 introduced a payload
field on the spec side without editing ADR-0016, which was last touched in the previous commit.
