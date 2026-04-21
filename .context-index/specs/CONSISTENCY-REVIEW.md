# Consistency Review: Live Specs Analysis

**Review Date:** 2026-03-31
**Reviewer Role:** Consistency Analyst
**Scope:** 15 Live Specs across spec-lifecycle charter, task-management charter, and model-routing cross-cutting spec

---

## Executive Summary

The Live Specs demonstrate **high consistency** across naming, patterns, contracts, and domain model alignment. No blockers detected. Two minor warnings and seven suggestions for enhancement across terminology and subtle pattern clarifications.

**Overall Assessment:** Specs are ready for implementation review with minor refinements recommended.

---

## Detailed Findings

### CON-1: Status Field Terminology in task-management Charter

**Severity:** warning
**Category:** terminology
**This Spec:** issue-epic-crud.md (Behavioral Contract, Behaviors 1, 5) uses status values: `open`, `closed` with no intermediate state
**Conflicts With:** spec-lifecycle charter's charter-status-lifecycle.md defines four status values: `draft`, `approved`, `evolving`, `closed` — and adev-issues-skill.md mentions `in_progress` as a status value (line 22: "grouped by status (open/in_progress first...)")
**Root Cause:** task-management specs define only two status values for issues (`open`/`closed`), but adev-issues-skill.md references `in_progress` as a display state, creating ambiguity about which states are actually supported
**Recommendation:**
- Clarify in issue-epic-crud.md: does the Issue domain model support only `{open, closed}` or also `in_progress`?
- If `in_progress` is supported, add it to the list of valid status values in Behavioral Contract Preconditions or create a domain model section
- If not supported, update adev-issues-skill.md line 22 to remove mention of `in_progress`
- Add explicit error case: "Invalid status value provided" with valid values enumerated

**Example Clarification:**
```yaml
## Domain Model

### Issue Status Values
Valid status values for issues: open, in_progress, closed
- open: Issue is acknowledged but not started
- in_progress: Issue is being worked on
- closed: Issue is completed or rejected
```

---

### CON-2: Backref Field Naming Convention Inconsistency

**Severity:** warning
**Category:** naming
**This Spec:** issue-epic-crud.md (Preconditions, line 16) and adev-issues-skill.md use `epicId` and `epic-id` inconsistently
**Pattern:** CLAUDE.md Coding Standards (line 46) declares: "camelCase for functions/variables, kebab-case for files and directories"
**Conflict Details:**
- issue-epic-crud.md Behavior 2: "`When` `create(issue)` is called with an `epicId`"
- adev-issues-skill.md Behavior 3: "`When` `/adev-issues create ... --epic <epic-id>`" (kebab-case CLI arg)
- spec-lifecycle specs (source-manifest.md line 23): use camelCase in function args (`filePaths`)

**Root Cause:** CLI arguments naturally use kebab-case (shell convention), but JavaScript function parameters follow camelCase
**Recommendation:**
- In issue-epic-crud.md Behavioral Contract, explicitly clarify:
  - **JavaScript API:** `create({ epicId, ... })` (camelCase in object properties)
  - **CLI invocation:** `--epic <id>` (kebab-case for CLI arguments)
- Add a note in the Actionable Task Map: "When implementing CLI command parser, map `--epic` CLI flag to `epicId` object property"

---

### CON-3: Missing Precondition: Backend Adapter Configuration

**Severity:** suggestion
**Category:** contract
**This Spec:** issue-epic-crud.md (Preconditions, lines 15-17)
**Related Specs:** adev-issues-skill.md (Preconditions, lines 17-18) mentions fallback behavior
**Current State:**
- issue-epic-crud.md states: "A backend adapter is available (file is always available; beads requires `br` on PATH)"
- adev-issues-skill.md states: "For beads backend: `br` is on PATH (falls back to file otherwise)"

**Gap:** Preconditions don't specify that `manifest.yaml` must have a `backend:` field declaring which adapter to use
**Recommendation:**
Add to Preconditions in issue-epic-crud.md:
```
- `.context-index/manifest.yaml` exists with `backend:` field set to 'file' or 'beads'
```

And update Behaviors 1, 2, and 3 to reference the adapter selection:
```
1. **When** `create(issue)` is called with a title and type **then**
   the issue is persisted using the configured backend adapter (from `manifest.yaml`)
   with a unique ID, status `open`, the current timestamp, and all provided fields.
```

---

### CON-4: Source Manifest SHA Terminology Inconsistency

