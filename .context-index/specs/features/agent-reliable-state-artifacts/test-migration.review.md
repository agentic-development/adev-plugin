# Architecture Review: test-migration

> **Date:** 2026-05-12
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** f5df7f0b3321a1dedfa884869fe2d29a4ef601e9

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### SA-1 — suggestion

**Location:** Behaviors row 5 / Postconditions bullet 3 / Acceptance Criteria #4 / Error Cases row 4

**Finding:** The grep regex `\b1[234]-column\b` may not match the literal strings `12-column`, `13-column`, `14-column` reliably because of `\b` boundary semantics around the `-` character. More importantly, the spec does not specify *where* the architectural test scans (whole repo? `tests/` only? `lib/` too?) nor whether matches inside comments vs. strings are differentiated.

**Recommendation:** Pin the search scope explicitly (e.g., "scans `tests/` and `lib/` recursively, excludes `node_modules`, `.git`, and the legacy-read regression block identified by surrounding `describe` label"). Specify whether the test is a textual grep or a structural exclusion (e.g., by detecting the `describe("legacy-read regression (markdown adapter sunset)")` block and excluding its line range).

### SA-2 — warning

**Location:** Behaviors row 4 / Acceptance Criteria #2 / Error Cases row 2 (non-numeric version rejection)

**Finding:** The spec asserts the non-numeric `version` rejection test should assert the *fixed-string fallback message* per SEC-4, but does not specify the exact fallback message string. Without coupling the assertion to a canonical constant, the test will either duplicate a hard-coded literal that may drift, or pass by accident.

**Recommendation:** Either (a) reference the canonical constant by name (e.g., "asserts `err.message === MSG_UNSUPPORTED_NON_NUMERIC` exported from `lib/issues/json-adapter.mjs`"), or (b) cite the exact string from the sibling spec to anchor the contract.

### SA-3 — warning

**Location:** Behaviors row 3 (`version: 3` forward-compatibility) / Acceptance Criteria #3

**Finding:** The forward-compat behavior asserts that reads of `version: 3` succeed and writes re-emit `version: 2`. The sibling spec (`json-issue-board-adapter.spec.md` line 117) preserves "unknown additional fields on epics/issues" — but the test spec's acceptance criterion does not address unknown *top-level* keys (peer to `epics`/`issues`). A future `version: 3` file may carry top-level metadata that gets silently dropped.

**Recommendation:** Add an explicit acceptance criterion (or behavior row) covering unknown top-level keys: do they survive round-trip, or are they dropped? The contract should be made explicit so future-version files don't silently lose top-level metadata.

### SA-4 — suggestion

**Location:** Behaviors row 6 / Postconditions / Acceptance Criteria #5

**Finding:** The legacy-fixture-leak inventory test asserts no fixture under `tests/lib/` (excluding allowed paths) contains the literal strings `.execution-state.md`, `milestones.yaml`, or the pre-rename `build-state/` path. The contract is purely substring-based — a test file that incidentally mentions one of these strings in a comment would fail, while a fixture asserting against the markdown shape without naming the file would pass.

**Recommendation:** Tighten the assertion scope — match against fixture/expected-value content, not arbitrary file content. Alternatively, explicitly allow these strings in comment lines, or specify that the test scans `.fixture.*` files and `expected` fixture directories only.

### SA-5 — suggestion

**Location:** Notes / Postconditions bullet 1 / Acceptance Criteria last bullet

**Finding:** The follow-up obligation that the legacy-read regression block must be deleted in the same commit that removes `tasks.backend: file` is cross-commit coupling encoded only in prose. Nothing structurally prevents the markdown-adapter removal from landing without simultaneously deleting the regression block.

**Recommendation:** Either (a) tighten the architectural grep test so it *also* fails when `tasks.backend: file` is removed from `lib/issues/registry.mjs`'s `SUPPORTED_BACKENDS` but the regression block still exists, or (b) accept this as documentation-only and remove the "in the same commit" framing in favor of "as part of the markdown-adapter removal PR."

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No findings.

