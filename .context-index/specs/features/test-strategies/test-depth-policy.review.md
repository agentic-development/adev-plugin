# Architecture Review: test-depth-policy (revision 4)

> **Date:** 2026-08-10
> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Rigor tier:** full (explicit `--tier full`; risk_level `medium` → `review_mode: full`)
> **Verdict:** BLOCK
> **last-reviewed-revision:** 4
> **file-sha:** bad691d61055e5fbb64b6b4eeb8973c9da5f5417c09209ff9daa984c890cefa8

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Round-3 Disposition

| Round-3 blocker | Status |
|---|---|
| SA-13 standalone write-test | **PARTIALLY RESOLVED** — hard-fail and missing-interface gone; contradiction relocated → SA-20 |
| SA-14 "exactly one event" | **RESOLVED** |
| SEC-1 unevaluatable qualifier / derivation source | **RESOLVED** — qualifier deleted everywhere; derivation named. Residual → SA-21, SEC-11 |
| SEC-2 narrowable set / upgrade break | **RESOLVED** — `DEFAULT_SENSITIVE_PATHS` + extend-only union; absent/empty legal |
| CON-18 unowned `test_depth:` field | **RESOLVED** |
| CON-19 `mode: cross-cutting` | **RESOLVED** |

Also resolved: SA-15 (`granularity` dropped from payload), SA-17 (`floor_applied` redefined),
SA-18/CON-20 (`charter-revision: 2`), SA-19 (vestigial `routingEasy`), SEC-5 (`escalation_skipped`
tri-state), CON-21 (`escalation` flag now gated and validated), CON-24 (ADR consequence).
**Behavior renumbering 17→19 verified clean** by the Consistency Analyzer — every cross-reference,
in the spec and the ADR, points correctly; all 19 behaviors carry at least one AC.

---

## Structural Architect — BLOCK

### SA-20 · blocker · Behavior 17 vs Behaviors 5/6 and Postconditions
`blocker_id: structural-architect:ambiguous-behavior:0c44c396` · `section_anchor: behaviors-17`

The carve-out is a defensible boundary but is not reconciled with three unqualified statements.
Chain stage 1 *is* the spec-declared `test_depth:`, so Behavior 5's "wins over every configured
default" does not hold standalone; Behavior 6 and the Postcondition say the floor applies "in
every path". A spec carrying `test_depth: thorough`, or matching a sensitive path, whose tests
are authored standalone silently gets `standard` — a two-regime system, absent from Known
Limitations though the docs table requires standalone behavior to be documented.

### SA-21 · blocker · Behavior 8 — `targetPaths` has no reader and no task
`blocker_id: structural-architect:missing-interface:a19d5e8a` · `section_anchor: behaviors-8`

`resolve` is specified to derive `targetPaths` from "the plan task's declared `files:` list",
but the shipped format (`skills/plan/SKILL.md:608`) is a prose `**Files:**` block with
`Create:` / `Modify: existing.ts:123-145` / `Test:` sub-bullets — there is no `files:` list,
nothing in `lib/` parses that block, and no Task Map row creates a reader. The fail-closed
floor's sole input has no defined source format and no owner. Line ranges on `Modify:` entries
must be stripped before glob matching, and `Test:` paths would otherwise enter `targetPaths`.
**Verified by aggregator** against `skills/plan/SKILL.md:608`.

### SA-22 · warning · ADR revision task scoped too narrowly
The Task Map's ADR row covers only work that already landed; revision 4 also invalidates
ADR §2 and §4. (Same defect the Consistency Analyzer raises as CON-25.)

### SA-23 · warning · Behavior 18's `/adev:status` change has no task
`skills/status/SKILL.md:60` still counts by "check if test files exist". The Task Map amends the
`plan-test-mapping` *spec*, not the *skill* — nothing implements the behavior.

### SA-24 · warning · `assert-assigned` has a staleness mode
The event keys on `plan` + `task_id` with no run or attempt discriminator, so after a re-route or
`/adev:recover` a prior run's event satisfies the check even if `resolve` was never called for
the current attempt. "Most recent" also has no defined ordering key (append order vs timestamp).
The verb split itself is sound — `resolve` writes, `assert-assigned` reads, ordering fixed by
Behavior 14, multi-append explicitly legal.