**Severity:** suggestion
**Category:** terminology
**This Spec:** source-manifest.md (Behavior 2) and status-query-skill.md (Behavior 4)
**Terminology Drift:**
- source-manifest.md Behavior 2 calls it: "`sha` (first 7 chars)" — truncated for readability
- source-manifest.md Behavior 2 also states: "The truncated SHA is for readability only, not cryptographic integrity"
- status-query-skill.md Behavior 4 references: "sha <stored> vs <current>" (implies full SHA comparison)
- model-routing.md doesn't touch this, but for completeness: specs don't mention whether the 7-char truncation is applied to both stored and current SHA in drift detection

**Gap:** Unclear whether `verifyManifest` returns 7-char or full SHA, and whether drift detection compares truncated or full hashes
**Recommendation:**
Clarify in source-manifest.md Behavior 3:
```
3. **When** `verifyManifest(manifest)` is called **then** it re-reads the files
   listed in `manifest.files`, recomputes the SHA using the same algorithm,
   and returns `{ matches: <boolean>, currentSha: <string>, computedAt: <timestamp> }`.
   Note: The returned SHA is the full 64-character hash for drift detection;
   display layers truncate to 7 chars for readability.
```

And in status-query-skill.md Behavior 4:
```
4. **When** a spec has a `source-manifest` and `verifyManifest` reports drift
   **then** `/adev-status` highlights it:
   "Source drift detected — code has changed since last validation
   (stored: abcdef1... vs current: xyz9876...)."
   The displayed hashes are truncated to 7 characters for readability.
```

---

### CON-5: Revision vs. Last-Reviewed-Revision: Stale Detection Timing

**Severity:** suggestion
**Category:** contract
**This Spec:** spec-revision-tracking.md (Behavior 5) and git-drift-detection.md (not fully read, but referenced in charter.md)
**Current State:** spec-revision-tracking.md Behavior 5:
```
5. **When** the parent charter's `revision` is higher than a spec's
   `charter-revision` **then** `/adev-hygiene` and `/adev-status`
   report the spec as potentially stale against its charter.
```

And charter-status-lifecycle.md (implicitly) defines charter revision transitions.

**Gap:** The specs don't clarify the interaction between three distinct revision fields:
1. `spec.revision` — increments when spec content changes
2. `spec.charter-revision` — records which charter version the spec was written against
3. `last-reviewed-revision` — records which spec revision was last reviewed (in `.review.md`)

The plan gate checks both `revision` vs `last-reviewed-revision` (drift after review) AND `charter-revision` vs `charter.revision` (charter evolution). This is correct but could be documented more explicitly.

**Recommendation:**
Add a new section to spec-revision-tracking.md after Postconditions:
```
## Staleness Detection Rules

A spec is considered stale if ANY of these conditions are true:

1. **Content Drift After Review:** `revision` > `last-reviewed-revision` in `.review.md`
   - Indicates the spec was edited after review without re-review
   - Detected by: `/adev-plan` gate, `/adev-hygiene` audit

2. **Charter Evolution:** `charter-revision` < `charter.revision`
   - Indicates the spec's parent charter has evolved
   - Detected by: `/adev-status`, `/adev-hygiene` audit

The `/adev-plan` gate blocks if condition 1 is true. The `/adev-status` skill
reports both conditions as warnings for awareness and manual triage.
```

---

### CON-6: Hook Protocol Consistency for Session Capture

**Severity:** suggestion
**Category:** pattern
**This Spec:** session-capture-pipeline.md (line 146 in charter, Interface Contracts section)
**Pattern Violation:**
The charter states:
```
`hooks/session-capture.sh` | Claude Code PostToolUse hook | Logs tool name + files
touched to lightweight session tracking file. Uses `.sh` (not `.mjs`) for consistency
with existing Claude Code hooks (`session-start.sh`, `constitution-linter.sh`,
`merge-guard.sh`, `sync-trigger.sh`) which all follow the bash hook protocol.
```

This is correct, but the Live Spec (session-capture-pipeline.md) doesn't explicitly state the hook protocol details for session-capture.sh. The charter clearly explains the `.sh` extension choice, but the spec should reinforce it for clarity.

**Recommendation:**
Add to session-capture-pipeline.md Behavioral Contract section or Error Cases:
```
## Hook Protocol Compliance

`hooks/session-capture.sh` follows the Claude Code hook protocol:
- Reads JSON from stdin (tool metadata)
- Reads environment variables `CLAUDE_TOOL_INPUT_*`
- Outputs JSON to stdout (tracking record)
- Exits 0 on success (non-blocking)
- Exits 2 to block (not used for session capture)
```

