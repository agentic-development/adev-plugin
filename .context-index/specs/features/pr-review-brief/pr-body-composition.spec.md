---
charter: pr-review-brief
kind: behavioral
status: review-pending
risk_level: medium
milestone:
revision: 6
charter-revision: 5
created: 2026-08-12
updated: 2026-08-13
---

# Live Spec: PR Body Composition

## Behavioral Contract

`adev pr body` composes the generated half of a pull request's reviewer-facing content. Given a commit range, it reads lifecycle artifacts the commits already reference and writes a marker-delimited markdown brief to stdout.

The verb reads only. It never contacts a forge, never mutates lifecycle state, and never blocks: absent or malformed inputs degrade to explicit gaps in the output rather than to silence or to a non-zero exit.

**This spec states properties. Values live in tests.** Revisions 3 through 5 each enumerated another module's error codes, field shapes, and sort semantics in prose, and each enumeration was refuted by probing that module — three times, in the same place. Prose cannot stay correct about another module's internals across changes to that module, and an enumeration is a weaker guarantee than the property it was reaching for. Everything a test can pin now lives in § Test Obligations, and the contract below is written so that no sentence in it can be falsified by reading `lib/`.

### Section ownership

The marker encloses one ordered section list, shared across this charter's specs. This spec owns three of the five slots:

| # | Section | Owning spec |
|---|---------|-------------|
| 1 | Size advisory | `pr-body-advisories` |
| 2 | Attention map — tasks ordered by how much human scrutiny they warrant | this spec |
| 3 | Reading order | `pr-body-advisories` |
| 4 | Traceability — commits grouped by spec | this spec |
| 5 | Verification — what the lifecycle already checked | this spec |

**Marker assembly is owned here.** `lib/cli/pr.mjs` emits the opening marker, requests each slot in order from its owning module, and emits the closing marker. A slot renderer returns body text and never emits a marker.

Assembly also owns the **total rendered size of the brief**, because it is the only component that sees every slot — no slot renderer can observe another's contribution. Renderers report their size; assembly enforces the ceiling and renders the overflow as a named degradation naming which section was truncated. `pr-body-advisories.spec.md` § Resource Bounds relies on this and bounds only its own per-value and per-collection quantities.

## Inputs

Four sources. Each is named with its owner and its access path; none has its shape transcribed here.

| Input | Source | Accessed via |
|---|---|---|
| Task universe | `Spec:` and `Plan-task:` trailers on commits in `base..head` | `git log`, `git diff-tree` |
| Routing entries | `/adev:route` | `lib/plan-routing-sidecar.mjs` — the owned accessor, never a hand-written parser |
| Verification outcome | `/adev:validate` | `currentState()` from `lib/lifecycle-state.mjs` — never the `.validate.md` report |
| Referenced spec revision | the spec file named by a `Spec:` trailer | its YAML frontmatter |

Three of these carry a decision rather than a mechanism, and the decision is the contract:

**The task universe comes from trailers, not from the routing sidecar.** A task is the pair `(spec_path, task_id)` drawn from `Plan-task:` and `Spec:` on the same commit; its file set is the union of paths those commits touch. The sidecar carries no file list, so deriving the universe from it is impossible — and it is the set difference between this universe and the sidecar's entries that makes `UNKNOWN` computable at all.

**Verification comes from the lifecycle projection, not the markdown report.** `skills/validate/SKILL.md` explicitly forbids re-parsing `.validate.md`, and ADR-0012 makes `.md` a human-primary narrative while machine-primary state is read through an accessor. The verdict consumed is the one recorded against the referenced spec's *current* revision; a verdict recorded against an earlier revision is a verdict about different text and renders as explicitly stale, never as current.

**The routing sidecar is keyed to the plan stem, not the spec stem** (ADR-0012 § Permitted peers). The derivation from a `Spec:` trailer is therefore explicit rather than incidental, and the two stems coinciding in this repo today is not something the implementation may rely on.

## Invariants

These hold for every input state. They are what a reviewer can check without running anything, and what the tests exist to enforce.

