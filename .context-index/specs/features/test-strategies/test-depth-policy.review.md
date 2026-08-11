# Architecture Review: test-depth-policy (revision 5)

> **Date:** 2026-08-11
> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Rigor tier:** full (explicit `--tier full`; risk_level `medium` → `review_mode: full`)
> **Verdict:** BLOCK
> **last-reviewed-revision:** 5
> **file-sha:** ef01b8e5b4516550ff4ca181c8f02cf4070315c6142c93ab0fd4c0bdcfd8ea9b

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Regression Note

**Blockers rose from 4 to 10.** Revision 5 built the SEC-6 enforcement machinery from round 4's
own recommendations — a Handoff Block conformance leg and a `git diff` evasion leg — and
implemented them faithfully. All three reviewers independently found that the machinery does
not function. The Security Reviewer states it directly: *"Round 4's own recommendation was
unsound and revision 5 implemented it faithfully."*

Seven of the ten blockers are consequences of that machinery, each found by two or three
reviewers through different lenses. The lesson for revision 6 is that a reviewer's proposed fix
is a hypothesis, not a specification: the Handoff Block's hash scope, its keying, and
`git diff`'s treatment of untracked files were all checkable before adopting the recommendation.

## Round-4 Disposition

| Round-4 blocker | Status |
|---|---|
| SA-20 standalone reconciliation | **PARTIALLY RESOLVED** — scoping is correct and the limitation is recorded; one AC still says "in every path" unqualified |
| SA-21 `targetPaths` source | **PARTIALLY RESOLVED** — reader task added, but the pinned parse does not match the shipped format (SA-31), and a stale AC survives (CON-33) |
| SEC-6 floor unenforced | **NOT RESOLVED** — machinery added; neither leg functions (SEC-13, SEC-14) |
| CON-25 ADR divergence | **RESOLVED** — all four points verified realigned; no new spec↔ADR divergence found |

Also resolved: SA-22 (ADR row rescoped), SA-25 (`INVALID_SENSITIVE_PATHS`), SEC-7 (Capability
scoped), SEC-9 (matching verified: `matchGlob` compiles `**/auth*` to `^.*auth[^/]*$`, which
matches `src/auth.ts`, and `**/.env*` matches `services/api/.env.production`), SEC-10
(`--task-id` pinned), CON-30.

**Mechanical-damage scan: clean.** The Consistency Analyzer read the whole file and ran
duplicate-line, unbalanced-backtick, and per-table cell-count checks. Every pipe-count outlier
is an escaped `\|` inside a cell. No truncated sentences, lost list markers, or broken fences —
the scripted edits did not corrupt the document.

---

## Structural Architect — BLOCK

### SA-29 · blocker · raise-on-extend cannot be emitted at plan time, nor executed later
`blocker_id: structural-architect:adr-conflict:d1ce3672` · `section_anchor: behaviors-3`

Behavior 3 puts the raise instruction in `/adev:plan`'s output, conditioned on the task's
*resolved depth* — a value ADR-0016 §1/§2 place at test-authoring time precisely because
routing scores do not exist before `/adev:route`. It reintroduces the circular dependency
ADR-0016 was created to close. Second leg: a suite authored by an earlier task is hash-locked
(`immutable-handoff-block.spec.md:39`), so a later floored task raising it produces a hash
mismatch — it reads as gaming. Nothing defines what happens to the prior lock, and nothing
forbids a later `minimal` task from extending a `thorough` suite.

### SA-30 · blocker · Behavior 14 legs (b) and (c) are not implementable as specified
`blocker_id: structural-architect:ambiguous-behavior:b290e5c2` · `section_anchor: behaviors-14`

Conformance reads `assigned_depth` from a packet keyed on a **spec-derived slug**
(`immutable-handoff-block.spec.md:37,41`), overwritten each RED run, with no `task_id` in its
field list — under `per-behavior` reuse, `assert-assigned --task-id <id>` has no per-task record
to read. Evasion names no diff baseline and no per-task attribution, and its placement is wrong
for its purpose: at suite acceptance the RED phase has produced test files only, so the source
paths it exists to catch do not exist yet.

### SA-31 · blocker · the pinned `**Files:**` parse does not match the shipped format
`blocker_id: structural-architect:missing-interface:e5adc0d2` · `section_anchor: behaviors-8`

