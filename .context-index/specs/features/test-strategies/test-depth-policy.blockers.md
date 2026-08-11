# Blockers: test-depth-policy

> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Spec revision:** 4
> **Review date:** 2026-08-10
> **Verdict:** BLOCK
> **Blocker count:** 4

---

## structural-architect:ambiguous-behavior:0c44c396

- **section_anchor:** `behaviors-17` · **reviewer:** structural-architect · **finding-type:** ambiguous-behavior
- **carried from round 3** (SA-13, partially resolved — hard-fail gone, contradiction relocated)

Behavior 17 performs "no chain resolution" and no floor evaluation, but chain stage 1 *is* the
spec-declared `test_depth:`, and Behavior 6 plus the Postcondition say the floor is applied
"in every path". Either "every path" means every code path inside `resolveTestDepth` — in which
case Behaviors 5, 6 and the Postcondition must say so — or it means every invocation path, in
which case Behavior 17 contradicts all three.

The unstated consequence: a spec carrying `test_depth: thorough`, or one matching a sensitive
path, whose tests are authored standalone silently gets `standard`. That is a two-regime system
and it is absent from Known Limitations, though the docs table requires standalone behavior to
be documented.

**Resolution:** Qualify Behaviors 5 and 6 and the Postcondition to plan-task resolution, and
record the standalone downgrade as a third Known Limitation.

---

## structural-architect:missing-interface:a19d5e8a

- **section_anchor:** `behaviors-8` · **reviewer:** structural-architect · **finding-type:** missing-interface
- **NEW in round 4**

Behavior 8 and two ACs make `resolve` derive `targetPaths` "from the plan task's declared
`files:` list via the plan reader". Verified: (i) the shipped task format
(`skills/plan/SKILL.md:608`) is a prose `**Files:**` block with `Create:` /
`Modify: existing.ts:123-145` / `Test:` sub-bullets — there is no `files:` list; (ii) nothing
in `lib/` parses that block; (iii) no Task Map row creates such a reader. The fail-closed
floor's sole input has no defined source format and no owner. `Modify:` entries also carry line
ranges that must be stripped before glob matching, and `Test:` paths would otherwise enter
`targetPaths`.

**Resolution:** Pin the parsed shape and normalisation rules (strip line ranges, exclude or
include `Test:` deliberately), and add a Task Map row for the plan-task file reader.

---

## security-reviewer:authorization:0acf5a4c

- **section_anchor:** `known-limitations` · **reviewer:** security-reviewer · **finding-type:** authorization
- **NEW in round 4** (sharpened from round-3 SEC-4 leg 3)

Presence-not-conformance is the **sole binding** between the floor and any effect on a suite:
`resolve` computes `thorough`, passes it to a subagent as a prompt input, and `assert-assigned`
verifies only that an event exists. The spec records this as a limitation without noticing that
the built-in default granularity (`per-behavior`) makes the unchecked path the **common case**:
under Behavior 3 a task whose behavior is already covered receives an "extend" instruction
against a suite authored at whatever depth the *first* task resolved. A sensitive-path task
floored to `thorough` therefore routinely extends a `minimal` suite while every postcondition
still holds. Nothing in Behaviors 3, 6, 13, 14 or 17 requires a floored task to raise the
existing suite.

**Resolution:** (1) Behavior 3 — when floor conditions hold and `tests:` targets an existing
suite, the instruction must be "extend **and raise the whole suite to the assigned depth**".
(2) Give `assert-assigned` a conformance leg: `write-handoff.sh` already produces a hashed
immutable Handoff Block per suite — add `assigned_depth` and covered case classes to it and
fail when authored depth is below assigned depth. Without one of these the floor is decorative
for reused suites.

---

## consistency-analyzer:contract:e16bf340

- **section_anchor:** `interface-contract` · **reviewer:** consistency-analyzer · **finding-type:** contract
- **NEW in round 4** (regression — round 3 verified spec/ADR agreement)

Revision 4 edited the spec side only, so ADR-0016 now contradicts it in four places:

1. **Payload** — `0016:66` lists `granularity`; the spec drops it and adds `escalation_skipped?`.
   This field list becomes `REQUIRED_FIELDS_BY_EVENT`, so an implementer reading the ADR ships a
   schema that rejects every event `resolve` emits.
2. **Accumulation** — `0016:72` says "one assignment per task"; Behavior 13 says more than one,
   most recent wins.
3. **Standalone** — `0016:48` says standalone "resolves from the static chain alone"; Behavior 17
   says it reads no policy configuration at all.
4. **Writer** — `0016:46` says `/adev:implement` appends the event; Behavior 12 makes `resolve`
   the sole writer.

The Task Map's ADR row is scoped to work that already landed, so as written it covers none of
the four and the ADR ships stale.

**Resolution:** Update ADR-0016 §2 and §4 to match, and rescope the Task Map's ADR row to
enumerate all four.
