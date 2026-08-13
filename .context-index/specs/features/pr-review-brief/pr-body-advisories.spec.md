---
charter: pr-review-brief
kind: behavioral
status: review-blocked
risk_level: medium
milestone:
revision: 2
charter-revision: 4
created: 2026-08-12
updated: 2026-08-13
---

# Live Spec: PR Body Advisories

## Behavioral Contract

Two further sections of the brief `adev pr body` writes, covering the charter's should-have capabilities: a **size advisory** that states how large the PR is against a budget and names the exception classes that legitimise going over it, and a **reading order** that turns the plan's `## Parallelization` groups into a suggested sequence for reading a multi-commit diff.

Both are advisory in the strict sense the charter's Availability attribute requires: they change what the brief says, never whether it is produced, and never whether a merge proceeds. Both share the determinism, escaping, and loud-degradation invariants already established by `pr-body-composition.spec.md`; this spec adds sections to that artifact rather than producing a second one.

The distinguishing risk here is not correctness but **credulous parsing**. The reading order's input is `## Parallelization`, a section emitted as free prose by `skills/plan/SKILL.md:458` with no schema behind it. A parser that guesses at malformed input produces a confidently wrong reading order, which is worse than none.

Revision 1 answered that by writing a new grammar for the section. That was wrong twice over. It duplicated a parser that already exists and is owned elsewhere, and it was validated against two hand-picked plan files while claiming to be "verified against real shapes" — measured against the corpus, a third of plans fell through every rung it defined into a silent empty reading order, which is exactly the failure it was written to prevent. Revision 2 deletes the grammar and consumes the owned parser instead.

## Section Placement

This spec claims two slots in the single `<!-- adev:pr-brief -->` marker whose section list `pr-body-composition.spec.md` defines. The full order after both specs land:

| # | Section | Owning spec |
|---|---------|-------------|
| 1 | Size advisory | this spec |
| 2 | Attention map | `pr-body-composition` |
| 3 | Reading order | this spec |
| 4 | Traceability | `pr-body-composition` |
| 5 | Verification | `pr-body-composition` |

The size advisory leads *within the generated block* because it is the section a reviewer needs earliest — a 3,000-line PR with no declared exception is a scheduling decision, not a reading task. Reading order sits between the attention map and traceability: the attention map answers *what deserves scrutiny*, reading order answers *in what sequence*, and both precede the spec-by-spec accounting that traceability provides.

**The generated block is not at the top of the PR body.** `review-packet-template.spec.md` places the marker pair after all four author-written sections and requires the closing marker to be the last non-blank line, so in a rendered pull request the size advisory sits below the author's packet. That ordering is deliberate and this spec does not override it, for two reasons. Orientation comes first: an attention map means little until the reader knows from `## What` what the change is for. And the placement is a safety property — a delivery bug in `cicd` that replaces from the opening marker to the end of the body destroys only generated content when the block is last, whereas the same bug with the block on top would eat the author's packet. "Slot 1" throughout this spec therefore means first among the five generated sections, never first in the PR body.

`pr-body-composition.spec.md` carries the same five-slot list; it took that list in its revision 2, when this spec's revision 1 first claimed the two slots. Both specs are pre-shipping, so corrections land in place — no `--amend` artifact, which the specify skill reserves for validated specs.

## System Constitution Reference

- **Non-Negotiable Principle 1: "Minimize external dependencies."** — Applies twice. The obvious way to read `## Parallelization` is a Markdown AST library; consuming `lib/parallel/groups.mjs` keeps `git`, `fs`, and `node:test` sufficient. It also applies internally: a second in-repo parser for one on-disk format is duplication, and the principle's spirit covers code this project would have to maintain as much as code it would install.
- **Anti-pattern: "No `Run inline Node.js:` step directives … Skills name a CLI subcommand."** — Applies because both sections are computed inside `lib/cli/pr.mjs`; no skill prose gains parsing logic, and the fallback ladder below lives in the verb, not in a SKILL.md.
- **Architecture Boundary (Autonomous): "Refactoring within a module's boundaries."** — Applies because this extends a verb the sibling spec introduces, adds one optional manifest block, and changes no hook protocol and no plugin registration.
- **Quality Attribute (charter): Observability — "Degrades loudly."** — Elevated to a behavioral requirement here: every fallback rung named below must be visible in the rendered output, because a reading order derived from commit order looks identical to one derived from a plan unless the brief says which it is.

