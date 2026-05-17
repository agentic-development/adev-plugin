# Live Spec: Retro Consolidation

<!-- Live Spec within the heuristics charter.
     Adds a heuristics consolidation step to /adev:retro that merges
     duplicates, promotes recurring patterns, demotes contradicted entries,
     and archives stale heuristics. This is the only lifecycle surface that
     performs bulk heuristic maintenance.
     Depends on: store-and-helper (API), contradiction-tracking (contradicted-by data).
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: validated
risk_level: medium
milestone: 1
revision: 1
charter-revision: 5
created: 2026-04-12
updated: 2026-04-12
source-manifest:
  sha: "0d53fd6"
  files:
    - skills/retro/SKILL.md
    - tests/skills/retro-consolidation.test.mjs
    - lib/heuristics.mjs
    - .context-index/manifest.yaml
  computed-at: "2026-04-25T21:55:13.377Z"
drift_detected: true
drift_source: .context-index/manifest.yaml
drift_at: 2026-05-17T14:27:25.149Z
---

## Behavioral Contract

### Preconditions

- `/adev:retro` SKILL.md exists with Steps 1-5 (Gather, Analyze, Recommend, Auto-Apply, Write Report)
- `lib/heuristics.mjs` is importable with `readHeuristics`, `writeHeuristic`, `promoteHeuristic`, `archiveHeuristic`, and `addContradiction` available
- `.context-index/memory/heuristics/` directory may or may not exist (retro handles both cases)

### Behaviors

**Step 1.7: Gather Heuristics (new data source in Step 1)**

1. **When** `/adev:retro` gathers data in Step 1 **then** it reads heuristics by iterating over module slugs from `manifest.yaml` `modules[].slug` plus `_global`, calling `readHeuristics(projectRoot, { module: slug })` for each. For each returned entry, it records `id`, `scope`, `confidence`, `evidence[]` count, `contradicted-by[]` count, `created`, and `updated` dates. It also scans `archive/` for metadata on recently archived entries.

2. **When** the heuristics directory does not exist or contains no files **then** the retro notes "No heuristics found" and proceeds. The consolidation step (Step 2.8 and Step 3.7) is skipped.

**Step 2.8: Analyze Heuristic Health (new analysis in Step 2)**

3. **When** heuristics are gathered **then** the retro computes:
   - **Total heuristics** by scope and confidence level
   - **New heuristics in period:** entries whose `created` date falls within the analysis range
   - **Stale heuristics:** entries whose `updated` date is older than 90 days (configurable via `heuristics.staleness_days` in manifest, default 90)
   - **Contradicted heuristics:** entries with 1+ items in `contradicted-by[]`
   - **Duplicate candidates:** entries within the same scope whose `title` or `pattern` text has high semantic overlap (agent judgment — look for entries describing the same lesson in different words)
   - **Promotion candidates:** entries with 2+ distinct-path evidence entries that remain at `low` confidence, or 3+ at `medium` (should have been auto-promoted but were not, indicating a possible store bug or manual override)

**Step 3.7: Heuristic Consolidation Recommendations (new section in Step 3)**

4. **When** stale heuristics are found **then** the retro recommends archiving each one:
   ```
   Recommendation: "Archive stale heuristic '<id>' in scope '<scope>' — 
   last updated <date>, <N> days ago. Reason: staleness."
   ```

5. **When** duplicate candidates are found **then** the retro recommends merging them:
   ```
   Recommendation: "Merge duplicate heuristics '<id1>' and '<id2>' in scope 
   '<scope>' — both describe: '<shared pattern summary>'. Keep the one with 
   higher evidence count, archive the other with reason 'merged-duplicate'."
   ```

6. **When** contradicted heuristics with 1 contradiction are found **then** the retro recommends reviewing them:
   ```
   Recommendation: "Review contradicted heuristic '<id>' — 1 contradiction 
   recorded. A second contradiction will auto-archive it. Verify whether the 
   contradiction is valid."
   ```

7. **When** promotion candidates are found **then** the retro recommends investigating:
   ```
   Recommendation: "Heuristic '<id>' has <N> evidence entries but confidence 
   is still '<level>'. Expected auto-promotion to '<expected>'. Investigate 
   whether evidence paths are truly distinct."
   ```

