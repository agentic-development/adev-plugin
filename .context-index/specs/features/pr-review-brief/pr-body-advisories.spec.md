---
charter: pr-review-brief
kind: behavioral
status: review-blocked
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-08-12
updated: 2026-08-12
---

# Live Spec: PR Body Advisories

## Behavioral Contract

Two further sections of the brief `adev pr body` writes, covering the charter's should-have capabilities: a **size advisory** that states how large the PR is against a budget and names the exception classes that legitimise going over it, and a **reading order** that turns the plan's `## Parallelization` groups into a suggested sequence for reading a multi-commit diff.

Both are advisory in the strict sense the charter's Availability attribute requires: they change what the brief says, never whether it is produced, and never whether a merge proceeds. Both share the determinism, escaping, and loud-degradation invariants already established by `pr-body-composition.spec.md`; this spec adds sections to that artifact rather than producing a second one.

The distinguishing risk here is not correctness but **credulous parsing**. The reading order's input is `## Parallelization`, a section emitted as free prose by `skills/plan/SKILL.md:458` with no schema behind it. A parser that guesses at malformed input produces a confidently wrong reading order, which is worse than none — so the contract below fixes a narrow grammar and degrades to a cruder ordering the moment input falls outside it, saying so in the output.

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

`pr-body-composition.spec.md` is revised from revision 1 to revision 2 in the same change to carry this five-slot list, because its revision 1 text fixes the section set at three. It is still `review-pending` and has not been reviewed, so the correction lands in place — no `--amend` artifact, which the specify skill reserves for shipped specs.

## System Constitution Reference

- **Non-Negotiable Principle 1: "Minimize external dependencies."** — Applies sharply here: the obvious way to read `## Parallelization` is a Markdown AST library. The contract below is written against line-oriented matching precisely so `git`, `fs`, and `node:test` remain sufficient.
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

## Reading Order: Input Grammar and Fallback Ladder

The reading order reads `<spec-stem>.plan.md` for each spec referenced by a `Spec:` trailer in the range. Within that file it matches only the lines of the `## Parallelization` section, against exactly one shape:

```
- Group <LETTER> (<qualifier>): <remainder>
```

- `<LETTER>` is a single `A`–`Z`.
- `<qualifier>` is any run of characters containing no `)`. It is **opaque**: reproduced verbatim as the group's label and never interpreted. `sequential`, `foundation, sequential`, `independent of A`, and `depends on Tasks 3-6` are all just strings. The verb does not attempt to resolve inter-group dependencies from prose.
- Task numbers are the `Task <N>` occurrences in `<remainder>`, in the order they appear. Parenthetical descriptions after a task (`Task 1 (write failing coverage test)`) and trailing em-dash notes are ignored.

Groups render in the letter order the plan lists them. Tasks render in listed order within a group.

Anything else falls down this ladder, and the rung reached is named in the output:

| Rung | Condition | Ordering used | Rendered annotation |
|---|---|---|---|
| 1 | `## Parallelization` present and every one of its `- Group` lines matches the grammar | Group order, then task order within group | none — the normal case |
| 2 | Section present but one or more `- Group` lines do not match | `## Task Summary` table row order | names the offending line verbatim and the plan path |
| 3 | Plan file present, `## Parallelization` absent | `## Task Summary` table row order | states the plan carries no parallelization section |
| 4 | Plan file present, neither section parseable | `git log --reverse` commit order | states that ordering is chronological, not planned |
| 5 | No plan file for a referenced spec | `git log --reverse` commit order | names the missing plan path |

Partial matching is not permitted: within one plan, a single non-conforming `- Group` line drops that plan to rung 2 whole. A mix of parsed and unparsed groups would render as a complete reading order while silently omitting tasks, which is the failure mode this ladder exists to prevent.

## Size Advisory: Computation and Exception Classes

Size is `git diff --numstat base..head`, summed. Two figures are reported: **raw** (every changed path) and **net** (excluding paths matching any `mirror_globs` entry). Net is compared against the threshold; raw is shown alongside so the exclusion is visible rather than silently applied.

Below the threshold the section is a single statement of the figures. At or above it, the statement is followed by the exception classes — named, defined, and left for the author to claim:

- **Mechanical sweep** — one transformation applied uniformly across many files.
- **Generated mirror** — output regenerated from a source that is itself under review.
- **Migration** — a move or rename whose size is displacement, not new logic.

The verb **asserts none of these**. Only generated mirror has deterministic evidence (`mirror_globs`), and that is already reflected in the net figure; the other two are author claims. The advisory therefore points at `## What` in `.github/pull_request_template.md` (`review-packet-template.spec.md`) as the place to make the claim. A generator that guessed at "mechanical sweep" from diff shape would launder a heuristic into an excuse, which defeats the point of asking.

