# Architecture Review: markdown-rendering-layer

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/markdown-rendering-layer.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 1
file-sha: f6b4bae7f31cf47e5b9629fdf6e21f7a70849046

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

The spec is well-structured. Contracts are clear, dependencies point inward toward the authoritative JSON/JSONL state, and the rendering layer correctly enforces its "presentation only" stance. Sibling-spec coordination (stub-replacement claim for `renderMarkdown` and `listLifecycleStates`) is consistent with the lifecycle-event-log spec's commitment.

### Finding SA-1

- **Severity:** warning
- **Location:** Behavioral Contract (line 28: "`tasks.json` source is bounded by `JsonAdapter._read`"); Preconditions (line 197 references `_read`).
- **Finding:** `_read()` is documented in the json-issue-board-adapter spec as an internal primitive (leading underscore). This spec leans on it as a precondition / containment-source, which introduces a cross-module coupling to a non-public method. If `_read` is renamed or removed, this spec breaks silently.
- **Recommendation:** Either (a) restate this as "consumes the documented public `list()` / `listEpics()` paths, which internally enforce the size and shape contract" or (b) explicitly call out in the sibling spec that `_read` is a contractually stable internal — but the cleaner path is (a), since `writeTasksMd` already composes `list()`+`listEpics()` per the Behavioral Contract.

### Finding SA-2

- **Severity:** warning
- **Location:** Acceptance Criteria (line 182: "Exit 0 on success; exit 1 on `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH`"); Behaviors (`When adev status --render runs...`); Error Cases (skip-with-advisory rows for `SKIPPED_INVALID_SLUG`, `OVERSIZED_LOG_SKIPPED`, `MALFORMED_FILE_SKIPPED`).
- **Finding:** Three "skip and continue" advisories are defined, but the spec doesn't state the resulting exit code. Operators running `--render` in CI need to know: does a single oversized log make the command exit non-zero, or only hard validation errors? The current language ("Exit 0 on success") is ambiguous when some files were skipped with advisories.
- **Recommendation:** Add one sentence to either the Behaviors `--render` clause or Error Cases: e.g. "Advisory-skipped files do not affect exit code; exit code reflects only `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH` / unrecoverable `fs` errors." Or — if partial-skip should exit non-zero — say so explicitly.

### Finding SA-3

- **Severity:** warning
- **Location:** Behaviors (line 219: "Both share a single exit code (1 if either fails, 0 otherwise)"); Error Cases ("CLI invoked with `--render` AND `--pipeline` together | Run render first, then pipeline; not an error").
- **Finding:** The composite "1 if either fails" rule needs the SA-2 definition of "fails" pinned down. Otherwise an oversized log in `--render` could either bubble to exit 1 (poisoning the `--pipeline` portion) or be invisible — caller cannot tell.
- **Recommendation:** Resolve SA-2 first; this finding closes automatically once the meaning of "render failure" is locked.

### Finding SA-4

- **Severity:** suggestion
- **Location:** HTML/Markdown Escaping table (line 74: `StateProjection.currentTask (when set to a non-numeric label)`); rule 5 caps it at 100 codepoints.
- **Finding:** `currentTask` is a derived projection field whose value comes from `plan_task.task_id` (event-discriminator allowlisted) or numeric form. Per the lifecycle-event-log foundation, `task_id` is treated as an internal identifier in the "Escaping does NOT apply to" list at line 108. Listing `currentTask` as escapable contradicts that classification — either the input is allowlisted (no escape needed) or it's not (and `task_id` should also escape). The current spec straddles both.
- **Recommendation:** Tighten the source-of-truth: either (a) state that `currentTask` is only escaped because operator `manual_override` events can write arbitrary string labels — and call that out as the actual untrusted path; or (b) move `currentTask` into the "does NOT apply" list and require an upstream allowlist on `manual_override.field = "currentTask"`. Either is fine, but the current asymmetry with `task_id` will confuse implementers.

### Finding SA-5

