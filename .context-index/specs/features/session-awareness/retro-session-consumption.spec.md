---
charter: session-awareness
kind: behavioral
status: validated
risk_level: low
milestone: 0.28.0
revision: 2
charter-revision: 6
created: 2026-05-20
updated: 2026-05-20
tracker-ref: issue-528
depends-on:
  - .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
source-manifest:
  sha: "b5888b6"
  files:
    - cli/index.mjs
    - lib/cli/retro.mjs
    - lib/retro/body-scan.mjs
    - lib/retro/issue-id-validation.mjs
    - lib/retro/safe-frontmatter.mjs
    - lib/retro/session-activity.mjs
    - lib/retro/session-format.mjs
    - lib/retro/session-metrics.mjs
    - skills/init/SKILL.md
    - skills/retro/SKILL.md
    - tests/cli/retro-session-activity.test.mjs
    - tests/lib/retro-body-scan.test.mjs
    - tests/lib/retro-issue-id-validation.test.mjs
    - tests/lib/retro-safe-frontmatter.test.mjs
    - tests/lib/retro-session-activity.test.mjs
    - tests/lib/retro-session-format.test.mjs
    - tests/lib/retro-session-metrics.test.mjs
    - tests/skills/retro-session-section.test.mjs
  computed-at: "2026-07-03T22:27:11.315Z"
---

<!-- partial_schema: spec@1 -->

# Live Spec: Retro Session Consumption

<!-- Implements the "Retro Session Consumption" capability from session-awareness
     charter rev 6. Extends `/adev:retro` to consume session capture files in
     the analysis window and emit a Session Activity section covering tool-use
     distribution, per-spec session counts, token/cost trends, sessions ↔
     closed-issues cross-reference, and first-class Context Gaps.

     Depends on `hook-driven-capture.spec.md` (rev 4/5 landed) for the
     SessionEnd file format. The optional frontmatter fields written by
     SessionEnd —
       cost_usd, input_tokens, output_tokens, model, issue, epic
     — are now documented in the upstream spec (CON-X4 closed). When a session
     file omits these fields, behaviors 9 and 11 in this spec degrade to
     "data absent" (no warning, section omitted).

     This spec also closes the documentation drift at skills/init/SKILL.md:761
     which currently claims /adev:retro consumes sessions — true once this
     spec ships, false today (per issue-528 § Verification). -->

## Behavioral Contract

### Preconditions

- `/adev:retro` is invoked with an analysis window (date range, e.g., last N days or explicit `--since/--until`).
- `.context-index/sessions/` either exists (potentially empty) or is missing — both are valid input states; the charter Quality Attribute "Graceful absence" requires retro to handle either without warnings.
- Two session-file formats may coexist within the window:
  - **Hook-mode** (`hook-driven-capture` rev 3+): `<YYYY-MM-DD>-<session_id>.md` with frontmatter `{ kind: session-end|pre-compact|placeholder, session_id, date }`; optional fields `cost_usd, input_tokens, output_tokens, model, issue, epic` (pending hook-driven-capture rev 4 amendment).
  - **Post-commit-mode** (legacy): `<YYYY-MM-DD>-<sha>.md` with frontmatter `{ date, type: commit, mode, agent: git-hook, [sha] }`.
- The target file for the new prose step is `skills/retro/SKILL.md`.
- `lib/retro/session-activity.mjs` and `lib/retro/session-format.mjs` are new modules added by this spec.
- The issue board is consumed read-only via `getIssueManager(manifest)` from `lib/issues/registry.mjs`; sessions ↔ closed-issues xref calls `list({ status: "closed", since, until })` against the analysis window. No board mutation.

### Invariants

