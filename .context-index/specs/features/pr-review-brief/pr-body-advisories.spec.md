---
charter: pr-review-brief
kind: behavioral
status: review-blocked
risk_level: medium
milestone:
revision: 3
charter-revision: 5
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

### Config is read from the base ref, never the working tree

The `pr:` block is read via `git show <base>:.context-index/manifest.yaml`, not from the file on disk.

`manifest.yaml` lives inside the very commit range the advisory measures, so reading the working-tree copy puts the threshold under the control of the author whose change is being sized. A PR adding `pr: { size_threshold_additions: 999999 }` would pass every shape validation this spec states — positive integer, list of strings — and simply never escalate. There would be nothing for a reader to notice, because the below-threshold form is a legitimate normal output. Revision 2's Postconditions called the block "read-only input that a human adds"; in a fork PR that human is the author under review.

Reading from `base` puts the knob on the side of the range that already passed review. **This makes configuration a function of `base`,** so the determinism criterion holds over a fixed `(base, head)` pair as stated, but two runs at different bases may legitimately differ in threshold. That is intended and is not a determinism violation.

When `.context-index/manifest.yaml` does not exist at `base` — a new repo, or the file added within the range — the defaults apply and the advisory says so, rather than falling back to the head-side file.

### Resource bounds

The 200-character cap in Output Encoding bounds one value. It does not bound how many values there are, and the harm it names — a brief too large to deliver — is reachable through count rather than length. `TASK_RE` is a global scrape of an unbounded tail, so a single crafted line `- Group A (independent):` followed by `Task 1` repeated 100,000 times yields 100,000 members, each far under the cap.

Four bounds, each with a named degradation, because a silent trim is the failure mode this spec exists to avoid:

| Bound | Limit | On overflow |
|---|---|---|
| Plan file size | 1 MiB, checked with `stat` before reading, and the path must be a regular file | Rung 3, annotated "oversized" or "not a regular file" |
| Groups per plan | 50 | Render the first 50, annotate the count dropped |
| Members per group | 100, applied **after** de-duplication | Render the first 100, annotate the count dropped |
| Total rendered bytes across both sections | 64 KiB | Truncate at the boundary, annotate that the brief was truncated and at which section |

The regular-file check matters independently of size: a committed symlink to a character device is not large, and `stat` on it does not report a size that a ceiling would catch.

**The cap's unit is per rendered value** — one group id, one member, one path, one annotation — not per rendered list. Revision 2 left this undefined, which made the cap unfalsifiable.

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

**A parsed group with zero members drops its plan to rung 2.** Without this rule, consuming the owned parser would inherit the exact silent-omission defect revision 1 was blocked for: a rung-1 outcome, annotation-free, with every task in the group dropped. Naming it here is the point — the defect is in a module this spec does not own, so the only thing this spec can do about it is refuse to present its output as complete.

Conversely, `- Group G (sequential): Task 7 (refactor -- depends on Tasks 2, 3, 5, 6)` yields `members: ["7"]`. The parser's task pattern requires singular `Task` followed by whitespace, so the plural inside the parenthetical does not match and no spurious members are collected. Revision 1 had two rules that disagreed on this case; there is now one rule, it lives in the parser, and this is the outcome.

### Duplicate members

`TASK_RE` is a global scrape of the whole group tail, so a line that names the same task twice yields it twice: `plan-task-events.plan.md` group A parses as `members: ["1","2","3","1"]`. Measured over the corpus, **23 of the 80 usable plans (29%) contain at least one group with duplicate members.**

Members are de-duplicated per group, keeping first occurrence, before rendering. A reading order that tells a reviewer to read task 1, then 2, then 3, then 1 again is wrong on its face, and the duplication is an artifact of the scrape rather than anything the plan author expressed. De-duplication is per group, not across groups: the same task legitimately appearing in two groups is the plan saying something, and that is preserved.

### Fallback ladder

Three rungs. The rung reached is named in the output, per plan.

| Rung | Condition | Ordering used | Rendered annotation |
|---|---|---|---|
| 1 | Parser returns groups and every group has at least one member | Group order, then de-duplicated member order within group | none — the normal case |
| 2 | Any group has zero members, **or** `malformed: true`, **or** the section is absent | `git log --reverse` commit order | names which of the three applied, plus the plan path, and states that ordering is chronological rather than planned |
| 3 | No plan file for a referenced spec, or the plan is unreadable, or the plan exceeds the byte ceiling below | `git log --reverse` commit order | names the path and which of the three applied |