Rationale: scope is test code and fixtures only — no endpoints, write paths, network surfaces, secret handling, or external interfaces. The SEC-4 invariant from `json-issue-board-adapter.spec.md` is preserved (Behaviors row 4, Error Cases row 2, AC #5). Redaction commitments from `one-shot-migration-tool.spec.md` are unaffected — migration-tool fixtures stay isolated under `tests/lib/migrate-state-artifacts.*`. The architectural grep test and legacy-fixture-leak inventory reduce, not increase, attack surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-1 — warning — contract

- **This Spec:** Behaviors row 3 / Acceptance Criteria #3 prescribes a `version: 3` forward-compat test where the adapter "reads succeed, unknown fields are preserved, and writes re-emit `version: 2` plus the preserved unknown fields."
- **Conflicts With:** `json-issue-board-adapter.spec.md` line 112 ("Writers always emit `version: 2` regardless of the version read on the input file (SA-5)") combined with line 117 ("Readers parse files with `version >= 2`; unknown additional fields on epics/issues are preserved on read and re-emitted on write") leaves the round-trip downgrade-on-write semantics ambiguous. A `version: 3` file may legitimately carry semantics the `version: 2` writer doesn't understand; silently rewriting as `version: 2` is one plausible reading but not explicitly stated.
- **Recommendation:** Either (a) the adapter spec should explicitly state that `version` is normalized to `2` on write even when the input was higher, OR (b) this spec's AC should be softened to assert "writers emit `version: 2`" without specifically asserting that a `version: 3` read round-trips to `version: 2`. Resolve in the adapter spec; align this spec's AC after.

### CON-2 — warning — pattern (fragile reference)

- **This Spec:** Actionable Task Map row "Collapse column-variant tests..." names "the three tests at `tests/lib/issues/markdown-parser.test.mjs:61,85,100`."
- **Conflicts With:** No sibling spec hardcodes file:line references for tests. Sibling specs (`lifecycle-event-log.spec.md`, `one-shot-migration-tool.spec.md`) list test files by path only, never by line number.
- **Recommendation:** Drop the `:61,85,100` line numbers. Reference the tests by `describe`/`it` name or parser-variant label (12/13/14-column). Line numbers drift with the next edit and will silently invalidate the spec.

### CON-3 — suggestion — terminology

- **This Spec:** Coins "legacy-variant test" (Naming Conventions) distinct from "legacy-read regression test."
- **Conflicts With:** No sibling defines "legacy-variant"; the term is novel. The charter (line 45) uses "format-evolution tests" and `json-issue-board-adapter.spec.md` line 82 uses "parser-variant branches."
- **Recommendation:** Acceptable as a local term, but consider contrasting in the Naming Conventions section with the charter's "format-evolution tests" phrasing.

### CON-4 — suggestion — naming

- **This Spec:** Uses lowercase `schema-version` in compound nouns ("schema-version test", "schema-version-rejection test"). Notes section uses "schema-version mechanism."
- **Conflicts With:** The adapter spec uses bare `version` (the JSON field name) throughout and never coins a hyphenated term.
- **Recommendation:** Low-priority. The compound noun is internally consistent; just confirm the Naming Conventions block makes clear that "schema-version test" is a test-category label, NOT a new field name.

### CON-5 — suggestion — pattern (out-of-scope claim)

- **This Spec:** Out of Scope: "Performance tests for the JSON adapter. Those are owned by `json-issue-board-adapter.spec.md`."
- **Conflicts With:** `json-issue-board-adapter.spec.md` does specify perf assertions for the JSON adapter — confirmed. No conflict on ownership.
- **Recommendation:** No change. Ownership claim is correct.

### CON-6 — suggestion — domain-model (legacy-issue scope)

- **This Spec:** Lists `tests/lib/issues-milestone*` and `tests/lib/issues/*` as "production-code tests" that "assert only against the JSON/JSONL on-disk shape" (Behaviors row 6).
- **Conflicts With:** `json-issue-board-adapter.spec.md` line 145 acknowledges *legacy* in-board issues with `planRef`+`planTask` are tolerated on read indefinitely (CON-3). A test verifying this read-tolerance must inspect the in-memory shape, not "the JSON on-disk shape" of fresh writes. The wording could be misread as forbidding tests for legacy-tolerance.
- **Recommendation:** Add a carve-out clarifying that read-tolerance tests for legacy `planRef`+`planTask` issues are permitted under `tests/lib/issues/*` and assert against parsed in-memory data, not against authored markdown/YAML fixtures.

---

## Summary

**Total findings:** 11 (0 blockers, 4 warnings, 7 suggestions)
**Action required:** Spec passes review with notes. The two contract-gap warnings (SA-2 message constant; SA-3 + CON-1 unknown-top-level-key semantics for `version: 3`) and the line-number warning (CON-2) should be addressed by either a small revision to this spec or a clarification to `json-issue-board-adapter.spec.md`. Planning can proceed; revisions can land alongside the implementation work.
