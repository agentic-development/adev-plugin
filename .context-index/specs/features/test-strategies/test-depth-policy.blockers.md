# Blockers: test-depth-policy

> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Spec revision:** 5
> **Review date:** 2026-08-11
> **Verdict:** BLOCK
> **Blocker count:** 10 (up from 4 — see the review's Regression Note)

The revision-5 enforcement machinery (Behavior 3 raise-on-extend, Behavior 14 conformance and
evasion legs) was built from round 4's own recommendations and does not function. Seven of the
ten blockers below are consequences of that, found independently by two or three reviewers.

---

## structural-architect:adr-conflict:d1ce3672

- **section_anchor:** `behaviors-3` · **finding-type:** adr-conflict
- **duplicate lens:** `security-reviewer:authorization:5bdac70c` (SEC-18)

Behavior 3 puts "extend **and raise**" in `/adev:plan`'s output, conditioned on the task's
*resolved depth* — a value ADR-0016 §1/§2 place at test-authoring time precisely because
routing scores do not exist before `/adev:route`. It reintroduces the circular dependency
ADR-0016 was created to close. Second leg: a suite authored by an earlier task is hash-locked
(`immutable-handoff-block.spec.md:39`), so raising it at implement time reads as a
HASH_MISMATCH — i.e. as gaming.

**Resolution:** Relocate the raise to implement-time suite acceptance as a depth check against
the reused suite's recorded depth. State the relationship to the locked packet (re-lock
contract or bounded exception), and give reuse detection a mechanical criterion so "this suite
doesn't cover my behavior" is not an unchecked judgement that dodges the raise.

---

## structural-architect:ambiguous-behavior:b290e5c2

- **section_anchor:** `behaviors-14` · **finding-type:** ambiguous-behavior

Both new legs are unimplementable as written. **(b) Conformance** reads `assigned_depth` from
the Handoff Block, but that artifact is `.context-index/packets/<slug>-tests.md`, keyed on a
slug derived from the *spec* and overwritten on each RED run; its field list carries no
`task_id`. Under the shipped `per-behavior` default N tasks share one slug, so
`assert-assigned --task-id <id>` has no per-task record to read. **(c) Evasion** names no diff
baseline and no per-task attribution rule.

**Resolution:** Give the conformance record a per-task key, and pin the diff's baseline and
lifecycle point.

---

## structural-architect:missing-interface:e5adc0d2

- **section_anchor:** `behaviors-8` · **finding-type:** missing-interface

The pinned `**Files:**` parse does not match the shipped format. Verified against shipped
plans: every path is backticked; bullets carry leading and trailing prose (`- Test: extend
\`tests/...\`` plus em-dash explanations containing further backticked non-paths); blocks can
be entirely unlabelled; `**Tests:**` is a separate required field that is often prose and whose
role is unstated; and **17 of 150 shipped plans carry no `**Files:**` block at all**, so
fail-closed makes every task in those in-flight plans unimplementable — contradicting the
spec's "Migration semantics are inert" claim.

**Resolution:** Pin the parse against the real format (backtick stripping, prose tolerance,
unlabelled bullets, `**Tests:**` disposition) and define the migration path for plans with no
block.

---

## security-reviewer:authorization:f0ca3d3c

- **section_anchor:** `behaviors-14` · **finding-type:** authorization

The conformance leg is self-attested by the checked party. `write-handoff.mjs:43-46` hashes
**test file contents only** — frontmatter is outside the hash, so `assigned_depth` and covered
case classes would be unattested fields written by the write-test subagent being checked
(exactly like the existing self-reported `gaming_check: passed`). And "the case classes
actually covered" has no machine-decidable definition; `gaming.mjs` is depth-invariant, so
nothing computes it.

**Resolution:** Take assigned depth from the **event log** (`resolve` is sole writer), never
from the block. Take only covered-case-classes from the block and state plainly that it is an
attestation, not evidence.