## Preconditions

- Everything `pr-body-composition.spec.md` requires; this spec adds no new precondition on git state.
- `manifest.yaml` may or may not carry a `pr:` block. Absence means `size_threshold_additions: 400` and an empty `mirror_globs`.
- Plan artifacts may or may not exist. Roughly 20 legacy plans in this repo predate routing sidecars (`issue-528`); plans missing entirely is a normal input state, not an error.

## Behaviors

- **When** the brief is composed **then** the size advisory renders first inside the marker and the reading order renders third, in the fixed five-section order given in Section Placement.
- **When** net additions are below `size_threshold_additions` **then** the size advisory states raw and net additions, deletions, and changed file count, and names no exception class.
- **When** net additions are at or above the threshold **then** the same figures render followed by the three exception classes and a pointer to the review packet's `## What` section, and the verb still exits 0.
- **When** changed paths match a `mirror_globs` entry **then** the net figure excludes them and the advisory names how many paths were excluded and by which glob.
- **When** `manifest.yaml` carries no `pr:` block **then** the defaults apply and the advisory renders identically to an explicit default configuration.
- **When** every `- Group` line in a plan's `## Parallelization` matches the grammar **then** the reading order lists groups in letter order with each group's qualifier reproduced verbatim as its label.
- **When** a plan's `## Parallelization` contains a `- Group` line outside the grammar **then** that plan falls to `## Task Summary` order for all of its tasks, and the output names the offending line verbatim and the plan path.
- **When** a referenced spec has no plan file **then** its commits are ordered by `git log --reverse` and the output names the missing plan path.
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
| Plan file present but unreadable (permissions, truncation) | Rung 5; name the path and the reason | *(advisory — no code)* |
| `## Parallelization` present but empty | Rung 3; state the section is present and empty | *(advisory — no code)* |
| A `Task <N>` reference in a group has no matching row in `## Task Summary` | Keep it in the reading order, mark it unmatched; never drop it | *(advisory — no code)* |
| Range is empty | Both sections render as the empty-range statement `pr-body-composition` already defines | *(advisory — no code)* |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Manifest `pr:` block reader | Read `size_threshold_additions` and `mirror_globs` with defaults and per-field validation; never write. | small |
| Size computation | Sum `git diff --numstat`; partition raw vs net by `mirror_globs`; count excluded paths per glob. | small |
| Size advisory renderer | Below-threshold statement, at-or-above escalation with the three exception classes and the packet pointer. | small |
| Parallelization parser | Line-oriented match of the fixed grammar; opaque qualifier; ordered `Task <N>` extraction; all-or-nothing per plan. | medium |
| Fallback ladder | Five rungs with per-plan rung tracking and a rendered annotation for each rung above 1. | medium |
| Reading order renderer | Groups in letter order, tasks in listed order, per-spec blocks each carrying their own rung annotation. | medium |
| Section placement wiring | Insert the two sections at slots 1 and 3 of the marker's five-section order. | small |
| `pr-body-composition` revision 2 | Replace the three-section wording with the five-slot list; bump `revision:` and `updated:`. | small |
| Tests | `node:test` coverage for each ladder rung, threshold boundary, mirror exclusion, malformed manifest fields, per-spec rung independence, and byte-identical determinism. | medium |

## Acceptance Criteria

- [ ] Both sections render inside the existing single marker pair at slots 1 and 3; a test asserts the full five-section order.
- [ ] A PR at exactly `size_threshold_additions` net additions renders the escalated form — the boundary is inclusive and a test pins it.
- [ ] A PR with mirrored paths reports raw and net separately and names the excluded count and glob; a test asserts net < raw.
- [ ] With no `pr:` block, output is byte-identical to output with an explicit `size_threshold_additions: 400` and empty `mirror_globs`.
- [ ] Each of the five fallback rungs has a test asserting both the ordering used and the presence of its annotation in the output.
- [ ] A plan with one malformed `- Group` line drops to rung 2 for all of its tasks; a test asserts no group from that plan is rendered in parsed form.
- [ ] Two specs at different rungs in one range each carry their own annotation; a test asserts the parsed one is unaffected.
- [ ] A `Task <N>` with no `## Task Summary` row appears in the output marked unmatched; a test asserts it is not dropped.
- [ ] No exception class is ever asserted by the verb; a test asserts the words "mechanical sweep" and "migration" appear only in the class list, never as a claim about the current PR.
- [ ] Running the verb twice on an unchanged range produces byte-identical output for both sections.
- [ ] `pr-body-composition.spec.md` is at `revision: 2` and its section list matches the table in Section Placement; no contradiction remains between the two specs.
- [ ] No Markdown parsing library is added; a test asserts `package.json` dependencies are unchanged.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.

