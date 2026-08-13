---
charter: pr-review-brief
kind: behavioral
status: review-pending
risk_level: medium
milestone:
revision: 3
charter-revision: 3
created: 2026-08-12
updated: 2026-08-13
---

# Live Spec: PR Body Composition

## Behavioral Contract

`adev pr body` composes the generated half of a pull request's reviewer-facing content. Given a commit range, it reads the lifecycle artifacts those commits already reference — `Spec:` / `Plan-task:` trailers, the `<spec>.routing.json` sidecars produced by `/adev:route`, and the `validate` step of the lifecycle projection — and writes a marker-delimited markdown brief to stdout.

The verb reads only. It never contacts a forge, never mutates lifecycle state, and never blocks: absent or malformed inputs degrade to explicit gaps in the output rather than to silence or to a non-zero exit.

### Section ownership

The marker encloses one ordered section list, shared across the specs in this charter. This spec owns three of its five slots:

| # | Section | Owning spec |
|---|---------|-------------|
| 1 | Size advisory | `pr-body-advisories` |
| 2 | Attention map — tasks ordered by how much human scrutiny they warrant | this spec |
| 3 | Reading order | `pr-body-advisories` |
| 4 | Traceability — commits grouped by spec | this spec |
| 5 | Verification — what the lifecycle already checked | this spec |

Revision 1 of this spec fixed the section set at the three it owns, before the should-have capabilities were specified. Revision 2 replaced that with the list above so the two specs cannot contradict each other on the marker's contents. The sections this spec owns keep their relative order, and every invariant below — single marker pair, no interleaving, determinism, loud degradation — applies to all five slots regardless of owner.

**Marker assembly is owned here.** `lib/cli/pr.mjs` emits the opening marker, requests each of the five slots in order from whichever module owns it, and emits the closing marker. A slot renderer returns section body text and never emits a marker itself. This is stated because revision 2 split slot ownership across two specs without saying who wraps the result, leaving both renderers plausibly responsible for a pair that must appear exactly once.

## Input Contracts

Three inputs, each with a named source, a typed shape, and a degradation path. Revision 2 named all three only in prose, which left the two most important ones underdetermined.

### Task universe and file sets

The authoritative enumeration of tasks in a PR range is the set of distinct `Plan-task:` trailer values on commits in `base..head`, paired with the `Spec:` trailer on the same commit. A task is identified by the pair `(spec_path, task_id)`; the same `task_id` under two specs is two tasks.

A task's file set is the union of paths touched by the commits carrying that `(spec_path, task_id)` pair, from `git diff-tree --no-commit-id --name-only -r <sha>`.

This matters because revision 2 said a task "appears in the changed files", presupposing a task→file mapping that no input provides — `routing.json` entries carry no `files[]`. Deriving the mapping from trailers rather than from the sidecar is what makes the `UNKNOWN` invariant implementable: the task universe comes from git, the routing entries come from the sidecar, and `UNKNOWN` is the set difference. A commit with a `Spec:` trailer and no `Plan-task:` trailer contributes to traceability but adds no task.

### Routing entries

Read `<spec-stem>.routing.json` for each referenced spec. Per entry: `task_id`, `selected_agent`, `scores.blast_radius`, `scores.novelty`, `rationale`. `blast_radius` is nested under `scores` and normalized `0..1` — revision 2 wrote it as a top-level field, which does not exist on disk.

### Verification

**Not the `.validate.md` report.** Read `state.steps.validate` from `currentState(projectRoot, specPath)` in `lib/lifecycle-state.mjs`. Revision 2 specified parsing the markdown report; `skills/validate/SKILL.md:405` states *"Do NOT re-read or re-parse any prior `<spec-slug>.validate.md` file"*, and ADR-0012 makes `.md` a human-primary narrative sidecar while machine-primary state is read through an accessor. The projection is the typed source the producer designates.

Consumed shape, per referenced spec:

| Field | Source | Rendered as |
|---|---|---|
| `steps.validate.status` | projection | whether validation ran at all |
| `steps.validate.byRevision[N].verdict` | projection, `N` = the spec's current `revision:` | `PASS` / `PASS_WITH_NOTES` / `FAIL` |
| `steps.validate.byRevision[N].reports[]` | projection | one row per validator: id and verdict |
| `steps.validate.byRevision[N].blockers[]` | projection | count, listed when non-empty |