- **Severity:** suggestion
- **Location:** Actionable Task Map (line 127 "Round-trip property test"); Acceptance Criteria (line 170: legacy issues excluded from the round-trip property).
- **Finding:** The renderer is required to emit legacy issues correctly, but `parseTasksMd(renderTasksMd(legacyBoard))` is allowed to fail or diverge. This is a structurally awkward contract: the renderer must serialize a shape the parser will later refuse. The asymmetry is justified (write-rejection is the migration goal), but it should be stated as a contract, not just an exclusion in the test acceptance line.
- **Recommendation:** Add one bullet under the Behavioral Contract or a new "Legacy issue handling" subsection stating: "Legacy issues carrying both `planRef` and `planTask` render to markdown verbatim but are intentionally excluded from the `parseTasksMd ∘ renderTasksMd` round-trip property — the parser rejects them per the granularity invariant. This is read-tolerance during the migration window, not a permanent contract."

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### SEC-5 Resolution Confirmation

The deferred SEC-5 finding (free-text untrusted-input declaration) carried forward from `lifecycle-event-log.review.md` and `milestones-migration.review.md` is **resolved** by this spec. The escaping contract is comprehensive:

- 11 named free-text fields enumerated across both renderers
- 6-rule pipeline with correct ordering (HTML escape rule 3 precedes markdown structural escape rule 4, preventing `<` from being double-escaped)
- Truncation applies to the escaped form (post-escape), correctly preventing backslash-bomb attacks that expand under escape from defeating the cap
- Code-fence blocks apply HTML and markdown escapes internally, not relying on the fence for security containment
- Null/undefined/empty-string uniform handling prevents conditional-branch bypass

SEC-5 is fully closed across the agent-reliable-state-artifacts charter. No carry-forward needed.

### Finding SEC-1

- **Severity:** warning
- **Category:** injection
- **Location:** Actionable Task Map (line 133: `GENERATED_HEADER` constant interpolating `${source}`); Visual Expectations (line 161: footer `<!-- regenerated from <slug>.jsonl on <timestamp> -->`).
- **Finding:** The `source` tag interpolated into the `GENERATED_HEADER` constant and into the trailing footer comment injects a file path directly into an HTML comment. If `source` is derived from a slug that passed the `[a-z0-9._-]+` allowlist, the character set is safe. However, the spec does not explicitly state that the `source` value used in the header is the validated slug stem (or a derivation from it). If `tasks.json`'s storage-root path is interpolated verbatim into the header it could contain characters that close the HTML comment early (e.g., a path segment containing `-->`). The spec mandates slug allowlist validation before render but does not specify the escape applied to the `source` parameter in the header template.
- **Recommendation:** Require that the `source` interpolation into HTML comment tokens strips or escapes the substring `-->` (replace with `-- >` or omit). This is a one-line precaution covering both the per-slug footer and the `tasks.md` header. Reference OWASP HTML context injection rules for comment-context escaping.

### Finding SEC-2

- **Severity:** suggestion
- **Category:** path-traversal
- **Location:** Path Safety section, item 4 (line 49) realpath-prefix check + item 7 (line 52) atomic rename.
- **Finding:** The TOCTOU residual-risk class identified as SEC-7 in the `milestones-migration` review (realpath-prefix check then rename, with a potential concurrent symlink swap in between) applies equally here. This spec does not explicitly acknowledge it as accepted residual risk for the operator-local context the way SEC-7 recommends.
- **Recommendation:** Add a one-sentence accepted-residual-risk acknowledgement in the Path Safety section (e.g., "The realpath-prefix check and the subsequent atomic rename are not performed under a lock; the TOCTOU window is accepted as residual risk for an operator-local tool matching the same boundary as `lib/build-state.mjs`."). Mirrors the SEC-7 recommendation from the sibling review.

### Finding SEC-3