## Configuration

One optional manifest block, following the shape of the existing `hygiene:` and `repomap:` blocks. Absent means defaults; the verb never requires it.

```yaml
pr:
  # Additions above which the size advisory escalates from a statement to a warning.
  size_threshold_additions: 400
  # Paths whose diff is generated from another path and does not warrant review attention.
  mirror_globs:
    - "providers/*/skills/**"
```

`400` is not arbitrary. The charter's Business Intent measures this repo's last 40 merged PRs and finds the 41% exceeding 400 additions carry 96% of all changed lines — the threshold is set where this repo's distribution actually breaks, and the comment in the manifest says so.

`mirror_globs` exists because `providers/*/skills/**` is a generated mirror of `skills/**` in this repo. Counting it toward a review budget inflates every provider-touching PR with lines no human should read.

## Reading Order: Parser Ownership and Fallback Ladder

The reading order reads `<spec-stem>.plan.md` for each spec referenced by a `Spec:` trailer in the range, resolving that path under the containment rule in `pr-body-composition.spec.md` § Output Encoding Contract before any read.

**This spec defines no grammar.** `## Parallelization` is parsed by `parseParallelizationSection` from `lib/parallel/groups.mjs`, owned by the `worktree-parallelization` charter and already consumed by `/adev:implement --parallel`. One on-disk format gets one parser. Revision 1's second grammar meant the same plan file could yield different group sets to `/adev:implement` and to `adev pr body` — a divergence with no owner and no test that would catch it drifting further.

The parser returns `{ groups: [{ id, members[], independent }], malformed }` and never throws. Three of its return states are distinguishable and each maps to a rung:

| Parser return | Meaning |
|---|---|
| `groups.length > 0` | usable groups |
| `groups: [], malformed: true` | section present, no line the parser recognizes |
| `groups: [], malformed: false` | section absent entirely |

### The zero-member trap

A group line whose task references are plural or ranged — `- Group F (sequential): Tasks 14, 15, 16, 17` or `Tasks 8-14` — matches the parser's group regex but yields `members: []`, with `malformed: false`. The parser reports success for a group containing no tasks.

**A parsed group with zero members drops its plan to rung 3.** Without this rule, consuming the owned parser would inherit the exact silent-omission defect revision 1 was blocked for: a rung-1 outcome, annotation-free, with every task in the group dropped. Naming it here is the point — the defect is in a module this spec does not own, so the only thing this spec can do about it is refuse to present its output as complete.

Conversely, `- Group G (sequential): Task 7 (refactor -- depends on Tasks 2, 3, 5, 6)` yields `members: ["7"]`. The parser's task pattern requires singular `Task` followed by whitespace, so the plural inside the parenthetical does not match and no spurious members are collected. Revision 1 had two rules that disagreed on this case; there is now one rule, it lives in the parser, and this is the outcome.

### Fallback ladder

The rung reached is named in the output, per plan.

| Rung | Condition | Ordering used | Rendered annotation |
|---|---|---|---|
| 1 | Parser returns groups, all with at least one member | Group order, then member order within group | none — the normal case |
| 2 | Parser returns groups, `## Task Summary` present, but any group has zero members | `## Task Summary` table row order | names the zero-member group ids and the plan path |
| 3 | Parser returns groups with a zero-member group and no `## Task Summary`; **or** `malformed: true`; **or** section absent — in each case with `## Task Summary` present | `## Task Summary` table row order | states which of the three conditions applied, and the plan path |
| 4 | Any rung-2 or rung-3 condition holds **and** `## Task Summary` is absent | `git log --reverse` commit order | carries the higher rung's annotation *and* states that ordering is chronological, not planned |
| 5 | No plan file for a referenced spec, or the plan file is unreadable | `git log --reverse` commit order | names the path and whether it was absent or unreadable |