Reading `byRevision` at the spec's *current* revision is deliberate: a verdict recorded against an older revision is a verdict about different text. When the projection has no entry at the current revision but does at an earlier one, the section says so and names both revisions rather than presenting the stale verdict as current — the same rule as `UNKNOWN`, applied to time instead of absence.

## Output Encoding Contract

One encoding routine applies to **every** value interpolated into generated output, whatever its source — trailer, rationale, spec path, validator id, diagnostic text, or any value a slot renderer owned by another spec passes in. Revision 2 scoped escaping to `Spec:` trailers and enumerated `]`, `,`, newline, and backtick, which covered neither the delimiter that actually breaks the output nor the values most likely to carry it.

The threat is concrete: any commit author controls trailer values, `/adev:route` rationale is free text, and the result is posted by `cicd` into a public PR body that a human reads to decide how carefully to review.

1. **Path containment.** Every path derived from a `Spec:` trailer is resolved with `path.resolve` and required to remain under the canonicalized `.context-index/specs/` root before any `fs.stat` or `fs.readFile`. A path that escapes is treated exactly as "does not exist on disk" — the error case already defined — and is never opened. Without this, `Spec: ../../.env` reaches the filesystem and the "offending path" diagnostic reports whether it exists. CWE-22.
2. **Table-cell safety.** Every interpolated value has `|` escaped and any leading `#`, `-`, `>`, or `|` neutralized before entering a table cell. Every generated section renders as a table, so an unescaped pipe does not merely look wrong — it shifts subsequent cells, and a reviewer reads a risk score from the wrong column. This applies to `rationale`: revision 2 said "reproduced verbatim", which now means *reproduced without semantic interpretation*, not *reproduced without encoding*. CWE-116.
3. **Marker neutralization.** Any occurrence of `<!--` or `-->` in an interpolated value is encoded so it cannot form a comment delimiter. The single-marker-pair invariant, and with it the authorship boundary this module exists to enforce, rests entirely on those two literals appearing nowhere but the real boundaries. A rationale containing the literal `<!-- /adev:pr-brief -->` would otherwise let `cicd`'s boundary-based replace treat attacker-controlled text as author-written.
4. **Diagnostics.** All diagnostics go to **stderr**, never stdout, and render paths relative to the repository root. An absolute path leaks the CI runner's home directory and username into whatever consumes the output.

Encoding is applied once, at the interpolation boundary, by a single function. Two independently-worded escaping rules in two specs is how a gap reappears.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins (`fs`, `path`, `child_process`, `crypto`, `node:test`)." — Applies because composition needs only `git log` output and files already on disk. No git library, no markdown library, no forge SDK.
- **Principle:** "Pure ESM — all `.mjs` files, `"type": "module"`. No CommonJS." — Applies to the new `lib/cli/pr.mjs` helper module.
- **Anti-pattern:** "No `Run inline Node.js:` step directives, `node -e` invocations inside `skills/*/SKILL.md`. Skills name a CLI subcommand (`adev <verb> …`)." — Applies because all composition logic lands in `lib/cli/pr.mjs`; any skill prose that references this capability names `adev pr body` and nothing more.
- **Boundary (Autonomous):** "Adding tests; refactoring within a module's boundaries." — Applies because this spec adds a verb inside the existing `cli-driver-surface` substrate and changes no hook protocol, no plugin registration, and no provenance trailer contract.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Trailer reader | Read `Spec:` and `Plan-task:` trailers for a commit range via `git log --format`, consuming values as data (never interpolated into a shell or `node -e` context). | medium |
| Task universe builder | Build the `(spec_path, task_id)` set from `Plan-task:` trailers and each task's file set from `git diff-tree --name-only` over its commits, per Input Contracts. | medium |
| Output encoder | The single interpolation-boundary function implementing the four rules in Output Encoding Contract: path containment, table-cell safety, marker neutralization, stderr diagnostics. | medium |
| Traceability grouping | Group commits by `Spec:` value; aggregate per-spec commit count and diff stat; collect commits carrying no `Spec:` trailer into an explicit untraced bucket. | medium |
| Routing sidecar reader | Locate `<spec-stem>.routing.json` for each referenced spec; read `entries[]` per Input Contracts; tolerate absence. | small |
| Attention map ranking | Order entries by `selected_agent` (`human-only`, then `assisted-agent`, then `auto-agent`), then by **descending** `scores.blast_radius`; carry `rationale` through the output encoder. | medium |
| Verification summary reader | Read `state.steps.validate` from the lifecycle projection for each referenced spec at that spec's current revision; extract verdict, per-validator reports, and blockers. Never parse `.validate.md`. | small |
| Marker assembly | Emit the opening marker, request the five slots in fixed order from their owning modules, emit the closing marker. Slot renderers return body text and never emit a marker. | medium |
| Markdown renderer | Render this spec's three owned slots — attention map, traceability, verification — deterministically, each as a heading plus a table. | medium |
| CLI verb registration | Register `pr` with the `body` subverb in the `cli/index.mjs` dispatch table per the `cli-driver-surface` pattern. | small |
| Tests | `node:test` coverage for grouping, ranking order and direction, `UNKNOWN` rendering, stale-revision verification, each encoding rule, determinism, and each error case. | medium |