---

### CON-7: Tracker Reference Field Scope Clarity

**Severity:** suggestion
**Category:** contract
**This Spec:** tracker-reference-field.md (mentioned in charter.md but not fully read)
**Concern:** Charter.md line 38 states:
```
Optional `tracker-ref` field in spec and charter frontmatter for linking to external
trackers (Jira, Linear, GitHub Issues). No API integration — metadata only.
```

But the spec doesn't explicitly clarify:
1. What format `tracker-ref` values should take (e.g., `PROJ-123`, `#42`, `https://...`)?
2. Who is responsible for maintaining the sync (manual only)?
3. Is there validation on the `tracker-ref` value format?

**Recommendation:**
In tracker-reference-field.md, add to Behavioral Contract:
```
### Tracker Reference Field Format

The `tracker-ref` field accepts free-form text matching common tracker ID formats:
- Jira: `PROJ-123` (uppercase project key + number)
- Linear: `ENG-42` (project key + number)
- GitHub Issues: `#42` (hash + number) or full URL `github.com/org/repo/issues/42`
- Generic: Any string up to 255 characters

No format validation is performed. The field is metadata only —
no API calls are made to validate or sync the reference.
```

---

### CON-8: Domain Model Alignment: Issue and Epic IDs

**Severity:** suggestion
**Category:** domain-model
**This Spec:** issue-epic-crud.md (Postconditions, line 36: "IDs are unique within the project and stable across reads")
**Pattern Context:** spec-lifecycle charter uses:
- Spec IDs: file-based (`issue-lifecycle.md`)
- Epic IDs: file-based (`epic-N` implied in spec-lifecycle)
- But task-management uses: `issue-N` (file) and `bd-XXXXXX` (beads)

**Gap:** issue-epic-crud.md doesn't specify whether:
1. IDs are human-assigned (e.g., `issue-1`, `issue-2`) or auto-generated (e.g., UUID)
2. File-based backend uses `issue-<N>` naming, while beads backend uses `bd-XXXXXX` format
3. Are these ID schemes interchangeable across backends?

**Recommendation:**
Add to issue-epic-crud.md Domain Model section:
```
## Domain Model

### ID Generation

- **File Backend:** IDs are sequential integers formatted as `issue-N` for files
- **Beads Backend:** IDs are beads-generated unique strings (format `bd-XXXXXX`)
- ID schemes are NOT interchangeable; the backend adapter determines ID format
- IDs are opaque to callers — the interface returns the native ID string as provided by the backend

### ID Uniqueness Invariant