**`## Task Summary` is deliberately not in this ladder.** Revision 2 routed three of its five rungs through that section's table row order. It has no parser anywhere in `lib/` (verified: `grep -rn "Task Summary" lib/` returns nothing), no declared owner, and no entry in the charter's Consumed APIs — it is free prose emitted by `skills/plan/SKILL.md:471`. Depending on it would have required growing a second prose parser inside `lib/cli/pr.mjs`, which is precisely the duplication this spec's central claim forbids and precisely what revision 1 was blocked for. Revision 2 removed one undeclared grammar and silently acquired another.

The cost is real and worth stating plainly: the degraded path now orders by commit chronology rather than by plan task order, which is a worse ordering. It is the ordering available without owning a parser this charter has no business owning. Collapsing five rungs to three is a second gain — every contradiction in revision 2's ladder was a rung-boundary disagreement about `## Task Summary`, and three of its seven blockers were that one defect stated three ways.

Groups keep the parser's `id` order. The parser's `independent` flag is rendered as a per-group label; this spec does not use it to reorder anything, because "independent" describes execution safety, not reading sequence.

### Measured coverage

Against the **139** plan files carrying `## Parallelization`, `parseParallelizationSection` yields usable groups for **80** and `malformed: true` for **59**. Rung 1 therefore covers roughly **58%** of plans today and the rest degrade loudly.

That is a stated coverage figure, not an aspiration, and it is lower than revision 1 claimed for its own grammar. **The gap is not one cause.** Revision 2 asserted it was "almost entirely" the parser's restrictive qualifier and that widening would recover ~22 plans; both claims were wrong, and the second was refuted at review. The measured breakdown of the 59:

| Cause | Plans |
|---|---|
| No `- Group` line at all (free prose) | 28 |
| Bold-wrapped `- **Group A (sequential):**` — fails `^\s*[-*]\s*Group` before the qualifier is read | 19 |
| Qualifier not literally `(independent\|sequential)` | 10 |
| No parenthetical | 2 |

So widening the qualifier recovers **10** plans, not 22 — 17% of the gap, taking coverage from 80/139 to 90/139. Four-fifths of the gap is structural and no qualifier change reaches it. The wrong figure originated in `charter.md`, which stated "sole cause in 10" and "roughly 22" in one sentence; this spec inherited the wrong half. The charter is corrected at revision 5.

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
- `manifest.yaml` at `base` may or may not carry a `pr:` block, and may not exist at `base` at all. Either absence means `size_threshold_additions: 400` and an empty `mirror_globs`, stated in the output.
- `lib/parallel/groups.mjs` exports `parseParallelizationSection`. This is a hard dependency on a module owned by the `worktree-parallelization` charter, declared in this charter's Dependencies table.
- Plan artifacts may or may not exist. Roughly 20 legacy plans in this repo predate routing sidecars (`issue-528`); plans missing entirely is a normal input state, not an error.

## Deferred Capabilities

| Capability | Reason | Depends On |
|---|---|---|
| Tolerant qualifier in `lib/parallel/groups.mjs` | Would lift rung-1 coverage from 80/139 to **90/139** by accepting `(foundation, sequential)` and `(independent of A)` alongside the current literal `(independent\|sequential)` — 10 plans, not the 22 revision 2 claimed. Not taken here: the same change moves those plans from serial fallback into concurrent execution in `/adev:implement --parallel`, a behaviour change in another charter's module that needs evidence those groups are genuinely independent. | `worktree-parallelization` accepting the coverage change |
| Tolerating the bold group form `- **Group A (sequential):**` | 19 of the 59 malformed plans — the single largest recoverable cause, nearly double the qualifier's 10. Same owner and the same concurrent-execution consequence as the row above, so it belongs in the same negotiation rather than being taken piecemeal. | `worktree-parallelization` accepting the coverage change |
| A schema for `## Parallelization` owned by `/adev:plan` | The real fix. The section is emitted as prose by a skill and parsed by consumers, so coverage is bounded by how uniformly authors happen to write it. An owned emitter format would make the parser total instead of tolerant. Larger than either consuming charter. | a decision to make `/adev:plan` emit a structured sidecar |

## Behaviors

