## Step 5: Collect and Consolidate Findings

Wait for all subagents to return. Merge findings into a single consolidated report.

### Verdict Logic

Determine the overall verdict for each spec:

| Condition | Verdict |
|-----------|---------|
| All reviewers returned zero findings or only `suggestion` severity | **PASS** |
| At least one `warning` finding but zero `blocker` findings | **PASS_WITH_NOTES** |
| At least one `blocker` finding from any reviewer | **BLOCK** |

### Consolidated Report Format

Produce one section per dispatched reviewer, in registry order. For each reviewer record the dispatch mode (`subagent` or `package`), the resolved profile, and the prompt source (`plugin:` URI or repo-relative). For package-mode reviewers also record the skill path and the adapter path.

**Disabled reviewers get a report row, not silence.** `adev governance reviewers` keeps a reviewer declared with `enabled: false` in `reviewers` and also returns it on `disabled`, each entry carrying `disabled_reason`. Emit one `## Disabled Reviewers` table row per entry on that list, naming the reviewer id and its `disabled_reason` — or the literal text `no reason given` when the registry stated none (the loader also raises a `DISABLED_WITHOUT_REASON` warning in that case, which belongs in the report header with the other warnings). Omit the whole section when nothing is disabled. A reviewer that was deliberately switched off must read differently from one the project never declared; dropping it from the report collapses the two.

**External Remedies (Task 11 — two-channel consistency with the build loop).** When any surviving BLOCK finding carries `finding_class: external` (Step 6b-bis below constructs this array), emit one `## External Remedies` table row per such finding: `blocker_id`, `section_anchor`, and `remedy_ref` — the SAME three fields, in the SAME order, that `skills/build/blocker-auto-retry-loop.md`'s "External remedies" progress line prints, and both route `remedy_ref` through the identical `lib/governance/remedy-ref-render.mjs::renderRemedyRef` helper (via `adev blockers write`'s already-validated sidecar, or directly for report rendering — never re-implement the stripping logic inline). This is what lets a human reading `.review.md` on disk and the loop's live console output agree byte-for-byte on the rendered `remedy_ref`. Omit the section when no finding is `external`-classed.

```markdown
# Architecture Review: <spec-slug>

> **Date:** YYYY-MM-DD
> **Spec:** <path to spec>
> **Charter:** <path to charter>
> **Verdict:** PASS | PASS_WITH_NOTES | BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| <reviewer-id> | <reviewer-name> | subagent | <profile-name> | <plugin: URI or repo-relative path> |
| <package-id>  | <package-name>  | package  | <profile-name> | <skill path> (adapter: <adapter path>) |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| <reviewer-id> | <disabled_reason, or "no reason given"> |

## External Remedies

| Blocker ID | Section Anchor | Remedy Ref |
|------------|-----------------|------------|
| <blocker_id> | <section_anchor> | <renderRemedyRef(remedy_ref)> |

## <Reviewer Name> (<id>)

**Verdict:** PASS | PASS_WITH_NOTES | FAIL

<findings list, or "No findings.">

(repeat for each dispatched reviewer)

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict in the header above, computed from post-cap findings across all
> reviewers — PASS (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning,
> zero blockers), BLOCK (>= `verdict_rules.blocker_threshold` blockers,
> default 1). See `configurable-reviewers.spec.md` behaviors 37-38. An
> individual reviewer signals a blocker by emitting FAIL with a
> blocker-severity finding, which is what the `reportReviewer` snippet in
> Step 6a records.

---

## Summary

**Total findings:** N (B blockers, W warnings, S suggestions)
**Action required:** <what the user must do next, based on verdict>
```

Verdict consolidation uses `computeVerdict(findings, verdictRules)` from `lib/governance/review-config.mjs`. Default `verdictRules.blocker_threshold: 1` matches today's behavior.