Rung 4 exists because `## Task Summary` is not universal: of the 138 plans carrying `## Parallelization`, 90 have a `## Task Summary` and 48 do not — including every plan that currently reaches a degraded rung. Revision 1 sent rungs 2 and 3 to a table that a third of the corpus lacks, and did not say what happens then. Rung 4 preserves the higher rung's annotation rather than replacing it, so a reader learns both what failed to parse and that the ordering they are looking at is chronological.

Groups keep the parser's `id` order. The parser's `independent` flag is rendered as a per-group label; this spec does not use it to reorder anything, because "independent" describes execution safety, not reading sequence.

### Measured coverage

Against the 138 plan files carrying `## Parallelization`, `parseParallelizationSection` yields usable groups for **79** and `malformed: true` for **59**. Rung 1 therefore covers roughly 57% of plans today and the rest degrade loudly.

That is a stated coverage figure, not an aspiration, and it is lower than revision 1 claimed for its own grammar. The gap is almost entirely one cause: the parser's qualifier is restricted to literally `(independent|sequential)`, so `(foundation, sequential)` and `(independent of A)` fail. Widening it would move roughly 22 plans into rung 1 — but the same widening moves those plans from serial fallback into concurrent execution in `/adev:implement --parallel`, which is a behaviour change in another charter's module and needs evidence those groups are genuinely independent. Deferred rather than taken unilaterally; see Deferred Capabilities.

## Size Advisory: Computation and Exception Classes

Size is `git diff --numstat base..head`, summed. Two figures are reported: **raw** (every changed path) and **net** (excluding paths matching any `mirror_globs` entry). Net is compared against the threshold; raw is shown alongside so the exclusion is visible rather than silently applied.

Below the threshold the section is a single statement of the figures. At or above it, the statement is followed by the exception classes — named, defined, and left for the author to claim:

- **Mechanical sweep** — one transformation applied uniformly across many files.
- **Generated mirror** — output regenerated from a source that is itself under review.
- **Migration** — a move or rename whose size is displacement, not new logic.

The verb **asserts none of these**. Only generated mirror has deterministic evidence (`mirror_globs`), and that is already reflected in the net figure; the other two are author claims. The advisory therefore points at the review packet's problem-statement section (`review-packet-template.spec.md`) as the place to make the claim. A generator that guessed at "mechanical sweep" from diff shape would launder a heuristic into an excuse, which defeats the point of asking.

That pointer is rendered as prose naming the section, never as a line beginning with `## `. The packet spec's interlock test asserts no `adev pr body` output path emits a packet heading *as a heading*; a pointer that rendered at the start of a line would satisfy the letter of "inline reference" while still producing a heading in the PR body.

## Output Encoding

Every value this spec renders — group ids, the parser's `independent` labels, task references, plan paths, zero-member group ids, rung annotations, and glob strings from `manifest.yaml` — passes through the single encoder defined in `pr-body-composition.spec.md` § Output Encoding Contract. This spec states no escaping rules of its own; two independently-worded contracts is how a gap reappears.

The dependency is worth naming explicitly because revision 1 described plan-derived values as "opaque, reproduced verbatim", and a reader could take "verbatim" to mean *unencoded*. It means **not semantically interpreted**. A group qualifier is never parsed for meaning and is always encoded before output.

**Length cap.** Plan-derived values are truncated at 200 characters with a visible `…(truncated)` suffix. Values read from a plan file are unbounded by the parser, and the brief is posted into a forge comment with a size limit — an oversized brief fails delivery entirely, which would break the charter's "never blocks" guarantee for a transport reason rather than a lifecycle one. Truncation is itself a named degradation, not a silent trim.

## Preconditions

- Everything `pr-body-composition.spec.md` requires; this spec adds no new precondition on git state.
- `manifest.yaml` may or may not carry a `pr:` block. Absence means `size_threshold_additions: 400` and an empty `mirror_globs`.
- `lib/parallel/groups.mjs` exports `parseParallelizationSection`. This is a hard dependency on a module owned by the `worktree-parallelization` charter, declared in this charter's Dependencies table.
- Plan artifacts may or may not exist. Roughly 20 legacy plans in this repo predate routing sidecars (`issue-528`); plans missing entirely is a normal input state, not an error.

