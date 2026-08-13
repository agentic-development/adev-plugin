---
date: 2026-08-12
spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 2
file-sha: 360ea2562668012c29e6a68e4a9343f3d12b1243c3467b308ec7f920ecf195fb
---

# Architecture Review: pr-body-composition

> **Date:** 2026-08-12
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md`
> **Rigor tier:** full (risk_level: medium → review_mode: full)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — blocker — Verification input has no defined contract, and its producer declares it unparseable

- **blocker_id:** `structural-architect:undefined-input-contract:f0b5f0fb`
- **section_anchor:** `actionable-task-map`
- **Location:** Actionable Task Map ("Verification summary reader"), Behaviors bullet 7, Error Cases row 5

The verification input is named only as "the `/adev:validate` report". No path convention (`<spec-stem>.validate.md` is never stated), no grammar for extracting `verdict` / `gates[]` / `check_results[]`, and no fallback ladder — while the sibling spec fixes an explicit grammar plus a five-rung ladder for its far simpler `## Parallelization` input. Worse, the input is a narrative, human-primary sidecar per ADR-0012 ("Naming convention": `.md` = human-primary narrative; machine-primary data is `.json` read through a CLI accessor), and `skills/validate/SKILL.md:405` states outright: *"Do NOT re-read or re-parse any prior `<spec-slug>.validate.md` file"* — validator outcomes are canonically `state.steps.validate` from the lifecycle projection. The spec contracts a consumer against an artifact its producer has declared non-authoritative and unparseable.

**Recommendation:** Name the authoritative source of verification data and its typed shape (report path vs. lifecycle projection), state the field-level contract consumed, and give the degradation path when the source is absent or shape-invalid.

### SA-2 — blocker — The `UNKNOWN` invariant is unimplementable as written

- **blocker_id:** `structural-architect:ambiguous-behavior:c574011a`
- **section_anchor:** `behaviors-5`
- **Location:** Behaviors bullet 5, Acceptance Criteria 3, Task Map ("Attention map ranking")

