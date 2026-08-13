# Blockers: gaming-detector-gate-enforcement (revision 1)

| blocker_id | reviewer | section_anchor | summary |
|------------|----------|-----------------|---------|
| SA-1 | structural-architect | scope-decision-regression-only-not-whole-file | PostToolUse hooks in this repo are advisory-only (exit 0 always, per docs/hooks.md:173) — cannot implement the spec's "hard, non-bypassable block". Requires switching to a PreToolUse hook that reconstructs post-edit content before the write lands. |
| SA-2 | structural-architect | behaviors | `detectTaskStrategy([filePath])` never resolves to `integration` for any real test-file path in this repo — it is keyed to production-source path conventions, not test paths. Requires a dedicated test-file integration-path heuristic. |
| SEC-1 | security-reviewer | actionable-task-map | `detectSharedGamingPatterns`'s 500KB size cap silently skips oversized files (`skipped: true`, zero violations) — a deterministic, undocumented bypass of a hook billed as non-bypassable. Requires calling each pattern's `.detect()` directly instead of the size-capped wrapper, and stating this explicitly. |

Resolved in revision 2 (see spec's revision-history comment block and this file's successor `.review.md`).