**Step 4: Auto-Apply Consolidation (when --auto-apply)**

8. **When** `--auto-apply` is passed **and** stale heuristics are found **then** the retro calls `archiveHeuristic(projectRoot, id, 'stale')` for each stale entry. This is a low-risk operation — stale entries are already ineffective.

9. **When** `--auto-apply` is passed **then** the retro does NOT auto-merge duplicates, auto-promote, or auto-resolve contradictions. These require human judgment and are left as recommendations.

10. **When** `archiveHeuristic` throws during auto-apply (e.g., `HEURISTICS_ARCHIVE_CONFLICT`) **then** the retro logs a warning and continues with the next entry. Auto-apply failures never block the retro.

**Step 5: Report Heuristic Metrics**

11. **When** the retro report is written **then** it includes a `### Heuristic Health` subsection in the report with:
    - Total heuristics (by scope)
    - Confidence distribution (high / medium / low counts)
    - New heuristics in period
    - Stale heuristics archived (if --auto-apply) or flagged
    - Contradicted entries
    - Duplicate candidates
    - Promotion anomalies

### Postconditions

- Stale heuristics are archived when `--auto-apply` is used
- The retro report includes heuristic health metrics
- No heuristic is modified without explicit recommendation or --auto-apply
- The consolidation step degrades gracefully — a missing or empty heuristic store produces no errors

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Heuristics directory does not exist | Note "No heuristics found", skip consolidation | — |
| `readHeuristics` or directory scan throws | Log warning, skip consolidation step, proceed with rest of retro | — |
| `archiveHeuristic` throws during auto-apply | Log warning per entry, continue with next entry | — |
| `manifest.yaml` missing `heuristics.staleness_days` | Use default of 90 days | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Consolidation logic is documented as SKILL.md instructions. The retro skill uses inline Node.js for API calls, matching the existing pattern.
- **Quality: Safety** — Only `/adev:retro` performs bulk heuristic maintenance. No self-modifying code path. Auto-apply is limited to archiving stale entries (lowest risk). Merges and promotions require human confirmation.
- **Quality: Transparency** — Every archive action records a reason (`stale`, `merged-duplicate`). The retro report documents all actions taken and all recommendations made.
- **Quality: Degradation** — Missing heuristic store or API failures never block the retrospective.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Add Step 1.7 (gather heuristics) to `skills/retro/SKILL.md` | small |
| T2 | Add Step 2.8 (analyze heuristic health) metrics computation to SKILL.md | medium |
| T3 | Add Step 3.7 (consolidation recommendations) to SKILL.md | medium |
| T4 | Add auto-apply stale archival to Step 4 in SKILL.md | small |
| T5 | Add `### Heuristic Health` subsection to the report template in Step 5 | small |
| T6 | Document `heuristics.staleness_days` manifest key | small |
| T7 | Eval test: retro with heuristics → report includes heuristic health section | medium |
| T8 | Eval test: retro with stale heuristics + --auto-apply → stale entries archived | medium |
| T9 | Eval test: retro with no heuristics → no errors, consolidation skipped | small |
| T10 | Eval test: retro identifies duplicate candidates | medium |

## Acceptance Criteria

- [ ] `/adev:retro` Step 1 gathers heuristic data from `.context-index/memory/heuristics/`
- [ ] Step 2 computes heuristic health metrics (total, distribution, stale, contradicted, duplicates)
- [ ] Step 3 generates actionable recommendations for stale, duplicate, contradicted, and promotion-anomaly heuristics
- [ ] `--auto-apply` archives stale heuristics with reason `"stale"`
- [ ] `--auto-apply` does NOT auto-merge duplicates or auto-promote (requires human judgment)
- [ ] Step 5 report includes a `### Heuristic Health` subsection
- [ ] Missing heuristic store produces no errors — consolidation step is gracefully skipped
- [ ] `heuristics.staleness_days` is configurable via manifest (default 90)
- [ ] Archive failures during auto-apply are logged and do not block the retro
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