Verified against shipped plans: paths are backticked; bullets carry leading and trailing prose
(`- Test: extend \`tests/...\``, plus em-dash explanations containing further backticked
non-paths); blocks can be entirely unlabelled; `**Tests:**` is a separate required field, often
prose, whose role is unstated; and **17 of 150 shipped plans carry no `**Files:**` block**, so
fail-closed makes every task in those in-flight plans unimplementable — contradicting the
spec's "Migration semantics are inert" claim.
**Verified by aggregator:** 150 plans, 133 with a `**Files:**` block, 17 without.

### SA-32 · warning · the `assert-assigned` Interface Contract row is stale (also CON-34)
### SA-33 · warning · Behavior 14b changes another spec's artifact with no amendment task (also CON-35)
### SA-34 · warning · Behavior 18's `/adev:status` change still has no implementing task (SA-23 carried)
### SA-35 · warning · "most recent" still has no ordering key — append order vs timestamp (SA-24 carried)
### SA-36 · suggestion · one AC should carry Behavior 6's `resolveTestDepth` qualifier

---

## Security Reviewer — BLOCK

### SEC-13 · blocker · the conformance leg is self-attested by the checked party
`blocker_id: security-reviewer:authorization:f0ca3d3c` · `section_anchor: behaviors-14`

`write-handoff.mjs:43-46` hashes **test file contents only** — frontmatter is outside the hash,
so `assigned_depth` and covered case classes would be unattested fields written by the
write-test subagent being checked, exactly like the existing self-reported
`gaming_check: passed`. And "the case classes actually covered" has no machine-decidable
definition; `gaming.mjs` is depth-invariant, so nothing computes it.
**Recommendation:** take assigned depth from the event log (`resolve` is sole writer), never
from the block; take only covered-case-classes from the block and call it an attestation.
**Verified by aggregator** against `write-handoff.mjs:43-46`.

### SEC-14 · blocker · the evasion leg runs in the wrong phase and cannot see its targets
`blocker_id: security-reviewer:authorization:6bd2097b` · `section_anchor: behaviors-14`

Three independent defeats: suite acceptance is RED-complete so source edits happen in GREEN
*after* the check; `git diff --name-only` never lists untracked files and `Create:` tasks
produce exactly those; and there is no range or per-task boundary — the mandatory per-task
commit postdates the check, serial mode mixes prior uncommitted changes into attribution
(false-positive blocks), and under `--parallel` the orchestrator cwd sees nothing.
**Recommendation:** run at task-commit time against `git diff --name-only <task-base>..HEAD`
plus `git ls-files -o --exclude-standard`, with the base pinned.
**Verified by aggregator:** `git diff --name-only` omitted untracked files in this repo.

### SEC-15 · blocker · the sensitive-path set *is* narrowable — delete the file
`blocker_id: security-reviewer:authorization:783bdf8a` · `section_anchor: behaviors-7`

Monotonicity holds only against `DEFAULT_SENSITIVE_PATHS`, not against the previously effective
set. `rm sensitive-paths.yaml` is legal under Behavior 7 and silently drops every project
extension — including the adev self-hosting overlay that is the entire SEC-8 remedy. The
deletion is floored, but the floor demands tests, not approval, so it lands.

### SEC-18 · blocker · Behavior 3's raise-on-extend is unemittable (same defect as SA-29)
`blocker_id: security-reviewer:authorization:5bdac70c` · `section_anchor: behaviors-3`

### SEC-21 · warning · nothing enforces that `assert-assigned` is called
Behavior 14 is an instruction to a skill with no CLI-layer closure equivalent to Behavior 12's
sole-writer property. Under `--parallel`, group subagents run the TDD loop from prose inside
worktrees; if the group prompt omits the call, every check is skipped. `/adev:recover`
re-dispatch is a second path.

### SEC-17 · warning · adjacent inputs, opposite failure modes
`INVALID_SENSITIVE_PATHS` fails *closed*, so one malformed byte halts `resolve` repo-wide,
while deleting the same file silently narrows coverage. Since the built-in set is a strictly
safe fallback, hard-fail is unnecessary: fall back to it, floor the offending task, advise loudly.

### SEC-20 · warning · no packet↔`task_id` mapping; evidence is overwritten
Under the shipped `per-behavior` default, N tasks share one packet and re-running `--red`
overwrites it — task B's RED phase destroys task A's conformance evidence.

### SEC-16 · warning · the no-echo rule is unsatisfiable as written
Behavior 15 requires `show` to print the effective sensitive-path set *and* forbids either verb
echoing any path. SEC-12 concerned a task's `targetPaths` in `explain`; operator-authored config
patterns in `show` are a different exposure class. Scope the rule to `targetPaths`/`explain`.

