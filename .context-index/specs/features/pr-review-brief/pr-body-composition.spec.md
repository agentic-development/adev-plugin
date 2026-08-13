---
charter: pr-review-brief
kind: behavioral
status: review-pending
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-08-12
updated: 2026-08-12
---

# Live Spec: PR Body Composition

## Behavioral Contract

`adev pr body` composes the generated half of a pull request's reviewer-facing content. Given a commit range, it reads the lifecycle artifacts those commits already reference — `Spec:` / `Plan-task:` trailers, the `<spec>.routing.json` sidecars produced by `/adev:route`, and the `/adev:validate` report — and writes a marker-delimited markdown brief to stdout.

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

Revision 1 of this spec fixed the section set at the three it owns, before the should-have capabilities were specified. Revision 2 replaces that with the list above so the two specs cannot contradict each other on the marker's contents. Nothing else in this spec changes: the sections this spec owns keep their relative order, and every invariant below — single marker pair, no interleaving, determinism, loud degradation — applies to all five slots regardless of owner.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins (`fs`, `path`, `child_process`, `crypto`, `node:test`)." — Applies because composition needs only `git log` output and files already on disk. No git library, no markdown library, no forge SDK.
- **Principle:** "Pure ESM — all `.mjs` files, `"type": "module"`. No CommonJS." — Applies to the new `lib/cli/pr.mjs` helper module.
- **Anti-pattern:** "No `Run inline Node.js:` step directives, `node -e` invocations inside `skills/*/SKILL.md`. Skills name a CLI subcommand (`adev <verb> …`)." — Applies because all composition logic lands in `lib/cli/pr.mjs`; any skill prose that references this capability names `adev pr body` and nothing more.
- **Boundary (Autonomous):** "Adding tests; refactoring within a module's boundaries." — Applies because this spec adds a verb inside the existing `cli-driver-surface` substrate and changes no hook protocol, no plugin registration, and no provenance trailer contract.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Trailer reader | Read `Spec:`, `Plan-task:`, `Author-type:` trailers for a commit range via `git log --format`, consuming values as data (never interpolated into a shell or `node -e` context) and quoting on output. | medium |
| Traceability grouping | Group commits by `Spec:` value; aggregate per-spec commit count and diff stat; collect commits carrying no `Spec:` trailer into an explicit untraced bucket. | medium |
| Routing sidecar reader | Locate `<spec-stem>.routing.json` for each referenced spec; parse `entries[]`; tolerate absence. | small |
| Attention map ranking | Order entries by `selected_agent` (`human-only`, then `assisted-agent`, then `auto-agent`) and ascending `blast_radius`; carry `rationale` through verbatim. | medium |
| Verification summary reader | Read the `/adev:validate` report for each referenced spec; extract verdict, gate results, and per-check outcomes. | small |
| Markdown renderer | Emit the three sections inside the `<!-- adev:pr-brief -->` marker, in fixed order, deterministically. | medium |
| CLI verb registration | Register `pr` with the `body` subverb in the `cli/index.mjs` dispatch table per the `cli-driver-surface` pattern. | small |
| Tests | `node:test` coverage for grouping, ranking order, `UNKNOWN` rendering, determinism, and each error case. | medium |

## Visual Expectations

Not a UI feature; the rendered markdown is the user-visible surface, so its shape is contractual.

Section order inside the marker is fixed and given in Section ownership above; the three slots this spec owns render in the relative order attention map → traceability → verification, because the attention map is what a reviewer needs before reading any diff. Each section renders as a heading plus a table. When a section has no data, it renders with an explicit gap line (for example, `_No routing data — see the UNKNOWN rows above._`) rather than being omitted, so a reviewer can distinguish "nothing to report" from "this section did not run."

The opening marker `<!-- adev:pr-brief -->` and closing marker `<!-- /adev:pr-brief -->` enclose all generated output and appear nowhere else.

## Acceptance Criteria

- [ ] `adev pr body --base <ref>` writes a marker-enclosed brief to stdout and exits 0.
- [ ] Every commit in `base..head` appears in exactly one traceability row or in the untraced bucket; a test asserts the counts sum to the total commit count.
- [ ] A task present in the diff but absent from any `routing.json` renders as `UNKNOWN` and is sorted above `auto-agent` rows.
- [ ] Running the verb twice on an unchanged `(base, head)` pair produces byte-identical output.
- [ ] With no `routing.json` present anywhere, the verb still exits 0 and the attention map renders its explicit gap line.
- [ ] With no validate report present, the verb still exits 0 and the verification section renders its explicit gap line.
- [ ] A commit whose `Spec:` trailer contains `]`, `,`, a newline, or backtick-quoted shell syntax renders escaped, produces no shell execution, and does not corrupt surrounding markdown.
- [ ] No output path invokes `gh`, `glab`, or any network call; a test asserts the module imports no HTTP client.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations.

## Preconditions

- The working directory is inside a git repository with a resolvable `HEAD`.
- The `--base` ref, when supplied, resolves via `git rev-parse`; when omitted, it defaults to the merge base with the repository's default branch.
- `.context-index/` exists with a readable `manifest.yaml` (for the provenance trailer names).
- Routing sidecars and validate reports may or may not exist; their absence is a normal input state, not an error.

## Behaviors

- **When** `adev pr body` is invoked with a resolvable `--base` ref **then** it writes a brief to stdout enclosed by `<!-- adev:pr-brief -->` and `<!-- /adev:pr-brief -->`, containing the attention map, traceability, and verification sections in that relative order within the marker's section list, and exits 0.
- **When** commits in the range carry `Spec:` trailers **then** each spec becomes one traceability row aggregating its commit count, plan-task coverage, and diff stat.
- **When** one or more commits in the range carry no `Spec:` trailer **then** they are collected into an explicitly labelled untraced bucket showing the count and short SHAs, and the section is annotated as a gap.
- **When** a referenced spec has a `<spec-stem>.routing.json` sidecar **then** its entries populate the attention map, ordered `human-only` → `assisted-agent` → `auto-agent`, then by ascending `blast_radius`, with each entry's `rationale` reproduced verbatim.
- **When** a task appears in the changed files but has no corresponding routing entry **then** it renders with route `UNKNOWN` and sorts above all `auto-agent` rows.
- **When** no routing sidecar exists for any referenced spec **then** the attention map renders its explicit gap line naming the missing sidecars, and the verb still exits 0.
- **When** a `/adev:validate` report exists for a referenced spec **then** the verification section reports its verdict, gate results, and per-check outcomes.
- **When** a trailer value contains markdown or shell metacharacters **then** the value is escaped on output and is never passed to a shell or evaluated.
- **When** the verb is invoked twice with the same `(base, head)` pair and unchanged inputs **then** both invocations produce byte-identical output.

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
| Validate report present but unparseable | Render the verification gap line naming the offending path, exit 0 | *(advisory — no code)* |
| Referenced spec path in a `Spec:` trailer does not exist on disk | Keep the traceability row, flag the path as missing, exit 0 | *(advisory — no code)* |
| Commit range is empty (`base` equals `head`) | Emit a marker-enclosed brief stating the range is empty, exit 0 | *(advisory — no code)* |