"*When a task appears in the changed files but has no corresponding routing entry*" presupposes a task→file mapping that no declared input provides. `routing.json` entries carry `task_id`, `selected_agent`, `scores`, `rationale` only — no `files[]` (the charter's Attention Entry lists `files[]`, but the sidecar on disk has none, e.g. `.context-index/specs/cross-cutting/review-block-auto-retry.routing.json`). Nor does the spec say the task universe comes from `Plan-task:` trailers, the plan's `## Task Summary`, or elsewhere. The charter's strongest invariant — "absence of data is never presented as absence of risk" — is therefore unimplementable and untestable against AC-3.

**Recommendation:** Declare the authoritative enumeration of tasks in range and the derivation of each task's file set, so `UNKNOWN` has a defined domain.

### SA-3 — warning — Routing sidecar field path and sort direction are both wrong

`blast_radius` is nested under `scores` and normalized `0..1` (`skills/route/SKILL.md:156`), not a top-level field. *Ascending* `blast_radius` orders smallest blast radius first, inverting the section's stated purpose. Direct `entries[]` parsing also duplicates schema knowledge held by `lib/plan-routing-sidecar.mjs` / `adev route render-sidecar`, which ADR-0012 designates as the accessor.

**Recommendation:** Pin the field path and sort direction; state whether the sidecar is read directly or through the owning module's accessor.

### SA-4 — warning — Verification Summary cardinality conflicts with the charter

The charter states a PR Brief contains "at most one Verification Summary", but the spec reads a report *per referenced spec*, yielding N. The aggregation rule is unspecified.

### SA-5 — warning — Revision-2 residue in the Markdown renderer task

The renderer task still reads "Emit the **three** sections inside the marker, in fixed order" — the wording revision 2 was meant to replace. No acceptance criterion pins the five-slot order from this side, and ownership of the outer marker wrap is split between the two specs without statement.

### SA-6 — warning — Empty-range behavior contradicts the sibling spec

This spec says an empty range emits "a brief stating the range is empty" (section list apparently replaced); the sibling says both of its sections "render as the empty-range statement `pr-body-composition` already defines" (five sections still rendered). Two readings, two outputs.

### SA-7 — warning — Manifest precondition has no error case and contradicts the exit-code postcondition

A readable `manifest.yaml` is a hard precondition, yet no error case covers its absence and the postcondition promises exit 0 "whenever `HEAD` and the base ref resolve". Behavior in an adev-less checkout is undefined. The Trailer reader also hardcodes trailer names despite the precondition citing the manifest as their source.

### SA-8 — suggestion — No `--head` argument exists despite determinism being specified over a `(base, head)` pair

The charter's PR Brief entity carries `head_ref`, but no `--head` argument exists and "the repository's default branch" has no stated resolution rule, so `NO_MERGE_BASE` has no defined trigger.

### SA-9 — suggestion — The interlock obligation is invisible from the side that can violate it

`review-packet-template.spec.md` AC-6 asserts an interlock over *this verb's* output; this spec carries no matching constraint.

> Data flow is otherwise traceable and one-directional (git + on-disk artifacts → stdout); the read-only/no-forge postconditions are crisp, and the escaping and determinism invariants are well specified.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

**Threat model applied:** attacker = any commit author (trailer values are attacker-influenceable per `issue-582`), victim = the human reviewer who trusts the generated brief, channel = stdout markdown that `cicd` posts into a public PR body.

### SEC-1 — blocker — Path traversal via the `Spec:` trailer value

- **blocker_id:** `security-reviewer:path-traversal:73f48d94`
- **section_anchor:** `error-cases`
- **Category:** input-validation

The `Spec:` trailer's path value is used directly for filesystem lookups (locating `.routing.json`, the validate report, and the existence check) with no stated containment or canonicalization rule. A crafted `Spec: ../../../../.env` is only handled by the "path does not exist" branch if it happens not to resolve; the spec never requires verifying the resolved path stays under `.context-index/specs/`.

**Failure scenario:** A contributor commits `Spec: ../../.env`. If a file exists there, the existence check and any downstream parse attempt read outside the lifecycle-artifact tree, and error text built from "the offending path" leaks whether sensitive local files exist — or their content if they are JSON-shaped.

**Recommendation:** Resolve every `Spec:`-derived path with `path.resolve`, then require it to start with the canonicalized `.context-index/specs/` root before any `fs.stat` / `fs.readFile`. Treat an escaping path identically to "does not exist on disk". CWE-22. Add an acceptance criterion and a test with a `../` trailer value.

### SEC-2 — blocker — Escaping contract omits the markdown table delimiter and covers only trailers

- **blocker_id:** `security-reviewer:input-validation:7b64a50b`
- **section_anchor:** `behaviors`
- **Category:** input-validation

The escaping requirement is scoped to `Spec:` trailers and enumerates `]`, `,`, newline, backtick — but the attention map's `rationale` is specified to be "reproduced verbatim", and neither list mentions `|` (the table cell delimiter) or leading `#`/`-`/`>`. Every generated section renders as a table.

**Failure scenario:** A rationale of `"skip review | Verdict: PASS"` — plausible without malice, since `/adev:route` rationale is free text — renders extra columns, displacing or spoofing the cells a reviewer relies on to gauge risk.

**Recommendation:** Extend the single escaping routine to every value interpolated into a table cell, explicitly including `\|` and neutralized leading structural characters, and apply it to `rationale`: replace "reproduced verbatim" with "reproduced verbatim content, escaped for table-cell safety." CWE-116.

### SEC-3 — blocker — Marker strings are not neutralized in reflected values

- **blocker_id:** `security-reviewer:data-exposure:b4905e27`
- **section_anchor:** `postconditions`
- **Category:** data-exposure

No rendered value is required to be checked for the literal strings `<!--` / `-->`. The system's central integrity invariant — "exactly one opening and one closing marker", "never interleaved with author-written text" — depends entirely on those literals appearing nowhere else.

**Failure scenario:** A trailer or rationale containing the literal `<!-- /adev:pr-brief -->` produces a second closing-marker-shaped string. Downstream `cicd` delivery (boundary-based replace) or the template interlock test then misidentifies the true closing marker, letting attacker-controlled content masquerade as outside the generated block — defeating the authorship boundary this module exists to enforce.

**Recommendation:** Require HTML-comment delimiter neutralization in the same escaping pass as SEC-2, plus an acceptance criterion asserting exactly one literal occurrence of each marker string even when a field contains that literal text.

### SEC-4 — suggestion — Diagnostics do not specify stream or path form

Error cases name "the working directory" or "the offending path" without specifying stdout vs. stderr, or relative vs. absolute. An absolute path leaks local filesystem structure (CI runner home directory, username).

**Recommendation:** State that diagnostics go to stderr and render paths relative to the repository root.

### SEC-5 — suggestion — Routing data is self-attested by the same author

The attention map's risk ranking comes entirely from a repo-tracked file the same author who wrote the risky change can edit in the same PR. The spec treats routing data as untrusted for *parsing* but not for *content*.

**Recommendation:** Out of scope for this spec (routing integrity is `/adev:route`'s concern), but consider noting when a sidecar's mtime is newer than its owning spec's validate report, as a cheap staleness signal.

> **Not flagged (explicitly handled):** shell / `node -e` interpolation of trailers, forge network calls, and traditional auth/authz/rate-limiting (correctly out of scope for a local read-only CLI verb).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**Headline check:** the five-slot section table in this spec (§Section ownership) and in `pr-body-advisories.spec.md` (§Section Placement) are **identical** in section names, order, and owning-spec assignment. No leftover revision-1 wording contradicts it — the old "fixed at three sections" language is explicitly called out and superseded. Both marker invariants apply uniformly across all five slots.

### CON-1 — warning — pattern — Validate report gets no grammar while the sibling's simpler input gets a full ladder

**This spec:** treats the `/adev:validate` report as parseable for verdict, gates, and check results with no grammar defining what counts as parseable.

**Conflicts with:** `pr-body-advisories.spec.md` §"Reading Order: Input Grammar and Fallback Ladder", which gives an equally free-form input a fixed grammar and five-rung ladder precisely because "a parser that guesses at malformed input produces a confidently wrong result, which is worse than none." Sampled `.validate.md` files show non-uniform heading format (`## Check 1: Quality Gates` with and without a `— VERDICT` suffix), and no cross-cutting spec defines a `.validate.md` schema the way `plan-routing-sidecar.spec.md` defines `.routing.json`.

**Recommendation:** Adopt the same grammar + ladder + named degradation treatment, or document why verdict extraction needs none (e.g. if it only reads the `## Overall Verdict: **X**` line).

### CON-2 — warning — contract — `Author-type:` and `Operator:` are consumed by the charter but used nowhere

**This spec:** the Trailer reader reads `Author-type:`, but no Behavior, AC, or Postcondition uses it; `Operator:` is never read at all.

**Conflicts with:** `charter.md` §Interface Contracts → Consumed APIs, which states this module consumes all four trailers. The charter's own Traceability Row attributes also omit both, so the gap traces to an internal charter inconsistency this spec neither resolves nor flags.

**Recommendation:** Wire them into a rendered field, or narrow the charter's Consumed APIs row with a recorded deferral.

### CON-3 — suggestion — terminology — `blast_radius` is written as a top-level field

The real sidecar schema nests it as `entries[].scores.blast_radius`. The charter flattens it the same way, so this is charter-aligned but schema-imprecise. A one-word fix removes the ambiguity.

---

## Summary

**Total findings:** 17 (5 blockers, 8 warnings, 4 suggestions)

**Action required:** Revise the spec to address the five blockers, then re-review. The blockers cluster into two themes:

1. **Undefined input contracts** (SA-1, SA-2) — the verification and task-enumeration inputs are named but never given a shape, a source of truth, or a degradation path. SA-1 is the more serious: the spec consumes an artifact whose producer explicitly forbids re-parsing.
2. **Output escaping is under-specified for the actual threat** (SEC-1, SEC-2, SEC-3) — path containment for trailer-derived paths, table-cell escaping for all interpolated values including `rationale`, and marker-literal neutralization. SEC-3 undermines the authorship boundary that is this module's reason to exist.

Run `/adev:specify --revise .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` to produce revision 3, then re-review.