### SEC-22 · suggestion · two Known Limitations are false, not understated
Both rest their reassurance on the legs SEC-13/14 show do not function.

---

## Consistency Analyzer — BLOCK

### CON-33 · blocker · a stale AC contradicts Behavior 8
`blocker_id: consistency-analyzer:contract:6b8bde4d` · `section_anchor: acceptance-criteria`

One AC still says `resolve` derives `targetPaths` "from the plan task's declared `files:`",
contradicting Behavior 8's explicit "prose bullets, **not** a YAML `files:` list" and the AC
asserting the `**Files:**` parse. The same stale vocabulary leaks into Behavior 14c.

### CON-34 · blocker · the `assert-assigned` interface row is one-third of Behavior 14
`blocker_id: consistency-analyzer:contract:a163c445` · `section_anchor: interface-contract`

The row describes only the presence leg while Behavior 14 gives three legs and two more exit
codes. The Interface Contract is the machine-facing contract an implementer builds from, so as
written it ships the SEC-6 fix silently disabled. The docs table likewise names only the verbs.

### CON-35 · blocker · `immutable-handoff-block.spec.md`'s contract is changed with no amendment
`blocker_id: consistency-analyzer:contract:e083a8d9` · `section_anchor: behaviors-14`

Three mismatches: packet keying (slug vs `plan`+`task_id`), the closed content list (which
excludes `assigned_depth`), and hash invalidation (raising a suite mutates hash-locked files).
This spec correctly amends `plan-test-mapping.spec.md` but changes this sibling with only a
Task Map row.

### CON-36 · warning · error-code orphans: three persisting, one new
`CONFLICTING_ESCALATION_RULE`, `DEPTH_FLOOR_APPLIED`, `NO_RECORDED_ASSIGNMENT` remain
unreferenced by any behavior; **new orphan** `INVALID_SENSITIVE_PATHS` has a code and an AC but
no behavior. Reverse direction half-fixed: Behavior 16 still describes the workspace refusal and
`--module` check without naming their codes.

### CON-37 · warning · prose-asserting ACs went from 3 to 6 — one created by the CON-25 fix
The AC asserting "ADR-0016 §2 and §4 match this spec" is verifiable only by string-matching an
ADR — the practice this spec forbids and its Principle 2 section condemns. One AC is also
**falsified by the spec's own text**: it asserts no "declares target files" qualifier exists
anywhere, while Preconditions and Behavior 8 both state a plan task always declares target files.

### CON-26 · warning · `affects:` still unfixed — `write-test` is not a module slug; `design` and `strategic-planning` still omitted
### CON-27 · warning · the "103 prose-asserting test files" figure is still not reproducible — four fresh operationalisations give 109 / 111 / 93 / 415
### CON-31 · suggestion · `POLICY_PATH_OUTSIDE_ROOT` vs shipped `PATH_OUTSIDE_ROOT`; the row still conflates two conditions
### CON-38 · suggestion · two pairs of near-duplicate ACs

**Verified clean:** all 19 behaviors carry at least one AC; four Known Limitations are recorded
(the spec says three in places — see SEC disposition) and all are internally coherent with the
scoped Behaviors 5/6 and the revised Capability.

---

## Summary

**Total findings:** 27 (10 blockers, 13 warnings, 4 suggestions). Blockers: 8 → 7 → 6 → 4 → **10**.

**What revision 5 genuinely fixed:** the ADR realignment (all four points), sensitive-path
matching semantics (verified against the real `matchGlob` behaviour), the `--task-id` grammar,
the Capability's overstated claim, malformed-config handling, and the scoping of Behaviors 5/6
to plan-task resolution. No mechanical damage from the scripted edits.

**What broke:** the SEC-6 enforcement machinery. Both new legs of `assert-assigned` and the
raise-on-extend rule are unimplementable as specified, and the three reviewers converged on them
from different directions. The Handoff Block does not hash the field the conformance leg would
trust, is keyed on the wrong identifier, and is overwritten between tasks that share a suite;
`git diff --name-only` runs before the files it targets exist and cannot see new ones.

**The disposition question for revision 6** is not which wording to change but whether
end-to-end floor enforcement belongs in this spec at all. Making it work requires amending
`immutable-handoff-block.spec.md`, moving the check to task-commit time, and giving conformance
a per-task key — a second capability's worth of work. The alternative is to specify the floor as
advisory, state that plainly in the Capability, and file enforcement as follow-on work.

**Action required:** Revise to revision 6, or descope.

**Approver role (informational):** no `spec-to-plan` transition approver configured in
`governance/gates.yaml`.