---

## security-reviewer:authorization:6bd2097b

- **section_anchor:** `behaviors-14` · **finding-type:** authorization

The evasion leg runs in the wrong phase and cannot see the files it targets. (1) Suite
acceptance is RED-complete; the source edits to sensitive paths happen in GREEN, *after* the
check. (2) `git diff --name-only` never lists untracked files, and `Create:` tasks produce
exactly those. (3) No range and no per-task boundary: the only per-task boundary is the
mandatory commit, which postdates the check; serial mode mixes prior uncommitted changes into
attribution (false-positive blocks), and under `--parallel` the orchestrator cwd sees nothing.

**Resolution:** Run the re-evaluation at task-commit time against
`git diff --name-only <task-base>..HEAD` plus `git ls-files -o --exclude-standard`, with the
base pinned explicitly.

---

## security-reviewer:authorization:783bdf8a

- **section_anchor:** `behaviors-7` · **finding-type:** authorization

The sensitive-path set *is* narrowable: delete the file. Monotonicity holds only against
`DEFAULT_SENSITIVE_PATHS`, not against the previously effective set. `rm sensitive-paths.yaml`
is legal (Behavior 7: absent → built-in) and silently drops every project extension —
including the adev self-hosting overlay that is the entire SEC-8 remedy. The deletion is
floored, but the floor demands tests, not approval, so it lands. Making absence illegal would
regress the round-3 upgrade guarantee.

**Resolution:** Correct the Capability and Behavior 7 ("structurally impossible" is false), and
give the required overlay a real mechanism — a required-overlay assertion in adev's own gates,
or ship the paths as a domain-level default.

---

## security-reviewer:authorization:5bdac70c

- **section_anchor:** `behaviors-3` · **finding-type:** authorization
- **same defect as** `structural-architect:adr-conflict:d1ce3672`

Behavior 3's raise-on-extend is unemittable: `/adev:plan` cannot know a value resolved at
test-authoring time, "the depth the existing suite was authored at" has no named source, and
raising a shared suite mutates hash-locked test files.

**Resolution:** As for d1ce3672.

---

## consistency-analyzer:contract:6b8bde4d

- **section_anchor:** `acceptance-criteria` · **finding-type:** contract

A stale AC survived the SA-21 fix: it still says `resolve` derives `targetPaths` "from the plan
task's declared `files:`", contradicting Behavior 8's explicit "prose bullets, **not** a YAML
`files:` list" and the AC that asserts the `**Files:**` parse. The same stale vocabulary leaks
into Behavior 14c and one further AC.

**Resolution:** Delete the superseded AC and purge `files:` vocabulary from Behavior 14c.

---

## consistency-analyzer:contract:a163c445

- **section_anchor:** `interface-contract` · **finding-type:** contract

The `assert-assigned` Interface Contract row describes only the presence leg and
`MISSING_DEPTH_ASSIGNMENT`, while Behavior 14 gives the verb three legs and two more exit
codes. The Interface Contract table is the machine-facing contract an implementer builds from,
so as written it ships the SEC-6 fix silently disabled. Documentation Requirements likewise
name only the verbs, with no row covering conformance, evasion, or the Handoff Block change.

**Resolution:** Restate the row with all three legs and their codes; add the Handoff Block
extension to the docs table.

---

## consistency-analyzer:contract:e083a8d9

- **section_anchor:** `behaviors-14` · **finding-type:** contract

Behaviors 14b and 3 change `immutable-handoff-block.spec.md`'s contract with no amendment
artifact: packet keying (slug vs `plan`+`task_id`), the closed content list (which excludes
`assigned_depth`), and hash invalidation (raising a suite mutates hash-locked files). This spec
correctly amends `plan-test-mapping.spec.md` per `spec-amendment-artifacts.spec.md` but changes
this sibling with only a Task Map row.

**Resolution:** Add the amendment, and pin packet keying plus re-hash semantics.