### SA-25 · warning · malformed `sensitive-paths.yaml` is unspecified
Behavior 7 covers absent and empty; Behavior 9's validation does not extend to `sensitive_paths`,
Preconditions exclude the file from the parse guarantee, and no error code exists. A
present-but-unparseable file has no defined fail-open/fail-closed outcome — for the one file the
floor depends on.

### SA-26 · suggestion · extend-only union has no repo precedent
Nearest shipped overlays are replace-on-present (`lib/partial-artifact.mjs:586`) or key-wise
override. The union is sound and the monotonicity rationale good, but flag it as a deliberate
divergence so an implementer does not normalise it. Note monotonicity is guaranteed by
`effectiveSensitivePaths()`, not by `resolveTestDepth`, which takes a caller-supplied array.

### SA-27 · suggestion · two independent `standard` constants
Behavior 17's built-in and chain stage 5's coincide by value with no stated relation.

### SA-28 · suggestion · "Hygiene drift pass" is a task with no behavior

---

## Security Reviewer — BLOCK

### SEC-6 · blocker · authorization
`blocker_id: security-reviewer:authorization:0acf5a4c` · `section_anchor: known-limitations`

Presence-not-conformance is the **sole binding** between the floor and any effect on a suite.
The spec records it as a limitation without noticing that the built-in default granularity
(`per-behavior`) makes the unchecked path the **common case**: under Behavior 3 a task whose
behavior is already covered gets an "extend" instruction against a suite authored at whatever
depth the *first* task resolved. A sensitive-path task floored to `thorough` therefore routinely
extends a `minimal` suite while every postcondition still holds.
**Recommendation:** require a floored task to raise the existing suite to the assigned depth,
and/or give `assert-assigned` a conformance leg via the existing hashed Handoff Block
(`write-handoff.sh`) recording `assigned_depth` and covered case classes.

### SEC-7 · warning · Capability overstates un-narrowability
Only the sensitive-path leg is monotone. `risk_level` is author-set frontmatter and
`boundaries.yaml` is project-mutable; editing `governance/**` is floored, but the floor demands
tests, not approval, so the narrowing still lands. Restate as "a sensitive-path floor that
cannot be narrowed".

### SEC-8 · warning · self-hosting gap in the default set
`.context-index/governance/**` is floored as the highest-leverage class, but in this repo the
policy implementation (`lib/test-strategies/policy.mjs`, `lib/governance/`,
`lib/lifecycle-events.mjs`) is higher-leverage and is not floored. adev develops itself with
adev. Do not add `lib/**` to the shipped default — require adev's own overlay to extend it.

### SEC-9 · warning · default globs under-match; matcher unpinned
No matcher, base, or prefixing rule is stated. `.env*` lacks the `**/` prefix its peers carry, so
`services/api/.env.production` would not match; `**/auth/**` is directory-shaped, so `src/auth.ts`
would not match. Pin the matcher and repo-relative POSIX paths, prefix every entry, add file-form
siblings, and add an AC covering both examples.

### SEC-10 · warning · `--task-id` anchor form is unspecified
No such form is defined or shipped: `lib/plan-routing-sidecar.mjs:111` accepts any non-empty
string, `lib/cli/report.mjs:504` documents `task-3`, the sidecar docstring uses `t1`. Contrast
Behavior 16, which pins `--module` inline.

### SEC-11 · warning · declared paths are mutable, not merely incomplete
Plan immutability is enforced only post-hoc (`lib/plan-immutability.mjs` reports at hygiene
time), and `resolve` performs no integrity check — so deleting one path from the task's file list
before `resolve` runs silently removes the floor. Fix at the same call site as SEC-6:
re-evaluate the floor legs against `git diff --name-only` at suite acceptance.

### SEC-12 · suggestion · state that `explain` echoes no paths

**Verified clean:** standalone write-test is **not** a deliberate bypass — dispatch is
discriminated by `ADEV_DISPATCHED_BY=implement`, implement resolves and asserts for every plan
task, and there is no implement→standalone route. Sole-writer is enforceable at the CLI layer:
`adev report` is type-closed, so no generic append verb exists and Behavior 12 forbids adding one.

---

## Consistency Analyzer — BLOCK

### CON-25 · blocker · ADR-0016 diverged from the spec in four places (regression)
`blocker_id: consistency-analyzer:contract:e16bf340` · `section_anchor: interface-contract`

