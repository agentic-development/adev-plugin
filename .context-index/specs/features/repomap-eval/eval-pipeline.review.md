# Architecture Review: eval-pipeline

> **Date:** 2026-03-23
> **Spec:** .context-index/specs/features/repomap-eval/eval-pipeline.md
> **Charter:** .context-index/specs/features/repomap-eval/charter.md
> **Verdict:** PASS_WITH_NOTES

## Structural Architect

**Verdict:** PASS_WITH_NOTES (after fixes)

Original blockers (RESOLVED):
- SA-1: Missing ADR for typescript → Fixed: ADR task added to task map, noted in preconditions
- SA-4: No way to force parser mode → Fixed: `--mode` flag added as precondition and task

Remaining warnings (accepted):
- SA-2 (warning): Parser invocation details → Fixed: spec now specifies `--mode` flag and output paths
- SA-3 (warning): Regex mode repo-map.md parsing → Fixed: dedicated parse-repomap.mjs task added
- SA-5 (suggestion): Ground truth generator unit tests → Fixed: unit test task expanded to cover generator
- SA-6 (suggestion): Cache directory postcondition → Fixed: clarified in postconditions

## Security Reviewer

**Verdict:** PASS_WITH_NOTES (after fixes)

Original blockers (RESOLVED):
- SEC-6: Command injection via unsanitized repos.json → Fixed: cloner task explicitly requires execFile/spawn with array args

Remaining warnings (accepted as addressed):
- SEC-1 (warning): URL scheme validation → Fixed: precondition requires https:// only
- SEC-2 (warning): Path traversal via repo name → Fixed: acceptance criterion added for name sanitization
- SEC-3 (warning): Unbounded recursive delete → Fixed: acceptance criterion for cache path verification

Suggestions (noted):
- SEC-4: .cache/ gitignore → Fixed: gitignore task added
- SEC-5: Full SHA for git refs → Fixed: precondition requires full 40-char SHA
- SEC-7: Repo count cap → Deferred, low risk for local tool

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES (after fixes)

Original blockers (RESOLVED):
- CON-2: web-tree-sitter listed as own precondition → Fixed: reworded to reference repomap module's responsibility

Remaining warnings (accepted):
- CON-1 (warning): tests/evals/ directory convention → Intentional, documented separation from npm test
- CON-3 (warning): symbol-ranks.json matching contract → Fixed: file path normalization specified
- CON-4 (warning): repo-map.md parsing strategy → Fixed: dedicated parse-repomap.mjs task with format documented

Suggestions (noted):
- CON-5: Edge metrics nullable for regex → Noted, will handle in compare.mjs
- CON-6: Regex mode forcing mechanism → Fixed: --mode flag
- CON-7: <repo> derived from name field → Fixed: clarified in postconditions

---

## Summary

**Total findings:** 19 (3 blockers resolved, 9 warnings addressed, 7 suggestions noted)
**Action required:** None — all blockers resolved, spec updated. Ready for planning.

last-reviewed-revision: 1
file-sha: 64581d48ca9d60cae96d97ae78e23a63cdfa524f