1. **Exactly one marker pair.** One opening and one closing marker in stdout, in that order, whatever any input contains.
2. **No silent absence.** Every section renders. A section with no data renders an explicit gap line naming what was missing. Absence of data is never presented as absence of risk.
3. **`UNKNOWN` outranks certainty.** A task the routing data does not cover, or covers with a value outside the known agent tiers, renders `UNKNOWN` and sorts above every task known to be low-risk.
4. **Total degradation.** *Any* failure to obtain an input — for any reason, including failure modes this spec does not anticipate and errors the underlying module does not wrap — renders the affected rows `UNKNOWN`, names the cause in the output, and leaves the exit code unchanged. Stated universally and deliberately: three prior revisions tried to enumerate the failure set and were wrong each time, and an enumeration that misses a case converts an advisory path into a non-zero exit.
5. **No value can escape its cell.** No interpolated value — from any source, including ones added later — may alter table structure, introduce a line break, form a markdown link or image, form an HTML comment delimiter, or be interpreted by a shell. The encoder is a single function at the interpolation boundary; every rendered value passes through it.
6. **No path escapes the artifact root.** No filesystem call is made with a path derived from a trailer until that path is confirmed, after canonicalizing both the path and the root, to lie within `.context-index/specs/`. Containment is a precondition of access, not a property of rendering.
7. **Deterministic output.** A fixed resolved `(base, head)` pair with unchanged inputs produces byte-identical output. Every ordering the brief applies is total: where a sort key ties, a further key breaks it, down to one that cannot tie.
8. **Read-only.** No file created, modified, or deleted; no lifecycle event emitted; no network connection; no forge CLI.
9. **Diagnostics off the contract channel.** Diagnostics go to stderr with repo-relative paths. stdout carries the brief and nothing else.

## Test Obligations

The details that revisions 3–5 kept getting wrong in prose. Each is pinned by a test written against the real module, so it is verified rather than asserted, and it lives in exactly one place.

| # | What the test pins | Why it cannot live in prose |
|---|---|---|
| T1 | Every failure mode `lib/plan-routing-sidecar.mjs` can raise, including raw filesystem errors it does not wrap, each degrading per Invariant 4 | Enumerated wrongly in three consecutive revisions; the set belongs to that module |
| T2 | The accessor's actual return shape, asserted against a real call rather than its documentation | A revision transcribed the docblock instead of the return value and was wrong |
| T3 | The accessor's actual entry ordering, and the tie-break that makes the brief's ordering total on top of it | "Ascending" was refuted; the real comparator is the module's choice and may change |
| T4 | The exact character set and transformation order the encoder applies to satisfy Invariant 5, with a case per prohibited outcome | Rule ordering drifted every revision; the property is stable, the mechanism is not |
| T5 | That a path outside the artifact root never reaches a filesystem call, asserted by instrumenting the call | Output inspection cannot prove a call did not happen |
| T6 | The projection field path carrying a validate verdict at a given revision, and the behaviour when none exists at the current revision | Projection shape belongs to `lib/lifecycle-state.mjs` |
| T7 | That no output line begins with a review-packet H2 heading, per `review-packet-template.spec.md` AC-6 | The interlock is defined by the sibling artifact, not by this prose |

A test obligation is not a lesser requirement. Everything listed here must be pinned before this spec is validated, and a change in a consumed module that breaks one of these surfaces as a failing test rather than as prose that quietly went stale.

## System Constitution Reference

- **Principle 1: minimize external dependencies** — composition needs `git` output and files already on disk. No git library, no markdown library, no forge SDK.
- **Pure ESM** — applies to the new `lib/cli/pr.mjs`.
- **Anti-pattern: no inline Node in SKILL.md** — all logic lands in `lib/cli/pr.mjs`; skill prose names `adev pr body` and nothing more.
- **Boundary (Autonomous): refactoring within a module's boundaries** — this adds a verb to the existing `cli-driver-surface` substrate and changes no hook protocol, plugin registration, or trailer contract.

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|-----------|
| Trailer reader | Read `Spec:` and `Plan-task:` for a range; values consumed as data, never reaching a shell. | medium |
| Path containment | The guard satisfying Invariant 6, applied before any filesystem access. | small |
| Task universe builder | The `(spec_path, task_id)` set and each task's file set. | medium |
| Output encoder | The single interpolation-boundary function satisfying Invariant 5. Value transformation only — containment (Invariant 6) and diagnostics (Invariant 9) are separate concerns and do not belong in it. | medium |
| Routing reader | Consume the owned accessor; map every failure to the Invariant 4 degradation. | small |
| Verification reader | Read the projection at the referenced spec's current revision; render staleness explicitly. | small |
| Ranking | Order by agent tier, then descending blast radius, then a tie-break that makes the order total. | medium |
| Marker assembly | Emit the pair, request the five slots in order, and enforce the total-size ceiling across all slots per § Section ownership. | medium |
| Slot renderers | This spec's three sections, each a heading plus a table with its gap line. | medium |
| CLI registration | Register `pr body` per the `cli-driver-surface` pattern. | small |
| Tests | Every invariant, plus every row of § Test Obligations. | large |