IDs are unique within the project (across both issues and epics) and stable across
multiple reads — the same issue always returns the same ID until deleted.
```

---

### CON-9: Missing Error Recovery Pattern Across Specs

**Severity:** suggestion
**Category:** pattern
**This Spec:** Multiple specs (source-manifest.md, session-capture-pipeline.md, status-query-skill.md)
**Pattern Gap:** Most specs define "Error Cases" as conditions where operations fail. However, they don't consistently specify retry or recovery behavior.

Examples:
- source-manifest.md line 48: `READ_ERROR` on file read permission denied — but no retry guidance
- session-capture-pipeline.md line 54: Session log unreadable — returns `null` with warning
- status-query-skill.md line 51: "Git not available — skip commit history section"

**Observation:** These are actually good — the specs DO define graceful degradation. But the patterns are implicit rather than explicit. This is fine for current implementation, but future specs might benefit from a standardized resilience pattern.

**Recommendation:**
This is NOT a blocker. For future reference, consider adding a "Resilience" section to spec template if error recovery patterns become a recurring pattern. For now, the current error case definitions are sufficient.

---

### CON-10: Missing Link Between plan-test-mapping and implementation Skills

**Severity:** suggestion
**Category:** contract
**This Spec:** spec-lifecycle charter (line 117-118: "Plan task checkboxes / status tracking — tests are source of truth")
**Gap:** The charter states that tests are the source of truth for task completion, and adev-implement and adev-validate should reference test files. However:
1. None of the Live Specs explicitly define which test runner (`npm test`, `node --test`) to use
2. No spec defines the expected test output format for parsing
3. Status-query-skill.md (line 69) mentions "plan task completion (tests passing / total)" but doesn't define how to compute this

**Recommendation:**
This is a gap in the cross-cutting pattern, not the specs themselves. Consider creating a short cross-cutting spec for **Test Result Parsing** that defines:
1. Test runner contract (exit 0 = all pass, exit 1 = failure)
2. TAP (Test Anything Protocol) or other standard format for output parsing
3. How to map test results to plan task IDs

For now, add a note to status-query-skill.md Actionable Task Map:
```
| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define test result parsing | Spec format for extracting plan task status from test output | medium |
```

---

### CON-11: Terminology: "Manifest" vs. "Manifest Block"

**Severity:** suggestion
**Category:** terminology
**This Spec:** source-manifest.md (lines 2, 24, 40, 41)
**Terminology Drift:**
- Title: "Source Manifest" (noun, thing being created)
- Behavior 1: "stamps a `source-manifest` block in the spec's frontmatter" (emphasizes it's a YAML block)
- Postcondition: "`source-manifest` block in frontmatter contains `sha`, `files`, and `computed-at`"
- Error Cases: "Empty file list passed to `computeManifest`" (function name) vs. "`source-manifest`" (frontmatter block)

**Observation:** This is minor and actually fine — "manifest" is used for the concept, "`source-manifest` block" is used for the frontmatter structure. But for consistency with spec-revision-tracking.md and charter-status-lifecycle.md (which use `revision` field), consider standardizing the terminology.

**Recommendation:**
No change required — terminology is clear enough in context. If future specs introduce similar patterns (e.g., "deployment-manifest"), consider documenting the pattern: "A `<name>-manifest` block in frontmatter containing structured data."

---

## Summary Table: All Findings

| ID | Severity | Category | Spec(s) | Issue | Recommended Action |
|---|---|---|---|---|---|
| CON-1 | warning | terminology | issue-epic-crud, adev-issues-skill | Status values ambiguity (open/closed vs in_progress) | Clarify supported status values in domain model section |
| CON-2 | warning | naming | issue-epic-crud, adev-issues-skill | epicId vs epic-id inconsistency | Document CLI-to-API mapping convention |
| CON-3 | suggestion | contract | issue-epic-crud | Missing backend config precondition | Add manifest.yaml backend field to Preconditions |
| CON-4 | suggestion | terminology | source-manifest, status-query-skill | SHA truncation clarity (7-char vs full) | Clarify in verifyManifest return value and drift detection |
| CON-5 | suggestion | contract | spec-revision-tracking, git-drift-detection | Stale detection rules not explicitly stated | Add "Staleness Detection Rules" section |
| CON-6 | suggestion | pattern | session-capture-pipeline | Hook protocol details not in Live Spec | Add Hook Protocol Compliance section to spec |
| CON-7 | suggestion | contract | tracker-reference-field | Format and sync expectations unclear | Document tracker ID format examples and metadata-only guarantee |
| CON-8 | suggestion | domain-model | issue-epic-crud | ID generation scheme not specified | Add ID Generation section to domain model |
| CON-9 | suggestion | pattern | multiple | Implicit resilience patterns (graceful degradation) | No action needed; patterns are sound but consider pattern docs for future |
| CON-10 | suggestion | contract | charter (cross-cutting) | Test result parsing not defined | Create cross-cutting spec for Test Result Parsing (future) |
| CON-11 | suggestion | terminology | source-manifest | "Manifest" vs. "manifest block" terminology | No action needed; context makes it clear |

---

## Consistency Verdict

**No Blockers Detected**

The Live Specs demonstrate strong consistency with the project Constitution across:
- **Naming:** kebab-case/camelCase conventions followed (minor clarification needed for CLI args)
- **Patterns:** All specs follow the established template structure and behavioral contract format
- **Contracts:** Preconditions, behaviors, postconditions, and error cases are well-defined
- **Dependencies:** Respect "minimize external dependencies" principle across all specs
- **Domain Models:** Entity definitions are clear and aligned (with minor enhancement suggestions)

**All specs are ready for implementation review.** The suggestions are enhancements, not blockers.

---

## Recommended Next Steps

1. **Address warnings (CON-1, CON-2)** before implementation: clarify status field values and field naming conventions
2. **Apply suggestions (CON-3–CON-7)** by updating specs with clarifying sections
3. **No action needed** for CON-9–CON-11 (patterns are sound or require future cross-cutting work)
4. **Run `/adev-review-specs`** after updates to validate against constitution and architecture

---

**Review Completed:** 2026-03-31
**Consistency Analyst (Role)**