Round 3 verified spec/ADR agreement; revision 4 edited the spec side only. (1) **Payload** —
`0016:66` still lists `granularity`; the spec drops it and adds `escalation_skipped?`. This list
becomes `REQUIRED_FIELDS_BY_EVENT`, so an implementer reading the ADR ships a schema that rejects
every event `resolve` emits. (2) **Accumulation** — `0016:72` says one per task; Behavior 13 says
more than one. (3) **Standalone** — `0016:48` says standalone resolves from the static chain;
Behavior 17 says it reads no policy at all. (4) **Writer** — `0016:46` says implement appends;
Behavior 12 makes `resolve` sole writer. The Task Map's ADR row covers work that already landed,
so the ADR ships stale.
**Verified by aggregator** against `0016:66`.

### CON-26 · warning · `affects:` mixes vocabularies and omits two surfaces
`write-test` is not a manifest module slug (`manifest.yaml:74-80` puts `skills/write-test/` inside
`implementation`, already listed). Missing `design` (revision 4 edits `skills/specify/SKILL.md`)
and `strategic-planning` (Behavior 18 changes `/adev:status`).

### CON-27 · warning · the "103 prose-asserting test files" figure is not reproducible
Better than the round-3 "repo-B" citation but still uncheckable: no counting method is stated,
and four reasonable operationalisations give 149 / 130 / 213 / 109 — none is 103.
**Verified by aggregator:** `grep -rl "SKILL.md" tests --include="*.test.mjs"` returns **109**.
State the command, cite a bounded set, or drop the number.

### CON-28 · warning · error-code orphans persist both ways
Unreferenced by any behavior: `CONFLICTING_ESCALATION_RULE`, `NO_RECORDED_ASSIGNMENT`,
`DEPTH_FLOOR_APPLIED`. Referenced but unnamed: Behaviors 12 and 16 describe validation without
naming `INVALID_TASK_ID` or `POLICY_PATH_OUTSIDE_ROOT`. Down from six to three.

### CON-29 · warning · two ACs are verifiable only by string-matching markdown
The `skills/specify/SKILL.md` frontmatter AC and the upgrade-note AC can only be tested by
asserting on prose — which this spec's own Documentation Requirements forbid and its Principle 2
section condemns. A third AC asserts spec text ("no qualifier anywhere in the spec").

### CON-30 · warning · "the shipped plan-anchor form" does not exist
`plan-task-events.spec.md:89` says task ids are "typically `t1`, `t2`" — advisory, not a pinned
grammar. Pin the regex here as Behavior 16 does for `--module`.

### CON-31 · suggestion · `POLICY_PATH_OUTSIDE_ROOT` vs shipped `PATH_OUTSIDE_ROOT`, and the row
conflates two conditions (workspace-root refusal is not a containment failure).

### CON-32 · suggestion · the `charter:` + `affects:` pairing is unprecedented and its stated
justification is over-strong — `specs/features/cross-cutting/` is itself under `specs/features/`,
so the relocation risk is smaller than the header comment claims.

---

## Summary

**Total findings:** 24 (4 blockers, 14 warnings, 6 suggestions). Blockers: 8 → 7 → 6 → **4**.

**Resolved this round:** the event-accumulation contradiction, the unevaluatable floor qualifier,
the narrowable sensitive-path set and its upgrade break, the unowned frontmatter field, the
cross-cutting frontmatter conflict, `granularity` in the payload, `floor_applied` semantics,
`charter-revision`, the escalation-flag orphan, and the ADR's stale consequence. Behavior
renumbering verified clean; every behavior now carries an AC.

**What still blocks:**

1. **The standalone carve-out is not reconciled** (SA-20) — Behaviors 5 and 6 and a Postcondition
   still say "every path", and the silent downgrade is unrecorded.
2. **The floor's sole input has no reader** (SA-21) — `targetPaths` derives from a plan `files:`
   field that does not exist in the shipped format.
3. **The floor is unenforced end-to-end** (SEC-6) — presence-only assertion plus the default
   `per-behavior` extend path means floored tasks routinely inherit shallow suites.
4. **The ADR now contradicts the spec** (CON-25) — four divergences introduced by editing one side.

Blockers 2 and 4 are mechanical. Blocker 1 is a wording reconciliation. Blocker 3 is the only one
requiring a design decision: whether to make floored tasks raise the suites they extend, add a
conformance leg to the Handoff Block, or accept a decorative floor for reused suites.

**Action required:** Revise to revision 5.

**Approver role (informational):** no `spec-to-plan` transition approver configured in
`governance/gates.yaml`.