## Deferred Capabilities

| Capability | Reason | Depends On |
|---|---|---|
| Tolerant qualifier in `lib/parallel/groups.mjs` | Would lift rung-1 coverage from 79/138 to roughly 101/138 by accepting `(foundation, sequential)` and `(independent of A)` alongside the current literal `(independent\|sequential)`. Not taken here: the same change moves those plans from serial fallback into concurrent execution in `/adev:implement --parallel`, a behaviour change in another charter's module that needs evidence those groups are genuinely independent. | `worktree-parallelization` accepting the coverage change |
| A schema for `## Parallelization` owned by `/adev:plan` | The real fix. The section is emitted as prose by a skill and parsed by consumers, so coverage is bounded by how uniformly authors happen to write it. An owned emitter format would make the parser total instead of tolerant. Larger than either consuming charter. | a decision to make `/adev:plan` emit a structured sidecar |

## Behaviors

- **When** the brief is composed **then** the size advisory renders first inside the marker and the reading order renders third, in the fixed five-section order given in Section Placement.
- **When** net additions are below `size_threshold_additions` **then** the size advisory states raw and net additions, deletions, and changed file count, and names no exception class.
- **When** net additions are at or above the threshold **then** the same figures render followed by the three exception classes and a pointer to the review packet's `## What` section, and the verb still exits 0.
- **When** changed paths match a `mirror_globs` entry **then** the net figure excludes them and the advisory names how many paths were excluded and by which glob.
- **When** `manifest.yaml` carries no `pr:` block **then** the defaults apply and the advisory renders identically to an explicit default configuration.
- **When** `parseParallelizationSection` returns groups that all have at least one member **then** the reading order lists groups in the parser's `id` order, members in the parser's order, each group labelled with its `independent` flag.
- **When** the parser returns a group with zero members **then** that plan drops to rung 2 or 4 for all of its tasks and the output names the zero-member group ids and the plan path; no group from that plan renders as a normal-case reading order.
- **When** the parser returns `malformed: true` **then** that plan drops to rung 3 or 4 and the output states the section was present but carried no recognizable group line.
- **When** a plan reaches a degraded rung and the plan has no `## Task Summary` **then** ordering is `git log --reverse` and the output carries both the original rung's annotation and a statement that ordering is chronological, not planned.
- **When** a referenced spec has no plan file, or the plan file is unreadable **then** its commits are ordered by `git log --reverse` and the output names the path and which of the two applied.
- **When** any plan-derived value exceeds 200 characters **then** it renders truncated with a visible `…(truncated)` suffix.
- **When** the range references several specs with plans at different fallback rungs **then** each spec's block is annotated with its own rung; one degraded plan never suppresses another's parsed ordering.
- **When** the verb is invoked twice on an unchanged `(base, head)` pair **then** both advisory sections are byte-identical across invocations.

## Postconditions

- Both sections render inside the same single marker pair; no second marker is introduced.
- No file is created, modified, or deleted, including `manifest.yaml`; the `pr:` block is read-only input that a human adds.
- Exit code is unchanged from `pr-body-composition`: 0 whenever `HEAD` and the base ref resolve, whatever state the plans and manifest are in.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `pr:` block present but `size_threshold_additions` is not a positive integer | Fall back to 400, annotate the size advisory with the rejected value | *(advisory — no code)* |
| `mirror_globs` present but not a list of strings | Treat as empty, annotate that net equals raw and why | *(advisory — no code)* |
| Plan file present but unreadable (permissions, truncation) | Rung 5; name the path and state it was unreadable rather than absent | *(advisory — no code)* |
| `## Parallelization` present but empty | Parser returns `malformed: true` → rung 3, or rung 4 if `## Task Summary` is absent | *(advisory — no code)* |
| Plan path derived from a `Spec:` trailer resolves outside `.context-index/specs/` | The path is never opened; rung 5, naming the trailer value as out of bounds | *(advisory — no code)* |
| A member reference in a group has no matching row in `## Task Summary` | Keep it in the reading order, mark it unmatched; never drop it | *(advisory — no code)* |
| Range is empty | Both sections render their own empty-range line as part of the full five-slot brief `pr-body-composition` defines | *(advisory — no code)* |