## Visual Expectations

Not a UI feature; the rendered markdown is the user-visible surface, so its shape is contractual.

Section order inside the marker is fixed and given in Section ownership above; the three slots this spec owns render in the relative order attention map → traceability → verification, because the attention map is what a reviewer needs before reading any diff. Each section renders as a heading plus a table. When a section has no data, it renders with an explicit gap line (for example, `_No routing data — see the UNKNOWN rows above._`) rather than being omitted, so a reviewer can distinguish "nothing to report" from "this section did not run."

The opening marker `<!-- adev:pr-brief -->` and closing marker `<!-- /adev:pr-brief -->` enclose all generated output and appear nowhere else.

## Acceptance Criteria

- [ ] `adev pr body --base <ref>` writes a marker-enclosed brief to stdout and exits 0.
- [ ] Every commit in `base..head` appears in exactly one traceability row or in the untraced bucket; a test asserts the counts sum to the total commit count.
- [ ] The task universe is built from `Plan-task:` trailers and file sets from `git diff-tree`; a test asserts a task with no routing entry renders `UNKNOWN`, and that two specs sharing a `task_id` produce two distinct tasks.
- [ ] `UNKNOWN` rows sort above all `auto-agent` rows.
- [ ] Attention rows sort by `selected_agent` then by **descending** `scores.blast_radius`; a test asserts the highest blast radius appears first within an agent tier.
- [ ] Verification reads `state.steps.validate` from the lifecycle projection; a test asserts no code path opens a `.validate.md` file.
- [ ] A spec whose projection carries a verdict only at an earlier revision renders the stale-verdict line naming both revisions, never the stale verdict as current.
- [ ] Running the verb twice on an unchanged `(base, head)` pair produces byte-identical output.
- [ ] With no `routing.json` present anywhere, the verb still exits 0 and the attention map renders its explicit gap line.
- [ ] With no `validate` step in the projection, the verb still exits 0 and the verification section renders its explicit gap line.
- [ ] A `Spec:` trailer of `../../.env` is never opened; a test asserts no `fs` call receives a path outside `.context-index/specs/` and that the row renders as a missing path.
- [ ] A `rationale` or trailer containing `|` renders with the pipe escaped and does not shift any table cell; a test asserts the rendered row has the expected column count.
- [ ] A `rationale` or trailer containing the literal `<!-- /adev:pr-brief -->` renders neutralized; a test asserts stdout contains exactly one occurrence of each marker literal.
- [ ] Diagnostics are written to stderr with repo-relative paths; a test asserts stdout contains no diagnostic text and no absolute path.
- [ ] No slot renderer emits a marker; a test asserts marker emission occurs in exactly one place.
- [ ] No output path emits any of the four review-packet H2 headings as a heading line, mirroring `review-packet-template.spec.md` AC-6 from the side that can violate it.
- [ ] No output path invokes `gh`, `glab`, or any network call; a test asserts the module imports no HTTP client.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.

## Preconditions

- The working directory is inside a git repository with a resolvable `HEAD`.
- The `--base` ref, when supplied, resolves via `git rev-parse`. When omitted, it defaults to the merge base of `HEAD` with the repository's default branch, determined from `git symbolic-ref refs/remotes/origin/HEAD` and falling back to `git config init.defaultBranch`. When neither resolves, `NO_MERGE_BASE`.
- `--head` defaults to `HEAD` and may be supplied explicitly. Determinism is specified over the resolved `(base, head)` pair, so the pair must be nameable; revision 2 promised determinism over a pair whose second element had no argument.
- `.context-index/` and `manifest.yaml` are **optional**. Trailer names are the fixed set `Spec:` and `Plan-task:`; the manifest is read only if present and only to confirm them. An adev-less checkout produces a brief whose sections are all gap lines and still exits 0, which is consistent with the exit-code postcondition rather than contradicting it as revision 2 did.
- Routing sidecars and the `validate` step of the projection may or may not exist; their absence is a normal input state, not an error.

