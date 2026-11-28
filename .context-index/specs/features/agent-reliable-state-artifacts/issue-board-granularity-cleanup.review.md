# Architecture Review: issue-board-granularity-cleanup

> **Date:** 2026-05-12
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/issue-board-granularity-cleanup.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 1
file-sha: 0fc0c2a0ce7d0d3386025c8cb38b88da439f1057

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- SA-1 · warning · "Dependency Edge Re-pointing" · Lookup predicate for the Feature Issue is informal: "feature-level Issue that shares the same `spec_ref`." Need explicit `type === 'feature'` AND `spec_ref` equality semantics; `MULTI_FEATURE_FOR_SPEC` tiebreak field unspecified. · **Recommendation:** State the lookup predicate explicitly — "Issue where `type === 'feature'` AND `spec_ref === <resolved-absolute-spec-path>` (after `path.resolve`); tiebreak by `Issue.updated` descending." Define behavior for relative vs. absolute `spec_ref`.
- SA-2 · warning · "Collapse Per-Task Issues" §4 · Fields silently dropped during collapse (`priority`, `epicId`, `created`, outbound `deps[]`). Charter's "Migration completeness" attribute says "All existing data appears in JSON output." · **Recommendation:** Either enumerate the dropped fields with rationale, or carry a `legacy_fields` open-schema annotation on the synthesized `plan_task` event to surface them.
- SA-3 · warning · "Collapse" §4 status mapping · "anything else → `pending` with `legacy status: <orig>`" collides with `notes` concatenation rule (Issue `notes` + `next_action`). Composition order undefined. · **Recommendation:** Define deterministic composition order — e.g., `"legacy status: <orig>"` prepended to the concatenated notes with `" | "` separator.
- SA-4 · warning · "Collapse" §6 manifest · `.context-index/.migration-state-artifacts.json` is referenced as "the same file the existing one-shot tool writes," but `one-shot-migration-tool.spec.md` does not define such a file. Idempotency in the sibling is target-presence-based, not manifest-based. · **Recommendation:** Reconcile — drop the manifest file in favor of target-presence idempotency (re-scan finds no per-task Issues ⇒ skip), or amend the sibling spec to declare this manifest.
- SA-5 · suggestion · "/adev:reconcile collapse-per-task-issues" · Semantics on partial state unclear (a board where some per-task Issues exist plus matching `plan_task` events already exist). · **Recommendation:** State explicitly that the operation reuses `collapsePerTaskIssues(projectRoot)` and inherits its idempotence; existing `plan_task` event whose `migrated_from_issue` equals the candidate short-circuits synthesis.
- SA-6 · suggestion · Acceptance Criteria · No criterion covers `MULTI_FEATURE_FOR_SPEC` and `PLAN_WITHOUT_SPEC` advisory paths end-to-end. · **Recommendation:** Add fixture ACs: (a) a spec with two feature-level Issues asserts deterministic selection; (b) a per-task Issue without a sibling spec asserts `PLAN_WITHOUT_SPEC` advisory + skip.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- SEC-1 · warning · input-validation · "Collapse" §4 `notes` field · Concatenation of operator-authored `Issue.notes + Issue.next_action` can embed `\n` — the JSONL record separator. A crafted `notes` containing `\n{"event":"manual_override",...}` could forge a fabricated event on read. · **Recommendation:** Require JSON-encoding via `JSON.stringify` on the whole event (natural with the lib), and state it explicitly. Add an AC: a fixture Issue whose `notes` contains an embedded `}\n{"event":` payload produces exactly one new line in the JSONL.
- SEC-2 · warning · data-integrity · "/adev:reconcile collapse-per-task-issues" · Multi-file mutation without a transactional boundary — crash between JSONL writes and `tasks.json` rewrite leaves the lifecycle logs with `migrated_from_issue` events whose source Issues still exist. · **Recommendation:** Specify failure semantics: pre-flight compute the plan, write all JSONL events, then rewrite `tasks.json` last; document that idempotence + `migrated_from_issue` short-circuit makes mid-crash recoverable on re-run. Add a crash-mid-repair AC.
- SEC-3 · suggestion · data-exposure · "Collapse" §6 manifest entry · `advisories` array may persist Issue-ID lists; future enhancements could log `notes` content. · **Recommendation:** Mirror `one-shot-migration-tool.spec.md` SEC-4 redaction: state that `advisories` carries codes (`PLAN_WITHOUT_SPEC`, `MULTI_FEATURE_FOR_SPEC`, `DROPPED_DEP`) plus IDs only — never `notes` or free-text Issue content.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- CON-1 · warning · contract · Synthesized events lack the `actor: 'migration/adev-cli'` convention used by `one-shot-migration-tool.spec.md`; `ts` ISO-8601 derivation also not explicit. · **Recommendation:** Add to §4: "Synthesized events carry `actor: 'migration/adev-cli'`; `ts` is the source Issue's `updated`/`created` in ISO-8601."
- CON-2 · warning · contract · `migrated_from_issue` is "new optional field on the `plan_task` variant." The open-schema rule in `lifecycle-event-log.spec.md` covers new `event` variants but is silent on adding fields to canonical variants. · **Recommendation:** Either clarify in this spec that the open-schema rule covers field-level additions (and amend `lifecycle-event-log.spec.md`), or use a prefix convention (e.g., `x_migrated_from_issue` or `_meta.migrated_from_issue`).
- CON-3 · warning · naming · `/adev:work` reference is internally consistent with the renamed skill, but the charter and `one-shot-migration-tool.spec.md` still mention older naming in places. · **Recommendation:** No change needed in this spec; flag for corpus-wide cleanup elsewhere.
- CON-4 · warning · contract · §5 "rewritten via the existing atomic write path" implies `JsonAdapter._write()`. The adapter's `BOARD_GRANULARITY_VIOLATION` enforcement is on `create`/`update`, not on wholesale `_write` — implicit assumption. · **Recommendation:** State that migration uses `JsonAdapter._write()` directly (bypassing create/update guards by design) or a privileged write path; add an AC that the rewrite succeeds without tripping the granularity guard mid-rewrite.
- CON-5 · suggestion · pattern · `.migration-state-artifacts.json` manifest claim mirrors SA-4 / SA-5 — no sibling spec owns this file. · **Recommendation:** Same as SA-4 — drop the manifest in favor of target-presence idempotency, or own it in the sibling spec.
- CON-6 · suggestion · terminology · "Feature Issue" (capitalized) used interchangeably with "feature-level Issue." · **Recommendation:** Standardize on "feature-level Issue" (matches charter's "feature-spec level" framing).

---

## Summary

**Total findings:** 0 blockers, 9 warnings, 5 suggestions.

**Action required:** Ready for planning. Highest-impact follow-ups: (1) resolve the `.migration-state-artifacts.json` manifest claim (SA-4 / CON-5) — either drop or own in `one-shot-migration-tool.spec.md`; (2) make field preservation explicit (SA-2) so the charter's "Migration completeness" attribute is provable; (3) guard against JSONL line injection via embedded newlines in `notes` (SEC-1). These can be folded into spec revision 2 or addressed in the implementation plan.
