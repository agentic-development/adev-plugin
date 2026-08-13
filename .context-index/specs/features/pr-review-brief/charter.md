---
status: approved
kind: feature
revision: 2
updated: 2026-08-12
---

# Feature Charter: PR Review Brief

## Business Intent

Agent-authored pull requests in this repo are bimodal in size: across the last 40 merged PRs (excluding `release-please` automation, n=32) the median is 116 added lines, but p75 is 2,100 — only 5 of 32 land in the 100–900 line band where review research finds defect detection effective, and the 41% exceeding 400 additions carry 96% of all changed lines. The cost of this is not primarily code quality: LinearB's 2026 benchmark (8.1M PRs, ~4,800 teams) reports 32.7% of AI-assisted PRs merging within 30 days against 84.5% for manual ones, with reviewer pickup time rising roughly fivefold — a deficit attributed to orientation and trust rather than defects.

The adev lifecycle already computes everything a human needs to triage a large diff — `Spec:` / `Plan-task:` / `Author-type:` commit trailers, `/adev:route` blast-radius and novelty scores, `/adev:validate` verdicts — and discards all of it at PR time. This module owns the **reviewer-facing content contract**: what a pull request must tell a human, and the enforced separation between what the author claims and what the lifecycle measured.

## Scope and Boundaries

### In Scope

- **Provenance rollup** — group the commits in a PR range by their `Spec:` trailer, showing plan-task coverage and per-spec diff size; explicitly surface commits carrying no `Spec:` trailer.
- **Attention map** — derive a reviewer attention budget from `<spec>.routing.json`, ordering tasks by `selected_agent` (`human-only` first) and `blast_radius`, with each task's `rationale` carried through verbatim.
- **Verification summary** — report which `/adev:validate` checks ran and their verdict, so a reviewer can safely decline to re-verify what was already verified.
- **Review packet field set** — the author-written contract: problem statement, risk areas and trust boundaries touched, sections verified line-by-line, and an explicit statement of what the author cannot explain.
- **Authorship boundary** — the `<!-- adev:pr-brief -->` marker delimiting generated content from author-written content, and the rule that the two are never interleaved.
- **Markdown generation to stdout** — the composed brief as a stream, with no knowledge of any forge.

### Out of Scope