- **Graceful absence (charter QA).** When `.context-index/sessions/` is missing, empty, or contains only files outside the analysis window, the `## Session Activity` section is omitted entirely from the retro report. No placeholder text, no warning, no error.
- **Format tolerance.** Unknown frontmatter shapes are counted toward the total session count for the window but skipped for deeper metric extraction. Retro never warns about "missing data" for unknown-format files.
- **No raw transcript reading (SEC-B4).** Retro MUST NOT open any file outside `.context-index/sessions/` and the project's issue board. It never opens raw Claude Code transcript JSONLs and never fetches from `~/.claude/projects/`. Token/cost values are read from frontmatter verbatim. A session body containing `See ~/.ssh/id_rsa for context` cannot cause an accidental read.
- **Best-effort cross-reference.** When `issue:` or `epic:` is absent from a session file's frontmatter, retro skips the cross-reference for that session rather than fabricating one from body content. Cross-reference is opt-in via upstream frontmatter.
- **No mutation.** Retro never modifies, deletes, or creates session files. It is strictly a read-only consumer of `.context-index/sessions/`.
- **Stable section position.** The `## Session Activity` section, when rendered, appears between the existing Data Gathering section (Step 1) and Pattern Analysis section (Step 2) in the retro report — positioned as logical subsection 1.8.
- **Bounded body scans (SEC-B1).** (1) Body scans use literal `String.prototype.includes()` or non-backtracking regex; backtracking quantifiers (`.+`, `.*`) over body content are forbidden. (2) Session bodies above 5 MB are skipped for metric extraction (counted in total, classified separately). (3) Context Gaps "no matches" / "file not found" / "0 results" patterns must match inside a tool-output frame — a block delimited per the body-scan helper's frame definition.
- **Issue-id validation (SEC-B2).** `issue` and `epic` frontmatter values are validated against `^[a-z0-9][a-z0-9.-]{0,63}$` AND `parseId(value)` recognition before any board lookup. Charset-mismatch values render the xref row with `(invalid)` annotation. Defense-in-depth — required even though hook-driven-capture rev 5 SEC-13 validates at the producer.
- **Safe YAML parse (SEC-B3).** YAML frontmatter is parsed in safe-load mode — no custom tags, no functions, no aliases expanded > N times. Frontmatter exceeding 16 KB is skipped and classified `unknown`. If a third-party YAML library is introduced, an ADR is required (Principle 1).

### Behaviors

1. **When** `/adev:retro` runs with an analysis window covering N days **then** it globs `.context-index/sessions/*.md`, filters by each file's frontmatter `date` against the window, and counts the resulting set.

2. **When** at least one session file is found in the window **then** the retro report includes a `## Session Activity` section after § 1.7 (Heuristics) and before Step 2 (Pattern Analysis).

3. **When** no session files are found in the window, OR `.context-index/sessions/` is missing, OR the directory exists but is empty **then** the `## Session Activity` section is omitted entirely.

4. **When** a session file has frontmatter `{ kind: session-end | pre-compact | placeholder, session_id, date, … }` **then** `classifyFormat(frontmatter)` returns `hook` and the hook-mode extraction path runs against it.

   *CON-X1 note:* `hook` is the classifier's label, not a stored frontmatter value. Hook-mode files store `kind: session-end | pre-compact | placeholder`.

5. **When** a session file has frontmatter `{ date, type: commit, agent: git-hook, … }` **then** `classifyFormat(frontmatter)` returns `post-commit` and the legacy extraction path runs against it.

6. **When** a session file has any other frontmatter shape, malformed YAML, or no frontmatter at all **then** `classifyFormat()` returns `unknown`. The file counts toward the total but no metrics are extracted from it.

7. **When** retro extracts tool-use distribution **then** it parses rendered markdown bodies of **hook-mode** sessions for tool mentions using exactly two consumer-pinned patterns: (a) literal `### <Tool>` headings at line start, and (b) literal `**Tool:** <name>` lines at line start (both case-sensitive). The frequency table covers the top 10 tools across the window. Note: per SA-3 path-b, Spec B's parser is decoupled from Spec A's body prose — any future body-shape change in `lib/session-summary.mjs::fromTranscript()` requires an explicit amendment to this behavior, not implicit adoption.

8. **When** retro extracts per-spec session counts **then** it scans each session for spec-path references in two places: (a) the frontmatter `spec:` field if present, (b) the body grepped for `.context-index/specs/.../*.spec.md` substrings. Both contribute; a session referencing two specs counts toward both. The table renders descending by count, ties broken by spec slug ascending; specs with zero sessions in the window are omitted.

9. **When** at least one session file with `kind: session-end` in the window has at least one of the cost frontmatter fields (`cost_usd`, `input_tokens`, `output_tokens`, `model`) **then** the report renders a Cost & Token Trends subsection with: total `cost_usd`, total `input_tokens`, total `output_tokens`, per-model breakdown, per-spec breakdown. Sessions missing any field are excluded from that field's aggregate but still counted in the session-total. *XS-2 scope:* pre-compact and placeholder sessions are EXCLUDED from cost/token aggregation; only `kind: session-end` contributes.

10. **When** no session file with `kind: session-end` in the window has any cost frontmatter field **then** the Cost & Token Trends subsection is omitted (no zero-row table, no "data unavailable" note).