## Visual Expectations

The rendered markdown is the user-visible surface, so its shape is contractual. Section order inside the marker is fixed by § Section ownership. Each section is a heading plus a table. A section with no data renders its gap line rather than vanishing, so a reviewer can distinguish "nothing to report" from "this did not run".

## Preconditions

- The working directory is inside a git repository with a resolvable `HEAD`.
- `--base` resolves via `git rev-parse`; omitted, it defaults to the merge base with the default branch. `--head` defaults to `HEAD`. Determinism is specified over the resolved pair, so both must be nameable.
- `.context-index/` and `manifest.yaml` are optional. Their absence yields a brief of gap lines and exit 0.
- Routing sidecars and validate outcomes may or may not exist. Absence is a normal input state.

## Behaviors

Each behavior is an instance of an invariant, not a restatement of one. Where a behavior and an invariant appear to disagree, the invariant governs.

- **When** invoked with a resolvable range **then** a brief is written to stdout enclosed by exactly one marker pair, containing this spec's three sections in their fixed relative order, exit 0.
- **When** commits carry `Spec:` trailers **then** each spec becomes one traceability row aggregating commit count, plan-task coverage, and diff stat.
- **When** commits carry no `Spec:` trailer **then** they collect into an explicitly labelled untraced bucket and the section is annotated as a gap.
- **When** routing data covers a task **then** it populates the attention map, ordered by agent tier and descending blast radius.
- **When** routing data does not cover a task, or covers it with an unrecognized tier **then** that task renders `UNKNOWN` above all known-low-risk rows.
- **When** the projection carries a verdict at the referenced spec's current revision **then** the verification section reports it, one row per referenced spec, with no merged verdict across specs.
- **When** a verdict exists only at an earlier revision **then** it renders as stale, naming both revisions.
- **When** the range is empty **then** all five slots render, each with its empty-range line, exit 0.

## Postconditions

- stdout contains exactly one opening and one closing marker.
- No file under `.context-index/` is created, modified, or deleted; no lifecycle event emitted.
- No network connection opened; no forge CLI executed.
- Exit code is 0 whenever `HEAD` and the base ref resolve, regardless of which optional inputs were missing.

## Error Cases

Only conditions that change the exit code are enumerated. Everything else is Invariant 4, which covers the rest by construction rather than by list — that is the point of stating it universally.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Not inside a git repository | Diagnostic to stderr naming the working directory; no partial brief | `NOT_A_GIT_REPO` |
| `--base` does not resolve | Diagnostic naming the unresolvable ref; no partial brief | `INVALID_BASE_REF` |
| `--base` omitted and no merge base determinable | Diagnostic suggesting an explicit `--base`; no partial brief | `NO_MERGE_BASE` |

## Acceptance Criteria

- [ ] Each of the nine invariants has at least one test asserting it, named so the mapping is legible.
- [ ] Each row of § Test Obligations has a test pinning it against the real module.
- [ ] Invariant 4 is tested by injecting a failure this spec does not name — including a raw filesystem error the accessor does not wrap — asserting `UNKNOWN`, a named cause, and an unchanged exit code.
- [ ] Invariant 5 is tested once per prohibited outcome: broken table structure, injected line break, rendered link, rendered image, forged marker, shell interpretation.
- [ ] Invariant 6 is tested by instrumenting the filesystem call, not by inspecting output.
- [ ] Invariant 7 is tested by running twice on an unchanged pair and diffing bytes, and by a case where the primary sort keys tie.
- [ ] The total-size ceiling is enforced in marker assembly, not in a slot renderer; a test asserts a renderer over-contributing is truncated by assembly with the section named.
- [ ] No routing parser is written; a test asserts the module contains no `routing.json` traversal of its own.
- [ ] No `.validate.md` file is opened; a test asserts it.
- [ ] No `gh`, `glab`, or network call on any path; a test asserts no HTTP client is imported.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.
