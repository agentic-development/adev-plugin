## Audit Pass 7: External Reference Freshness

**Goal:** Verify that external reference files are up-to-date per their configured refresh intervals.

**Prerequisite check:**

1. Read `.context-index/manifest.yaml` for the `external_contexts` section.
2. If `external_contexts` is empty or missing, SKIP this pass entirely. Print:
   ```
   ## External Reference Freshness

   Skipped — no external contexts configured in manifest.yaml.
   ```

**Steps (when external contexts are configured):**

1. For each entry in `external_contexts`:
   - Check if `.context-index/references/<slug>/` exists. If not, flag as MISSING.
   - Read the frontmatter of files in the reference directory for a `last_fetched` date.
   - If no `last_fetched` field exists, check the file's git commit date as a fallback.
   - Compare the age against `refresh_interval_days` from the manifest entry.
   - Flag references older than the interval as STALE.

**Output format:**
```
## External Reference Freshness

Configured references: 3

- [x] company-standards — fetched 2 days ago (interval: 7 days) ✓
- [ ] api-contracts — STALE: fetched 12 days ago (interval: 3 days)
- [ ] design-system — MISSING: directory .context-index/references/design-system/ not found

**Actions:**
- [ ] Refresh api-contracts: fetch latest from source
- [ ] Create design-system reference: fetch from github:org/design-system/main
```