11. **When** at least one session file with `kind: session-end` has `issue:` and/or `epic:` frontmatter **then** retro renders a Sessions ↔ Closed Issues cross-reference table joining session entries against issues closed within the analysis window. Each row: closed issue id, title, list of `session_id_short` values that touched it. *XS-2 scope:* pre-compact and placeholder sessions are EXCLUDED from xref aggregation; only `kind: session-end` contributes. *CON-X3:* `session_id_short` is defined as the first 8 hex characters of `session_id`, for display only; the underlying join uses the full `session_id`. *CON-X5:* When the referenced issue id is not present on the board at all, the row renders with `(unknown)` as title and no closed-date column value.

12. **When** the Context Gaps analysis runs **then** it scans **hook-mode** session bodies for documented "no matches" / "file not found" / "0 results" patterns from prior search-tool output, aggregates by the spec the session was touching (frontmatter `spec:` field or grepped body reference), and renders the top 10 spec-gap pairs as ADR / missing-reference candidates. *SA-1 placement:* the existing conditional Context Gaps logic at `skills/retro/SKILL.md:125` (currently inside Step 2) is REMOVED; the first-class replacement renders inside § 1.8 in Step 1. The frame-anchored constraint from SEC-B1(3) applies: matches must occur inside a tool-output frame.

13. **When** the retro report is rendered **then** the `## Session Activity` section contains, in this order: (a) total session count + format breakdown line `(hook: N, post-commit: M, unknown: K)`; (b) Tool-Use Distribution (top 10); (c) Per-Spec Session Counts; (d) Cost & Token Trends if applicable; (e) Sessions ↔ Closed Issues if applicable; (f) Context Gaps (top 10).

### Postconditions

- After `/adev:retro` completes successfully, the retro report file contains a `## Session Activity` section iff sessions existed in the window; otherwise no such section appears.
- No file under `.context-index/sessions/` is modified, created, or deleted.
- `skills/init/SKILL.md` line 761's documentation claim about `/adev:retro` consuming sessions is now accurate (the doc-drift fix tracked under issue-528 is resolved).

### Error Cases