- **Severity:** suggestion
- **Category:** data-exposure
- **Location:** Visual Expectations (`--pipeline` stdout table truncation rule); Visual Expectations (lifecycle markdown header / footer); Behaviors `adev status --render` clause.
- **Finding:** The `--pipeline` stdout table renders `spec` path values truncated to 40 chars. The `<slug>.md` header and footer embed the full source path. For an operator who has configured `tasks.db_path` to a path outside the project (e.g., `/Users/alice/work/sharedstate/`), that absolute path is emitted into the generated header comment and into stdout. Matches the path-leakage pattern noted as SEC-3 (suggestion, carried forward) in the `milestones-migration` review. Not a vulnerability in the operator-local threat model, but the spec doesn't explicitly document this as acceptable.
- **Recommendation:** Document in the Path Safety or Visual Expectations section that absolute storage-root paths may appear in generated headers and pipeline output, and that this is acceptable for operator-local tooling. Align with the milestones-migration SEC-3 resolution disposition (document as acceptable or sanitize to project-relative paths).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**Reviewer-summary note:** The reviewer's body included one CON-4 finding tagged `blocker` in its severity field, but the same finding's recommendation and the reviewer's own final summary explicitly retracted that severity ("This is not a naming/pattern violation, but a sequencing risk… The spec itself is correct; the risk is procedural" / "Final Summary: No blocker findings"). The intent was clearly a non-blocking sequencing recommendation aimed at `/adev:plan`, not a contract mismatch. The finding is preserved below as a **suggestion** with the original severity-tag discrepancy noted for transparency.

### Finding CON-1 (resolved-by-construction)

- **Severity:** suggestion (informational — no action required)
- **Category:** naming
- **This Spec:** Naming Conventions section preserves the Issue field mix (camelCase + snake_case: `id`, `title`, `status`, `epicId`, `spec_ref`, `next_action`) and Epic fields (snake_case `plan_ref`) verbatim from `json-issue-board-adapter.spec.md`.
- **Conflicts With:** None. Consistent with siblings and documented explicitly.
- **Recommendation:** No action required.

### Finding CON-2 (resolved-by-construction)

- **Severity:** suggestion (informational — no action required)
- **Category:** naming
- **This Spec:** Naming Conventions section confirms StateProjection fields use camelCase (`currentStep`, `currentTask`, `planTasks`, `startedAt`, `updatedAt`, `unknownEvents`).
- **Conflicts With:** `lifecycle-event-log.spec.md` Naming Conventions confirms identical field names and case. Aligned.
- **Recommendation:** No action required.

### Finding CON-3 (resolved-by-construction)

- **Severity:** suggestion (informational — no action required)
- **Category:** naming
- **This Spec:** CLI Flag definitions (`--render`, `--pipeline`, both boolean) reference `adev migrate --dry-run` and `--provider <value>` as precedent.
- **Conflicts With:** `one-shot-migration-tool.spec.md` CLI Surface confirms `--dry-run` boolean and `--artifact=<value>` key-value form. The target spec correctly follows existing boolean flag style.
- **Recommendation:** No action required.

### Finding CON-4

