## Step 4: Auto-Apply (if --auto-apply)

When `--auto-apply` is passed, apply low-risk improvements that do not modify code or specs. These are informational updates only.

**Actions taken:**

1. **Flag golden sample candidates.** Print the list of candidates and suggest running `/adev:sample` for each. Do NOT extract or create samples automatically.

2. **Flag missing ADR topics.** Print the list of missing ADR topics and suggest running `/adev:brainstorm` to draft them. Do NOT create ADRs automatically.

3. **Update hygiene report.** If `.context-index/hygiene/drift-report.md` exists, append a "Retro Findings" section with the key metrics and top recommendations. This makes retro findings visible to the next `/adev:hygiene` run.

4. **Archive stale heuristics.** For each heuristic whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days), call `archiveHeuristic(projectRoot, id, 'stale')` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`). Log progress: "Archived N/M stale heuristics". If `archiveHeuristic` throws (e.g., `HEURISTICS_ARCHIVE_CONFLICT`), log a warning per entry and continue.

**Actions NOT taken (require explicit user action):**

- Constitution amendments (too impactful for auto-apply)
- Specialist creation (requires design decisions)
- Spec template changes (affects future specs)
- Any file modifications outside `.context-index/hygiene/`
- Duplicate merging (requires human judgment to determine which entry to keep)
- Heuristic promotion (may indicate a legitimate edge case, not a bug)
- Contradiction resolution (requires domain knowledge)