| Condition | Expected Behavior |
|---|---|
| `.context-index/sessions/` directory missing | Section omitted; retro proceeds normally with other Step 1 sources |
| Directory exists but empty | Section omitted |
| Directory contains only files outside the analysis window | Section omitted |
| Session file YAML frontmatter malformed (unparseable) | File classified `unknown`; counted in total; metric extraction skipped; no error |
| Session file body unreadable (permission error) | File classified `unknown`; counted in total; no error to retro caller |
| `cost_usd` field present but non-numeric (e.g., `"$0.05"` string instead of `0.05`) | Excluded from cost aggregate; recorded internally as "parse-error sample" for diagnostic; not surfaced as warning unless `--verbose` |
| `issue:` field references an unknown issue id | Cross-reference row rendered with `(unknown)` annotation; no error |
| Sessions in the window span multiple capture modes | Each file classified independently; format-breakdown line shows the mix |
| Analysis window covers 0 days (invalid input) | Retro handles this at its own input-validation layer; this spec does not own analysis-window validation |
| Two session files share the same `(date, session_id)` collision | Both counted independently; metrics deduplicated by file path, not by session_id (a duplicate session_id is an upstream invariant violation of hook-driven-capture, not a retro concern) |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies.** Two new ESM modules under `lib/retro/` using only Node built-ins (`fs`, `path`, `node:glob` or directory walk). The skill prose extension uses standard markdown. No new package dependencies.
- **Principle 2 — Skills are primarily markdown.** The new § 1.8 step in `skills/retro/SKILL.md` invokes `lib/retro/session-activity.mjs` via a CLI verb or named helper — no inline-Node directive, no `node -e`, no `node --input-type=module -e` heredoc. Pre-commit `no-inline-node` hook enforces this.
- **Principle 3 — Pure ESM.** `lib/retro/session-activity.mjs` and `lib/retro/session-format.mjs` both ESM. No CommonJS.
- **Constitution > Architecture Boundaries > Autonomous.** Editing skill markdown content, adding tests, and adding `lib/` modules within a charter's scope are explicitly listed as autonomous (no human approval required).

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| `skills/retro/SKILL.md` | Medium | (a) Add § 1.8 Session Activity step between § 1.7 and Step 2 (calls CLI verb). (b) DELETE the existing conditional "Context Gaps" subsection from Step 2 — the first-class replacement renders inside § 1.8 (SA-1). (c) Update Output Format to render Session Activity. |
| `lib/retro/session-activity.mjs` | High | NEW module. Exposes `gatherSessionActivity(projectRoot, analysisWindow, opts?)` returning `{ totalSessions, formatBreakdown, toolUseDistribution, perSpecCounts, costTokens, issueXrefs, contextGaps }`. Glob, filter by date, classify, dispatch to sub-helpers, assemble return object. Owns the format-breakdown line composition (SA-2: format-breakdown stays in the orchestrator core, not delegated to a sub-helper). |
| `lib/retro/session-format.mjs` | Medium | NEW module. Exposes `classifyFormat(frontmatter)` returning one of `hook | post-commit | unknown`. Pure function — frontmatter in, classification out. |
| `lib/retro/session-metrics.mjs` (single rollup file) | Medium | NEW. One module exporting all sub-helpers as named exports: `parseToolUseDistribution`, `countPerSpec`, `aggregateCostTokens`, `joinClosedIssueXref`, `scanContextGaps` (SA-2 — single file, not a directory). |
| `lib/retro/body-scan.mjs` | Medium | NEW. Bounded body-scan helpers (5 MB cap, `String.prototype.includes()` scanning, frame-anchored gap matcher). Defense-in-depth for SEC-B1. |
| `lib/retro/safe-frontmatter.mjs` | Medium | NEW. YAML safe-load wrapper around `lib/meta-tools.mjs::parseFrontmatter` with 16 KB size cap and anchor/alias/custom-tag rejection. Defense-in-depth for SEC-B3. |
| `lib/retro/issue-id-validation.mjs` | Low | NEW. `validateIssueId(value)` returning `{ ok, normalized, reason }`. Charset `^[a-z0-9][a-z0-9.-]{0,63}$` AND `parseId()` recognition. Defense-in-depth for SEC-B2. |
| `lib/issues/registry.mjs` | None (read-only consumer) | Consumed via `getIssueManager(manifest)` + `list({ status: "closed", since, until })` by `joinClosedIssueXref()`. No edits. |
| `skills/init/SKILL.md` | Low | Line 761 documentation drift fix: update wording so the (now-accurate) claim about `/adev:retro` session consumption points at the Session Activity step. |
| `tests/lib/retro-session-activity.test.mjs` | High | NEW. Cover empty dir, hook-only window, post-commit-only window, mixed-format window, unknown-format files, malformed frontmatter, cost aggregation (with and without fields), issue xref (with and without fields), context-gaps extraction. |
| `tests/lib/retro-session-format.test.mjs` | Low | NEW. Direct unit test of `classifyFormat()` over a matrix of frontmatter shapes including malformed cases. |
| `tests/skills/retro-session-section.test.mjs` | Medium | NEW end-to-end. Run retro against a fixture project with deterministic session files; snapshot-assert the rendered Session Activity output shape (counts, ordering, omissions). |
| `.context-index/specs/features/session-awareness/hook-driven-capture.spec.md` | None (upstream landed) | **Dependency satisfied (CON-X4).** Optional SessionEnd frontmatter fields `cost_usd`, `input_tokens`, `output_tokens`, `model`, `issue`, `epic` are documented in **hook-driven-capture rev 4/5**. Sources: cost/tokens from the Claude Code transcript JSONL final usage block; issue/epic from `.context-index/.execution-state.json` at SessionEnd time. Read-only reference here. |

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| ~~Upstream amendment (rev 4 of hook-driven-capture)~~ — **landed in hook-driven-capture rev 4/5** (CON-X4 closed) | Read-only dependency. Optional SessionEnd frontmatter fields are documented upstream and validated at the producer (SEC-12/SEC-13). | n/a |
| `classifyFormat()` helper | New `lib/retro/session-format.mjs`. Pure function over parsed frontmatter. Tests for hook / post-commit / unknown / malformed. | small |
| `gatherSessionActivity()` core | New `lib/retro/session-activity.mjs`. Orchestrates glob, date-window filter, classify, dispatch to sub-helpers, assemble return object. | medium |
| Tool-use distribution parser | Sub-helper. Parses rendered markdown bodies of hook-mode sessions for tool mentions; verify against the actual shape `fromTranscript()` produces. | small |
| Per-spec session counter | Sub-helper. Extracts spec references from frontmatter `spec:` field AND body grep for `.context-index/specs/**/*.spec.md`. Dedupe per (session, spec) pair. | small |
| Cost & token aggregator | Sub-helper. Sums `cost_usd`, `input_tokens`, `output_tokens` across sessions. Groups by `model` and by spec. Skip-and-record parse-error samples for malformed numerics. | small |
| Sessions ↔ closed-issues xref | Sub-helper. Reads closed issues in the analysis window from the issue board; joins against session `issue:`/`epic:` frontmatter; renders table rows. | small |
| Context Gaps first-class | Replace the conditional grep at retro:125 with a body-scan helper that looks for "no matches" / "file not found" / "0 results" output patterns in prior tool-call records; aggregate per spec; surface top 10. | medium |
| Skill prose — § 1.8 step | Add the new step to `skills/retro/SKILL.md` invoking `gatherSessionActivity()` via the configured entry point (CLI verb or named helper — plan decides). | small |
| Skill prose — Context Gaps rewrite | Replace the existing conditional Context Gaps text with the first-class version. | small |
| Skill prose — Output Format update | Update the retro Output Format section to render Session Activity. | small |
| Doc drift fix | Update `skills/init/SKILL.md:761` to accurately describe `/adev:retro` session consumption (the wording is correct *after* this spec ships). | trivial |
| Tests — gather core | Empty dir, hook-only, post-commit-only, mixed, unknown, malformed, out-of-window. | medium |
| Tests — sub-helpers | Each sub-helper independently. | medium |
| Tests — end-to-end skill output | Fixture project + snapshot-assert rendered Session Activity. | small |

