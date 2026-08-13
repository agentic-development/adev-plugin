---
charter: pr-review-brief
kind: behavioral
status: review-passed
risk_level: medium
milestone:
revision: 5
charter-revision: 6
created: 2026-08-12
updated: 2026-08-13
---

# Live Spec: PR Body Advisories

## Behavioral Contract

Two further sections of the brief `adev pr body` writes, covering the charter's should-have capabilities: a **size advisory** stating how large the PR is against a budget and naming the exception classes that legitimise going over it, and a **reading order** turning the plan's `## Parallelization` groups into a suggested sequence for reading a multi-commit diff.

Both are advisory in the strict sense the charter's Availability attribute requires: they change what the brief says, never whether it is produced, and never whether a merge proceeds. Both inherit every invariant of `pr-body-composition.spec.md` — single marker pair, total degradation, encoding, containment, determinism — and add no exception to any of them.

**This spec states properties. Values live in tests.** Revisions 1 through 3 each carried measured corpus figures, rung-boundary tables, and numeric bounds restated across five sections. Every round, one restatement went stale while the others moved: the recurring defect was never a wrong idea, it was one fact written down five times. Counts and thresholds now live in § Test Obligations, where each has exactly one home and a test that recomputes it.

## Section Placement

This spec supplies slots 1 and 3 of the five-slot list `pr-body-composition.spec.md` defines and assembles. It emits no marker of its own.

The size advisory leads *within the generated block* because it is the section a reviewer needs earliest — a 3,000-line PR with no declared exception is a scheduling decision, not a reading task. Reading order sits between the attention map and traceability: the attention map answers *what deserves scrutiny*, reading order answers *in what sequence*.

**The generated block is not at the top of the PR body.** `review-packet-template.spec.md` places the marker pair after the author's four sections, so "slot 1" means first among the generated sections, never first in the body. That ordering is deliberate: orientation comes from the author's problem statement first, and a delivery bug that replaces from the opening marker to end-of-body then destroys only generated content.

## Reading Order

**This spec defines no grammar.** `## Parallelization` is parsed by `lib/parallel/groups.mjs`, owned by the `worktree-parallelization` charter and already consumed by `/adev:implement --parallel`. One on-disk format, one parser. Revision 1 wrote a second grammar and was blocked for it; the same reasoning forbids writing one now for any other section.

**`## Task Summary` is deliberately not consumed.** Revision 2 routed most of its fallback path through that section's row order. It has no parser in `lib/`, no owner, and no charter declaration — depending on it meant growing a second prose parser, which is the defect revision 1 was blocked for, reintroduced. Dropping it costs real ordering quality: the degraded path now orders by commit chronology rather than plan task order, which is worse. It is the ordering available without owning a parser this charter has no business owning, and the charter's promise of "plan task order" is correspondingly narrowed to the case where the owned parser succeeds.

### Fallback ladder

Three rungs. The rung reached is named in the output, per plan.

Rungs are assigned **per plan**, never per group. A plan reaches exactly one rung.

| Rung | Condition | Ordering | Annotation |
|---|---|---|---|
| 1 | The plan was read, and the parser yielded at least one group, and **every** group it yielded has at least one member | Group order, then de-duplicated member order | none — the normal case |
| 2 | The plan was read, but the parser yielded no groups **or any** group it yielded has no members | Commit order over the range | names which case applied, the plan path, and that ordering is chronological rather than planned |
| 3 | The plan could not be read — absent, unreadable, not a regular file, or refused by a resource bound | Commit order over the range | names the path and which case applied |

The ladder is total and disjoint, and the two predicates that make it so are stated as a mutually exclusive pair rather than left to be inferred: rung 1 requires **every** group populated, rung 2 fires on **any** group empty. Revision 3 lost this. Its rung 1 read "every group has at least one member" and its rung 2 read "yields nothing usable", which together left the mixed case — some groups populated, at least one empty — matching neither. That state exists in the corpus today, so the gap was reachable rather than theoretical.

The read/parse split is what makes rungs 2 and 3 disjoint by construction: rung 3 is the only rung reachable without a successful read, so a plan that reads successfully but yields nothing — including a zero-byte file — is unambiguously rung 2.

A mixed plan degrades whole. Rendering its populated groups at rung 1 while dropping the empty one is precisely the silent omission this ladder exists to prevent, and partial credit would make the annotation a lie about the plan as a whole.

Ordering within a rung is total: groups keep the parser's order, members keep theirs after de-duplication, and commit order is `git log --reverse` over the resolved range. The `independent` flag renders as a per-group label and reorders nothing, because it describes execution safety rather than reading sequence.

**Members are de-duplicated per group, keeping first occurrence.** The parser scrapes task references from the whole group line, so a line naming a task twice yields it twice; a reading order telling a reviewer to read task 1, then 2, then 3, then 1 again is wrong on its face. De-duplication is per group — the same task legitimately appearing in two groups is the plan saying something, and is preserved.

## Size Advisory

Size is the diff stat over the range. Two figures are reported: **raw** across every changed path, and **net** excluding paths configured as generated mirrors. Net is compared against the threshold; raw renders alongside so the exclusion is visible rather than silently applied.

