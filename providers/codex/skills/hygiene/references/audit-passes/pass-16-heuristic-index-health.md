## Audit Pass 16: Heuristic Index Health

**Goal:** Verify heuristic index in sync targets is current and tags are well-distributed.

**Steps:**

1. Check if `.context-index/memory/heuristics/` exists. If not, report SKIP:
   "No heuristic store found — nothing to audit."

2. **STALE_INDEX check:** Read all heuristics via `readHeuristics(projectRoot, { minConfidence: 'high' })`.
   For each sync target in `manifest.yaml`, read the file and extract the `## Learned Lessons` section.
   Compare: any high-confidence heuristic whose title is not present in any sync target's
   Learned Lessons section is flagged as STALE_INDEX (severity: warn), listing the heuristic id,
   title, and scope. If no sync targets are configured in the manifest, skip the STALE_INDEX check
   and proceed to orphan tag detection only.

3. **ORPHAN_TAG check:** Read all scope files in `.context-index/memory/heuristics/`.
   Collect every `tags` entry across all heuristics.
   Count occurrences of each tag. Any tag appearing exactly once is flagged as ORPHAN_TAG
   (severity: info) with the tag, the heuristic id it belongs to, and a suggestion:
   "Remove this tag or add it to related heuristics to normalize the tag vocabulary."

4. If no STALE_INDEX and no ORPHAN_TAG findings: report PASS with count of indexed entries
   and total unique tags.

5. **--fix behavior:** If STALE_INDEX detected and `--fix` provided, invoke `/adev:sync`
   to regenerate the index. After sync completes, re-check and report the fix result.
   ORPHAN_TAG has no auto-fix — report:
   "Orphan tags are advisory. Use `/adev:learn --promote` or edit heuristic files manually
   to normalize tags."

6. **--check heuristics:** When `--check heuristics` is provided, run only this pass
   (skip passes 1–15).

**Output format:**
```
## Heuristic Index Health

- [x] Heuristic store: .context-index/memory/heuristics/ exists
- [ ] STALE_INDEX (warn): heuristic "Avoid inline callbacks in hooks" (id: a1b2, scope: hooks)
      not found in any sync target's ## Learned Lessons section
- [ ] ORPHAN_TAG (info): tag "edge-case" appears on only 1 heuristic (id: a1b2)
      Suggestion: remove this tag or add it to related heuristics

**Actions:**
- [ ] Run `/adev:sync` to regenerate the Learned Lessons index
- [ ] Normalize or remove orphan tags manually
```

**Integration with summary table:**
```
| Heuristic Index Health | WARN | 1 stale index entry, 2 orphan tags |
```