## Behaviors

- **When** `adev pr body` is invoked with a resolvable `--base` ref **then** it writes a brief to stdout enclosed by `<!-- adev:pr-brief -->` and `<!-- /adev:pr-brief -->`, containing the attention map, traceability, and verification sections in that relative order within the marker's section list, and exits 0.
- **When** commits in the range carry `Spec:` trailers **then** each spec becomes one traceability row aggregating its commit count, plan-task coverage, and diff stat.
- **When** one or more commits in the range carry no `Spec:` trailer **then** they are collected into an explicitly labelled untraced bucket showing the count and short SHAs, and the section is annotated as a gap.
- **When** a referenced spec has a `<spec-stem>.routing.json` sidecar **then** its entries populate the attention map, ordered `human-only` → `assisted-agent` → `auto-agent`, then by **descending** `scores.blast_radius`, with each entry's `rationale` passed through the output encoder.
- **When** a `(spec_path, task_id)` pair from the `Plan-task:` trailers has no corresponding routing entry **then** it renders with route `UNKNOWN` and sorts above all `auto-agent` rows.
- **When** no routing sidecar exists for any referenced spec **then** the attention map renders its explicit gap line naming the missing sidecars, and the verb still exits 0.
- **When** the lifecycle projection carries a `validate` step for a referenced spec at that spec's current revision **then** the verification section reports its verdict, per-validator reports, and blocker count for that spec.
- **When** the projection carries a `validate` verdict only at an earlier revision **then** the section names both the verdict's revision and the spec's current revision and marks it stale, rather than presenting it as current.
- **When** the range references several specs **then** the verification section renders one row per spec and no merged verdict.
- **When** any interpolated value contains `|`, a leading block character, `<!--`, `-->`, or shell metacharacters **then** it is encoded per the Output Encoding Contract, is never passed to a shell or evaluated, and cannot alter table structure or marker boundaries.
- **When** a `Spec:` trailer resolves outside `.context-index/specs/` **then** no filesystem call is made with that path and the traceability row flags it as missing.
- **When** the verb is invoked twice with the same resolved `(base, head)` pair and unchanged inputs **then** both invocations produce byte-identical output.

## Postconditions

- Standard output contains exactly one opening and one closing marker.
- No file under `.context-index/` is created, modified, or deleted; no lifecycle event is emitted.
- No network connection is opened and no forge CLI is executed.
- Exit code is 0 whenever `HEAD` and the base ref resolve, regardless of which optional inputs were missing.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Not inside a git repository | Print a diagnostic naming the working directory; emit no partial brief | `NOT_A_GIT_REPO` |
| `--base` ref does not resolve | Print a diagnostic naming the unresolvable ref; emit no partial brief | `INVALID_BASE_REF` |
| `--base` omitted and no default branch merge base can be determined | Print a diagnostic suggesting an explicit `--base`; emit no partial brief | `NO_MERGE_BASE` |
| `routing.json` present but unparseable | Render affected tasks as `UNKNOWN`, annotate the section with the offending path, exit 0 | *(advisory — no code)* |
| Lifecycle projection unreadable or carries no `validate` step | Render the verification gap line stating validation has not run for that spec, exit 0 | *(advisory — no code)* |
| Referenced spec path in a `Spec:` trailer does not exist on disk | Keep the traceability row, flag the path as missing, exit 0 | *(advisory — no code)* |
| `Spec:` trailer resolves outside `.context-index/specs/` | Treated identically to "does not exist on disk"; the path is never opened | *(advisory — no code)* |
| `.context-index/` or `manifest.yaml` absent | Every section renders its gap line; exit 0 | *(advisory — no code)* |
| Commit range is empty (`base` equals `head`) | Emit a marker-enclosed brief containing **all five slots**, each rendering its own empty-range line, exit 0 | *(advisory — no code)* |

The empty-range row is stated as all five slots because revision 2's "a brief stating the range is empty" read as replacing the section list, while the sibling spec assumed the sections still render. Keeping the shape constant also keeps the determinism criterion meaningful across an empty range.