Below the threshold the section states the figures. At or above, it adds the exception classes — named, defined, and left for the author to claim:

- **Mechanical sweep** — one transformation applied uniformly across many files.
- **Generated mirror** — output regenerated from a source that is itself under review.
- **Migration** — a move or rename whose size is displacement, not new logic.

**The verb asserts none of them.** Only generated mirror has deterministic evidence, and that is already in the net figure; the other two are author claims. The advisory points at the review packet's problem-statement section as the place to make the claim, in prose and never at the start of a line, so it cannot collide with the packet-heading interlock. A generator guessing "mechanical sweep" from diff shape would launder a heuristic into an excuse.

## Configuration

One optional manifest block supplies the threshold and the mirror globs. Absent, documented defaults apply and the advisory says it used them.

**Configuration is read from the base ref, never the working tree.** The manifest sits inside the very range the advisory measures, so reading the head-side copy puts the threshold under the control of the author whose change is being sized — a PR raising it would pass every shape check and silently disable the advisory, with nothing for a reader to notice, because the below-threshold form is a legitimate normal output.

This makes configuration a function of `base`. Determinism is specified over a fixed resolved `(base, head)` pair, of which `base` is an element, so the criterion holds; two runs at different bases may legitimately differ, and the brief names the base it resolved and the configuration source it used so a reader can tell which case they are in.

## Resource Bounds

Every quantity this spec renders is bounded, and every bound renders a named degradation rather than a silent trim.

Four dimensions are bounded because each is independently unbounded in the input: the size of a plan file before it is read, the number of groups drawn from one plan, the number of members within one group, and the total bytes the two sections contribute to the brief. The plan read is additionally refused unless the target is a regular file, since a symlink to a character device is not large and no size ceiling would catch it.

The unit of every bound is the individual rendered value, not a rendered list.

**The total-bytes bound is cross-slot, so it cannot be owned by either slot renderer** — neither can observe the other's size. It is enforced by the marker assembly in `pr-body-composition.spec.md`, which is the only component that sees all slots, and this spec's renderers report their contribution rather than policing the total.

## Preconditions

- Everything `pr-body-composition.spec.md` requires; this spec adds no precondition on git state.
- `lib/parallel/groups.mjs` is available. This is a hard dependency on a module owned by the `worktree-parallelization` charter, declared in this charter's Dependencies table.
- The manifest may or may not carry the configuration block at `base`, and may not exist at `base` at all. Either absence means documented defaults.
- Plan artifacts may or may not exist. Absence is a normal input state, not an error.

## Test Obligations

Every number this spec used to carry in prose. Each lives in one place and is recomputed rather than asserted, so a figure cannot rot silently and cannot disagree with a copy of itself.

| # | What the test pins | Why it cannot live in prose |
|---|---|---|
| T1 | Current parser coverage over the plan corpus — how many plans yield usable groups versus nothing usable — recomputed by a checked-in script over an explicitly defined corpus root | Revision 1 asserted a coverage figure measured against two files; revision 3's figures drifted by one plan within a day of being written |
| T2 | The measured causes of parse failure and their relative sizes, so the deferral argument in § Deferred Capabilities rests on current data | Revision 2 claimed one cause dominated; measurement refuted it, and the wrong figure had already propagated from the charter |
| T3 | That the parser yields duplicate members on real corpus input, and that de-duplication removes them without collapsing a task legitimately present in two groups | The duplicate rate is a property of corpus content and of the parser's scrape, neither owned here |
| T4 | The parser's behaviour on plural and ranged task references, and that a **plan** containing such a group reaches rung 2 whole — including the mixed case where its other groups are populated, for which a corpus witness exists | This is the silent-omission defect revision 1 was blocked for, and the mixed case is where revision 3's ladder lost totality; it must be executable, not described |
| T5 | The numeric value of each of the four resource bounds, and that exceeding each renders its named degradation | Bounds restated across five sections is exactly how revisions 2 and 3 went inconsistent |
| T6 | The threshold default, and that configuration resolves from `base` even when the head-side manifest differs | The head-side bypass is the security property; only an executable test proves the read side |
| T7 | That no output line begins with a review-packet H2 heading, and that the packet pointer renders inline | The interlock is defined by `review-packet-template.spec.md`, not by this prose |

## Deferred Capabilities

| Capability | Reason | Depends On |
|---|---|---|
| Widening the owned parser to recognize more group-line forms | Deferred on a ground that holds at any magnitude: the same widening moves plans from serial fallback into concurrent execution in `/adev:implement --parallel`, a behaviour change in another charter's module that needs evidence those groups are genuinely independent. The coverage gain is real and T2 measures it, but the argument deliberately does not rest on that figure — revision 2 deferred on a magnitude claim that measurement later refuted. | `worktree-parallelization` accepting the coverage change |
| A structured emitter for `## Parallelization` owned by `/adev:plan` | The real fix. The section is prose emitted by a skill and parsed by consumers, so coverage is bounded by how uniformly authors happen to write it. An owned format would make the parser total instead of tolerant. Larger than either consuming charter. | a decision to make `/adev:plan` emit a structured sidecar |