- **When** the brief is composed **then** the size advisory renders first inside the marker and the reading order renders third, in the fixed five-section order given in Section Placement.
- **When** net additions are below `size_threshold_additions` **then** the size advisory states raw and net additions, deletions, and changed file count, and names no exception class.
- **When** net additions are at or above the threshold **then** the same figures render followed by the three exception classes and a pointer to the review packet's `## What` section, and the verb still exits 0.
- **When** changed paths match a `mirror_globs` entry **then** the net figure excludes them and the advisory names how many paths were excluded and by which glob.
- **When** `manifest.yaml` carries no `pr:` block **then** the defaults apply and the advisory renders identically to an explicit default configuration.
- **When** `parseParallelizationSection` returns groups that all have at least one member **then** the reading order lists groups in the parser's `id` order, members in the parser's order, each group labelled with its `independent` flag.
- **When** the parser returns a group with duplicate members **then** they are de-duplicated per group keeping first occurrence, and the same task appearing in two different groups is preserved in both.
- **When** the parser returns a group with zero members, **or** `malformed: true`, **or** the section is absent **then** that plan reaches rung 2 for all of its tasks, ordering is `git log --reverse`, and the output names which of the three applied plus the plan path.
- **When** a plan exceeds 1 MiB, is not a regular file, is unreadable, or does not exist **then** that plan reaches rung 3, ordering is `git log --reverse`, and the output names the path and which of the four applied.
- **When** a plan yields more than 50 groups, or a group more than 100 de-duplicated members, or the two sections together exceed 64 KiB **then** the excess is dropped and the output names what was dropped and how much.
- **When** a referenced spec has no plan file, or the plan file is unreadable **then** its commits are ordered by `git log --reverse` and the output names the path and which of the two applied.
- **When** any plan-derived value exceeds 200 characters **then** it renders truncated with a visible `…(truncated)` suffix.
- **When** the range references several specs with plans at different fallback rungs **then** each spec's block is annotated with its own rung; one degraded plan never suppresses another's parsed ordering.
- **When** the verb is invoked twice on an unchanged `(base, head)` pair **then** both advisory sections are byte-identical across invocations.

## Postconditions

- Both sections render inside the same single marker pair; no second marker is introduced.
- No file is created, modified, or deleted, including `manifest.yaml`. The `pr:` block is read-only input, and it is read from `base` rather than the working tree precisely because a human on the head side of the range is not a trustworthy source for it.
- Exit code is unchanged from `pr-body-composition`: 0 whenever `HEAD` and the base ref resolve, whatever state the plans and manifest are in.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `pr:` block present but `size_threshold_additions` is not a positive integer | Fall back to 400, annotate the size advisory with the rejected value | *(advisory — no code)* |
| `mirror_globs` present but not a list of strings | Treat as empty, annotate that net equals raw and why | *(advisory — no code)* |
| Plan file present but unreadable (permissions, truncation) | Rung 3; name the path and state it was unreadable rather than absent | *(advisory — no code)* |
| Plan file exceeds 1 MiB, or is not a regular file | Rung 3; name the path and which of the two applied; the file is not read | *(advisory — no code)* |
| `## Parallelization` present but empty | Parser returns `malformed: true` → rung 2 | *(advisory — no code)* |
| Plan path derived from a `Spec:` trailer resolves outside `.context-index/specs/` | The path is never opened; rung 3, naming the trailer value as out of bounds | *(advisory — no code)* |
| `pr:` block absent at `base`, or `manifest.yaml` absent at `base` | Defaults apply; the advisory states it used defaults and why | *(advisory — no code)* |
| Group, member, or total-byte bound exceeded | Render up to the bound, annotate what was dropped and how much | *(advisory — no code)* |
| Range is empty | Both sections render their own empty-range line as part of the full five-slot brief `pr-body-composition` defines | *(advisory — no code)* |