Rung 5 now covers both "no plan file" and "plan unreadable", which resolves revision 1's contradiction between this table and the ladder — the two disagreed about which rung an unreadable-but-present plan reached, and rung 5's annotation named a missing path for a path that exists.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Manifest `pr:` block reader | Read `size_threshold_additions` and `mirror_globs` with defaults and per-field validation; never write. | small |
| Size computation | Sum `git diff --numstat`; partition raw vs net by `mirror_globs`; count excluded paths per glob. | small |
| Size advisory renderer | Below-threshold statement, at-or-above escalation with the three exception classes and the packet pointer. | small |
| Parallelization consumption | Call `parseParallelizationSection` from `lib/parallel/groups.mjs`; classify its three return states; apply the zero-member rule. No grammar is authored here. | small |
| Fallback ladder | Five rungs with per-plan rung tracking, the `## Task Summary`-absent transition to rung 4, and a rendered annotation for each rung above 1. | medium |
| Reading order renderer | Groups in parser `id` order, members in parser order, per-spec blocks each carrying their own rung annotation, all values through the shared encoder with the 200-character cap. | medium |
| Section placement wiring | Supply the two slot bodies at positions 1 and 3 to the marker assembly owned by `pr-body-composition`; emit no marker. | small |
| Tests | `node:test` coverage for each ladder rung, threshold boundary, mirror exclusion, malformed manifest fields, per-spec rung independence, and byte-identical determinism. | medium |

## Acceptance Criteria

- [ ] Both sections render inside the existing single marker pair at slots 1 and 3; a test asserts the full five-section order.
- [ ] A PR at exactly `size_threshold_additions` net additions renders the escalated form — the boundary is inclusive and a test pins it.
- [ ] A PR with mirrored paths reports raw and net separately and names the excluded count and glob; a test asserts net < raw.
- [ ] With no `pr:` block, output is byte-identical to output with an explicit `size_threshold_additions: 400` and empty `mirror_globs`.
- [ ] The reading order calls `parseParallelizationSection` from `lib/parallel/groups.mjs`; a test asserts this module defines no `## Parallelization` regex of its own.
- [ ] Each of the five fallback rungs has a test asserting both the ordering used and the presence of its annotation in the output.
- [ ] A plan whose parser output contains a zero-member group drops to rung 2 (or 4) for all of its tasks; a test uses a fixture with `Tasks 14, 15, 16, 17` and asserts no group from that plan renders in normal-case form.
- [ ] A fixture with `Task 7 (refactor -- depends on Tasks 2, 3, 5, 6)` yields exactly one member; a test pins that the plural inside the parenthetical contributes nothing.
- [ ] A plan at a degraded rung with no `## Task Summary` reaches rung 4 and its output carries **both** annotations; a test asserts the original rung's annotation is preserved, not replaced.
- [ ] Two specs at different rungs in one range each carry their own annotation; a test asserts the parsed one is unaffected.
- [ ] A member with no `## Task Summary` row appears in the output marked unmatched; a test asserts it is not dropped.
- [ ] No exception class is ever asserted by the verb; a test asserts the words "mechanical sweep" and "migration" appear only in the class list, never as a claim about the current PR.
- [ ] The review-packet pointer never renders at the start of a line; a test asserts no output line begins with `## ` followed by a packet heading.
- [ ] Every plan-derived value passes through the shared encoder and is capped at 200 characters; a test with a 5,000-character group qualifier asserts truncation with the visible suffix.
- [ ] A plan path resolving outside `.context-index/specs/` is never opened; a test asserts no `fs` call receives it and the plan reaches rung 5.
- [ ] Running the verb twice on an unchanged range produces byte-identical output for both sections.
- [ ] `pr-body-composition.spec.md` section list matches the table in Section Placement; no contradiction remains between the two specs.
- [ ] No Markdown parsing library is added; a test asserts `package.json` dependencies are unchanged.
- [ ] The measured coverage figures in this spec are reproducible; a test or a checked-in script recomputes usable-vs-malformed counts over the plan corpus, so the stated 79/59 cannot silently rot.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.

