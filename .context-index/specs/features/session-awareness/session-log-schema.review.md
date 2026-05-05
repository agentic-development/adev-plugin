# Architecture Review: session-log-schema

> **Date:** 2026-04-06
> **Spec:** .context-index/specs/features/session-awareness/session-log-schema.spec.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** a23fd830577bee0999a240901fad1fcf7024a0eb

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-6** (warning) — **Behavior 5, Concurrent Writes:** The spec claims `appendFileSync` is "atomic at OS level" unconditionally. This is true for writes under the PIPE_BUF limit (~4KB), which JSONL lines will almost certainly stay under. **Recommendation:** Add qualifying note: "Atomic for individual lines under OS pipe-buffer size (typical JSONL lines are well under this limit)."

- **SA-7** (suggestion) — **Behavior 2:** "Tool has file_path" does not define the extraction source. Is it from `CLAUDE_TOOL_INPUT_*` env vars or stdin JSON? **Recommendation:** Clarify extraction source to match hook protocol.

- **SA-8** (suggestion) — **Schema, session_id:** "Optional/omitted" should clarify whether the key is absent or present with null. **Recommendation:** Already stated in Field Constraints ("Omitted, not null") — no action needed. (Note: the spec does cover this.)

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-6** (warning) — **Data Exposure:** The `files` field captures filenames touched per tool call. As a "public contract for external tools," external consumers would see paths to potentially sensitive files (`.env`, `secrets/`). **Recommendation:** Document that `files` contains paths only, not contents. Consider noting that sensitive path filtering is the consumer's responsibility.

- **SEC-7** (suggestion) — **Data Exposure:** `session_id` field — ensure it is a random UUID or omitted, not PIDs or sequential integers, to prevent cross-session correlation. **Recommendation:** Specify session_id format constraint (UUID or similar opaque identifier).

- **SEC-8** (suggestion) — **Configuration:** The provider gating reads from `manifest.yaml`, which is typically committed. Enabling/disabling session capture is visible in repo history. **Recommendation:** Document that this is a committed config file. No functional change needed.

## Consistency Analyzer

**Verdict:** PASS

No findings. Well-aligned with charter domain model (SessionLogEntry entity), constitution principles, and hook protocol compliance.

## Domain Specialists

No specialists registered. No domain specialist reviews dispatched.

---

## Summary

**Total findings:** 6 (0 blockers, 2 warnings, 4 suggestions)
**Action required:** Address SA-6 (qualify atomicity claim) and SEC-6 (document that files are paths only). Other findings are minor improvements.