## Acceptance Criteria

- [ ] `gatherSessionActivity(projectRoot, analysisWindow)` is exposed from `lib/retro/session-activity.mjs` and returns `{ totalSessions, formatBreakdown, toolUseDistribution, perSpecCounts, costTokens, issueXrefs, contextGaps }` (or equivalent documented shape).
- [ ] `classifyFormat(frontmatter)` is exposed from `lib/retro/session-format.mjs` and returns `hook | post-commit | unknown`.
- [ ] `/adev:retro` emits a `## Session Activity` section when at least one session file exists in the analysis window; the section appears between § 1.7 and Step 2.
- [ ] The section is omitted entirely when no sessions exist in the window (no warning, no placeholder, no error).
- [ ] Session Activity displays total session count plus a one-line format breakdown `(hook: N, post-commit: M, unknown: K)`.
- [ ] Tool-Use Distribution renders as a top-10 frequency table sourced from hook-mode sessions only.
- [ ] Per-Spec Session Counts renders sorted descending; specs with zero sessions in the window are omitted; ties broken by spec slug ascending.
- [ ] Cost & Token Trends subsection renders only when at least one session file has at least one cost field; shows totals + per-model + per-spec breakdowns.
- [ ] Sessions ↔ Closed Issues table renders only when at least one session file has `issue:` or `epic:` frontmatter present.
- [ ] Context Gaps subsection renders top-10 spec-gap candidates from the new body-scan helper; this fully replaces the conditional grep at `skills/retro/SKILL.md:125`.
- [ ] Format tolerance: unknown frontmatter shapes are counted toward the total but skip metric extraction (no warning logged).
- [ ] Graceful absence: missing or empty `.context-index/sessions/` results in section omission without warning or error.
- [ ] Malformed YAML frontmatter does not crash retro; the file is classified `unknown` and counted.
- [ ] Malformed numeric cost fields are excluded from aggregation without surfacing warnings unless `--verbose` is set.
- [ ] Sessions referencing unknown issue ids in `issue:` frontmatter render with `(unknown)` annotation in the xref table; retro does not error.
- [ ] No file under `.context-index/sessions/` is modified, created, or deleted by retro (read-only invariant).
- [ ] `skills/init/SKILL.md:761` wording accurately describes the (now-true) `/adev:retro` session consumption claim.
- [ ] Tests cover empty / hook-only / post-commit-only / mixed / unknown / malformed cases for `gatherSessionActivity()`.
- [ ] Tests cover each sub-helper independently with documented edge cases.
- [ ] End-to-end test renders Session Activity from a fixture project and snapshot-asserts the output shape.
- [ ] All quality gates pass (`npm test`).
- [ ] No new external dependencies (Principle 1).
- [ ] No inline-Node patterns introduced in `skills/retro/SKILL.md` or `skills/init/SKILL.md` (Principle 2 + pre-commit hook).
- [ ] All new code is pure ESM (Principle 3).
- [ ] Pre-commit hooks pass.