- **Severity:** suggestion (originally tagged `blocker` by the reviewer; demoted per reviewer's own recommendation body and final summary, see reviewer-summary note above)
- **Category:** contract / sequencing
- **This Spec:** The Behavioral Contract, Naming Conventions, and Acceptance Criteria assert `parseTasksMd(renderTasksMd(board)) ≡ board` round-trip property.
- **Conflicts With:** `json-issue-board-adapter.spec.md` SA-3 defines `parseTasksMd()` in a newly extracted module `lib/issues/markdown-parser.mjs`. The contracts are aligned; risk is procedural — if the renderer is implemented before the parser extraction in the sibling spec lands, the round-trip property test cannot run.
- **Recommendation:** Procedural recommendation for `/adev:plan`: extract `lib/issues/markdown-parser.mjs` (and its tests) **before** implementing the markdown renderer. The spec itself is correct; this is a planning/sequencing note, not a spec defect.

### Finding CON-5

- **Severity:** warning
- **Category:** contract
- **Location:** Path Safety section, item 2 (line 47: `writeTasksMd(projectRoot)` resolves the storage root via `resolveStorageRoot(manifest, projectRoot)`).
- **This Spec:** Documents resolution via `resolveStorageRoot` but does not state the existing-directory precondition that sibling specs declare.
- **Conflicts With:** `one-shot-migration-tool.spec.md` and `milestones-migration.spec.md` (rev 2 SEC-1 resolution) both require the resolved storage root to satisfy `fs.statSync(...).isDirectory() === true` and throw `INVALID_STORAGE_PATH` if not.
- **Recommendation:** Add to Path Safety section item 2: "The resolved storage root MUST satisfy `fs.statSync(resolvedStorageRoot).isDirectory() === true` before any read or write. If `resolveStorageRoot` returns a non-existent path or `tasks.db_path` points outside the project, throw `INVALID_STORAGE_PATH` before attempting to write." Reference `milestones-migration.spec.md` rev 2 for the precedent.

### Finding CON-6

- **Severity:** warning
- **Category:** pattern
- **Location:** Path Safety section, item 7 (line 52: atomic-write parity); Behaviors line on atomic-write failure (around line 223).
- **This Spec:** References "best-effort `fs.unlinkSync` cleanup on the failure path" without addressing what happens if the `unlinkSync` itself throws.
- **Conflicts With:** `json-issue-board-adapter.spec.md` Postconditions (CON-6 resolution) and `one-shot-migration-tool.spec.md` both pin the contract: temp file is best-effort unlinked via `fs.unlinkSync(tempPath)` **swallowing errors**; the underlying `fs` error is rethrown.
- **Recommendation:** Clarify the Behaviors clause: "When an atomic write fails at the rename step, the temp file is best-effort unlinked via `fs.unlinkSync(tempPath)` (swallowing errors); the underlying `fs` error is rethrown."

### Finding CON-7 (informational)

- **Severity:** suggestion (no action required)
- **Category:** pattern
- **This Spec:** Lines 54–112 define the 6-rule escape pipeline.
- **Conflicts With:** None. Aligns with the SEC-5 deferral resolution. Detailed and internally consistent.

### Finding CON-8

- **Severity:** suggestion
- **Category:** contract
- **Location:** Path Safety item 6 (line 51) — 50 MB source cap; Error Cases — `OVERSIZED_LOG_SKIPPED`.
- **This Spec:** Caps `<slug>.jsonl` at 50 MB and names the advisory `OVERSIZED_LOG_SKIPPED`.
- **Conflicts With:** `lifecycle-event-log.spec.md` Acceptance Criteria and Error Cases reference a `LOG_TOO_LARGE` cap with the same 50 MB threshold. Different name because the rendering layer skips and continues, whereas the write-time check hard-blocks.
- **Recommendation:** Add a note (e.g., in Path Safety item 6) cross-referencing `lifecycle-event-log.spec.md` for the canonical cap and clarifying that `OVERSIZED_LOG_SKIPPED` is the renderer's variant of the foundation's `LOG_TOO_LARGE` — same artifact, same cap, different recovery posture (skip vs. block).

### Finding CON-9 (informational)

- **Severity:** suggestion (no action required)
- **Category:** pattern
- **This Spec:** Lines 25, 117, 185–186, 225–226 assert that `adev status --render` is operator-on-demand only and no SKILL.md invokes it autonomously.
- **Conflicts With:** None. Aligns with charter foundational principle ("markdown is rendered, never authoritative").

### Finding CON-10 (informational)

- **Severity:** suggestion (no action required)
- **Category:** naming
- **This Spec:** Lines 35–36 note that `plan_tasks` (snake_case, event-level field) is renamed to `planTasks` (camelCase, StateProjection field) "correcting CON-2."
- **Conflicts With:** `lifecycle-event-log.spec.md` Naming Conventions agrees explicitly. Internally consistent.

---

## Summary

**Total findings:** 14 (0 blockers, 6 warnings, 8 suggestions)

**Warnings:**
- SA-1 — `_read` cross-module coupling on a private member
- SA-2 — `--render` exit-code semantics underspecified for partial failures
- SA-3 — composite `--render` + `--pipeline` exit code rule depends on SA-2
- SEC-1 — HTML-comment `-->` injection in generated header `source` interpolation
- CON-5 — missing `fs.statSync(...).isDirectory()` storage-root existence check (sibling-spec precedent)
- CON-6 — atomic-write cleanup error-swallowing contract incomplete

**SEC-5 deferral closed:** This spec resolves the free-text escaping deferral carried forward from `lifecycle-event-log.review.md` and `milestones-migration.review.md`. No further carry-forward.

**Action required:** None blocking. The six warnings can be addressed in a rev-2 spec update (small textual additions) or carried into the implementation plan as remediation tasks. Suggestions can be addressed at the spec author's discretion or rolled into the plan.

**Status:** PASS_WITH_NOTES — spec is ready for planning. `/adev:plan --spec markdown-rendering-layer.spec.md` may proceed.