- **`adev <verb>` dispatch substrate and the `lib/cli/` helper pattern** — owned by the `cli-driver-surface` charter, which already declares the driver substrate in its In Scope. This module contributes a verb; it does not define how verbs are wired.
- **CI workflow, sticky-comment delivery, and size-advisory wiring** — owned by the `cicd` charter, which owns `.github/workflows/`.
- **`.github/skills/` materialization and the `AGENTS.md` sync target** — owned by the `copilot-provider` charter. Note that charter currently asserts `AGENTS.md` is "already written by sync"; in this repo `manifest.yaml` declares only `CLAUDE.md` as a sync target and `AGENTS.md` is absent, so a write path is in fact required. Flagged for that charter to correct.
- **Changes to the provenance trailer contract** (e.g. adopting the kernel's `Assisted-by: AGENT_NAME:MODEL_VERSION`) — the trailer set is enforced by `.githooks/commit-msg` and CI, which the constitution places under human approval.
- **Forge adapters for GitLab, Gerrit, or Bitbucket** — deferred until adev is actually run against a non-GitHub forge.

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `cli-driver-surface` | internal module | Provides the `adev <verb>` dispatch table and `lib/cli/<verb>.mjs` helper pattern this module's verb plugs into. |
| Git commit trailers | shared library | `Spec:`, `Plan-task:`, `Author-type:`, `Operator:` per `manifest.yaml` provenance config. |
| `/adev:route` | internal module | Produces `<spec>.routing.json`, the source of the attention map. |
| `/adev:validate` | internal module | Produces the report backing the verification summary. |

`cicd` is deliberately **not** listed above. The dependency runs inbound — `cicd` consumes this module's stdout and delivers it to the forge — so it appears under Interface Contracts → Exposed APIs, not here. This module must remain buildable and testable with no CI workflow in place.

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| PR Brief | The generated artifact as a whole. | `marker`, `sections[]`, `base_ref`, `head_ref` |
| Attention Entry | One task ranked by how much human attention it warrants. | `task_id`, `files[]`, `selected_agent`, `blast_radius`, `novelty`, `rationale` |
| Traceability Row | One spec's footprint within the PR range. | `spec_path`, `task_ids[]`, `commit_count`, `additions`, `deletions`, `missing_spec_trailer` |
| Verification Summary | What the lifecycle already checked. | `verdict`, `gates[]`, `check_results[]` |
| Review Packet | The author-written half of the contract. | `what`, `risk_areas`, `verified_line_by_line`, `cannot_explain` |

### Relationships

- A **PR Brief** contains zero or more **Attention Entries**, zero or more **Traceability Rows**, and at most one **Verification Summary**.
- An **Attention Entry** derives from one `<spec>.routing.json` entry; a **Traceability Row** aggregates the commits sharing one `Spec:` trailer value.
- A **Review Packet** is authored by a human and lives outside the marker; a **PR Brief** is generated and lives inside it. Neither ever contains the other.

### Invariants

- Generated content is always enclosed by the `<!-- adev:pr-brief -->` marker and is never interleaved with author-written text.
- Every commit in the `base..head` range appears in exactly one Traceability Row, or in an explicit untraced bucket. No commit is silently dropped.
- A task with no corresponding routing entry renders as `UNKNOWN`, never as low-risk. Absence of data is never presented as absence of risk.
- The generator writes to stdout and never invokes a forge CLI.
- Output is deterministic for a fixed `(base_ref, head_ref)` pair.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Provenance rollup by spec | Group PR commits by `Spec:` trailer with plan-task coverage and per-spec diff size; flag untraced commits. | must-have | | specified |
| Attention map from routing scores | Rank tasks by `selected_agent` and `blast_radius`; emit "read these first" with rationale. | must-have | | specified |
| Verification summary | Report `/adev:validate` verdict, gates, and check results. | must-have | | specified |
| Review packet field set | Author-written contract including the "what I cannot explain" field. | must-have | | specified |
| Reading order for multi-commit PRs | Derive a suggested reading sequence from plan task order and `## Parallelization` groups. | should-have | | specified |
| Size advisory with exception classes | Warn above a size threshold, naming legitimate exceptions (mechanical sweep, generated mirror, migration). | should-have | | specified |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Forge adapter registry | No non-GitHub forge in use yet; the registry follows the proven `lib/issues/registry.mjs` pattern when one appears. Must not be named `provider` — that term already denotes agent harnesses in `lib/provider/registry.mjs`. | — | first non-GitHub forge adoption |
| `Assisted-by:` trailer alignment | Changes the provenance contract enforced by hooks and CI; constitution places this under human approval. | — | human decision |
| Stacked-PR tooling | Stated reading order is the low-cost approximation; adopting Graphite adds an external dependency warranting an ADR. | — | reading-order capability proving insufficient |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `adev pr body [--base <ref>]` | CLI verb | Composes the brief and writes markdown to stdout. Exits 0 even when inputs are missing (advisory); non-zero only when git state is unreadable. |
| PR brief markdown format | artifact contract | Marker-delimited section structure that `cicd` delivery and the PR template both depend on. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `adev <verb>` dispatch table | `cli-driver-surface` | Registration point for the `pr` verb. |
| Git commit trailers | provenance config | `Spec:`, `Plan-task:`, `Author-type:`, `Operator:` values via `git log`. |
| `<spec>.routing.json` | `/adev:route` | Per-task `selected_agent`, `scores`, and `rationale`. |
| Validate report | `/adev:validate` | Verdict, gate results, and per-check outcomes. |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Composition completes within the time budget of a CI step; reads git metadata and existing artifacts only, never re-runs gates or re-derives routing. |
| Availability | Advisory and non-blocking — never gates a merge. A generator failure degrades the PR to its pre-brief state and must not fail CI. |
| Security | Trailer values are consumed as data, never interpolated into a shell or `node -e` context (see `issue-582`), and are quoted on output so a crafted `Spec:` value cannot corrupt downstream markdown or frontmatter parsing. |
| Observability | Degrades loudly: missing routing sidecars (~20 legacy plans per `issue-528`), an absent validate report, or untraced commits are each rendered as an explicit gap in the output, never as silence. |
| Portability | Forge-agnostic — zero forge knowledge in the generator; delivery is another charter's concern. |
| Dependencies | Zero new external dependencies; Node built-ins and `git` only, per constitution Principle 1. |