## System Constitution Reference

- **Principle 1: minimize external dependencies** — applies twice. The obvious way to read `## Parallelization` is a markdown AST library; consuming the owned parser keeps `git`, `fs`, and `node:test` sufficient. It applies internally too: a second in-repo parser for one on-disk format is duplication this project would have to maintain.
- **Anti-pattern: no inline Node in SKILL.md** — both sections are computed in `lib/cli/pr.mjs`; no skill prose gains parsing logic.
- **Boundary (Autonomous): refactoring within a module's boundaries** — extends a verb the sibling spec introduces, adds one optional manifest block, changes no hook protocol and no plugin registration.
- **Quality Attribute (charter): Observability — degrades loudly** — every rung and every bound is visible in the output, because a reading order derived from commit chronology looks identical to one derived from a plan unless the brief says which it is.

## Behaviors

Each behavior instantiates a contract above rather than restating it. Where a behavior and a contract appear to disagree, the contract governs.

- **When** the brief is composed **then** these two sections occupy slots 1 and 3, supplied to the marker assembly the sibling spec owns.
- **When** the parser yields groups with at least one member each **then** the reading order lists them at rung 1, de-duplicated, each group labelled with its independence flag.
- **When** the parser yields nothing usable **then** the plan reaches rung 2, ordering is chronological, and the output names which case applied.
- **When** the plan cannot be read **then** it reaches rung 3 with the path and cause named.
- **When** net additions are below the threshold **then** the advisory states the figures and names no exception class.
- **When** net additions reach the threshold **then** the figures render with the three exception classes and a pointer to the review packet, and the verb still exits 0.
- **When** paths match a configured mirror glob **then** net excludes them and the advisory names how many were excluded and by which glob.
- **When** configuration is absent at `base` **then** defaults apply and the output names both the base it resolved and the configuration source it used.
- **When** any resource bound is exceeded **then** the excess is dropped and the output names what was dropped and how much.

## Postconditions

- Both sections render inside the sibling spec's single marker pair; this spec emits no marker.
- No file is created, modified, or deleted, including the manifest.
- Exit code is unchanged from `pr-body-composition`: 0 whenever `HEAD` and the base ref resolve, whatever state the plans and configuration are in.

## Error Cases

This spec introduces no condition that changes the exit code. Every failure below is advisory and covered by the ladder or by Invariant 4 of the sibling spec, which is stated universally so that unanticipated failures are covered by construction rather than by list.

| Condition | Expected Behavior |
|-----------|-------------------|
| Plan absent, unreadable, not a regular file, or over the size bound | Rung 3, naming the path and which case applied |
| Parser yields no usable groups, for any reason | Rung 2, naming which case applied |
| Configuration present but malformed at `base` | Documented defaults apply; the advisory names the rejected value |
| A resource bound is exceeded | Render up to the bound, annotate what was dropped |
| Range is empty | Both sections render their empty-range line within the full five-slot brief |

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|-----------|
| Parser consumption | Call the owned parser; classify its outcome into the three rungs. No grammar authored here. | small |
| De-duplication | Per-group member de-duplication preserving first occurrence and cross-group presence. | small |
| Reading order renderer | Groups and members in parser order, per-spec blocks each carrying their rung annotation. | medium |
| Base-ref config reader | Resolve configuration from `base`; never read the working-tree copy; defaults when absent. | small |
| Size computation | Raw and net diff stat; partition by mirror globs; count exclusions per glob. | small |
| Size advisory renderer | Below-threshold statement; at-threshold escalation with the exception classes and the inline packet pointer. | small |
| Resource bounds | The four bounds, the regular-file check, and each named degradation. The cross-slot total is reported to the marker assembly, not enforced here. | medium |
| Coverage script | The checked-in recomputation backing T1 and T2, over an explicitly defined corpus root. | small |
| Tests | Every behavior, every rung, and every row of § Test Obligations. | large |

## Acceptance Criteria

- [ ] Each of the three rungs has a test asserting both the ordering used and its annotation.
- [ ] The ladder is exhaustive and disjoint: a test enumerates parser outcomes — including the mixed case of populated and empty groups in one plan — and asserts each maps to exactly one rung.
- [ ] A mixed plan degrades whole; a test asserts none of its populated groups renders in normal-case form.
- [ ] Every row of § Test Obligations has a test pinning it, and T1/T2 recompute from the corpus rather than asserting a literal.
- [ ] No `## Task Summary` is read on any path; a test asserts the module contains no reference to that heading.
- [ ] No `## Parallelization` grammar is authored; a test asserts the module defines no such pattern of its own.
- [ ] Configuration resolves from `base`; a test with a differing head-side value asserts the base-side one is used and escalation still fires.
- [ ] Every bound renders a named degradation; a test per bound asserts the annotation appears and the output stays within the bound.
- [ ] The packet pointer never renders at the start of a line; a test asserts it.
- [ ] Output is byte-identical across two runs on an unchanged resolved pair.
- [ ] No new dependency is added; a test asserts `package.json` is unchanged.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.