Rung 3 covers absent, unreadable, oversized, and non-regular-file alike, which resolves the contradiction revision 2 carried between this table and the ladder — they disagreed about which rung an unreadable-but-present plan reached, and the rung's annotation named a missing path for a path that exists.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Manifest `pr:` block reader | Read `size_threshold_additions` and `mirror_globs` with defaults and per-field validation; never write. | small |
| Size computation | Sum `git diff --numstat`; partition raw vs net by `mirror_globs`; count excluded paths per glob. | small |
| Size advisory renderer | Below-threshold statement, at-or-above escalation with the three exception classes and the packet pointer. | small |
| Parallelization consumption | Call `parseParallelizationSection` from `lib/parallel/groups.mjs`; classify its three return states; apply the zero-member rule. No grammar is authored here. | small |
| Fallback ladder | Three rungs with per-plan rung tracking and a rendered annotation for each rung above 1. Consumes no section other than `## Parallelization`. | small |
| Resource bounds | `stat` + regular-file check before reading a plan; per-group member de-duplication; the group, member, and total-byte caps, each rendering a named degradation. | medium |
| Base-ref config reader | Read the `pr:` block via `git show <base>:.context-index/manifest.yaml`; never read the working-tree copy; defaults when absent at `base`. | small |
| Reading order renderer | Groups in parser `id` order, members in parser order, per-spec blocks each carrying their own rung annotation, all values through the shared encoder with the 200-character cap. | medium |
| Section placement wiring | Supply the two slot bodies at positions 1 and 3 to the marker assembly owned by `pr-body-composition`; emit no marker. | small |
| Tests | `node:test` coverage for each ladder rung, threshold boundary, mirror exclusion, malformed manifest fields, per-spec rung independence, and byte-identical determinism. | medium |

## Acceptance Criteria

- [ ] Both sections render inside the existing single marker pair at slots 1 and 3; a test asserts the full five-section order.
- [ ] A PR at exactly `size_threshold_additions` net additions renders the escalated form — the boundary is inclusive and a test pins it.
- [ ] A PR with mirrored paths reports raw and net separately and names the excluded count and glob; a test asserts net < raw.
- [ ] With no `pr:` block, output is byte-identical to output with an explicit `size_threshold_additions: 400` and empty `mirror_globs`.
- [ ] The reading order calls `parseParallelizationSection` from `lib/parallel/groups.mjs`; a test asserts this module defines no `## Parallelization` regex of its own.
- [ ] Each of the three fallback rungs has a test asserting both the ordering used and the presence of its annotation in the output.
- [ ] No output path reads `## Task Summary`; a test asserts the module contains no reference to that heading.
- [ ] A plan whose parser output contains a zero-member group reaches rung 2 for all of its tasks; a test uses a fixture with `Tasks 14, 15, 16, 17` and asserts no group from that plan renders in normal-case form.
- [ ] A fixture with `Task 7 (refactor -- depends on Tasks 2, 3, 5, 6)` yields exactly one member; a test pins that the plural inside the parenthetical contributes nothing.
- [ ] A group parsing as `["1","2","3","1"]` renders as `1, 2, 3`; a test pins per-group de-duplication and asserts a task present in two groups still appears in both.
- [ ] Two specs at different rungs in one range each carry their own annotation; a test asserts the parsed one is unaffected.
- [ ] The `pr:` block is read from `base`, not the working tree; a test with a head-side `size_threshold_additions: 999999` asserts the base-side threshold is used and escalation still fires.
- [ ] A plan over 1 MiB is never read; a test asserts `stat` precedes any read and the plan reaches rung 3 annotated oversized.
- [ ] A plan that is a symlink to a non-regular file reaches rung 3 without being opened.
- [ ] A group line yielding 100,000 members renders at most 100 with a named drop annotation; a test asserts the rendered section stays under the 64 KiB total.
- [ ] No exception class is ever asserted by the verb; a test asserts the words "mechanical sweep" and "migration" appear only in the class list, never as a claim about the current PR.
- [ ] The review-packet pointer never renders at the start of a line; a test asserts no output line begins with `## ` followed by a packet heading.
- [ ] Every plan-derived value passes through the shared encoder and is capped at 200 characters; a test with a 5,000-character group qualifier asserts truncation with the visible suffix.
- [ ] A plan path resolving outside `.context-index/specs/` is never opened; a test asserts no `fs` call receives it and the plan reaches rung 3.
- [ ] Running the verb twice on an unchanged range produces byte-identical output for both sections.
- [ ] `pr-body-composition.spec.md` section list matches the table in Section Placement; no contradiction remains between the two specs.
- [ ] No Markdown parsing library is added; a test asserts `package.json` dependencies are unchanged.
- [ ] The measured coverage figures in this spec are reproducible; a test or a checked-in script recomputes usable-vs-malformed counts over the plan corpus, so the stated 80/59 over 139 plans cannot silently rot.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.

