## Audit Pass 12: Lifecycle Audit

**Goal:** Detect revision drift, file drift, charter-revision staleness, and capability status inconsistencies across all specs and charters.

**Steps:**

1. **Scan all specs.** Read every `*.spec.md` file under `.context-index/specs/features/`. Parse frontmatter for `revision`, `charter-revision`, `status`, and `charter`.
2. **Read lifecycle states.** Call `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` to get the per-spec lifecycle projection. The `state.steps.review` block carries the reviewed revision and content hash that were stamped by `/adev:review-specs` at write time.
3. **Scan all charters.** Read every `charter.md`. Parse `revision` and the Capability Map table (including the `Status` column).

4. **Revision drift check:** For each spec, compare the spec's `revision` frontmatter against `state.steps.review.lastReviewedRevision` (from the lifecycle projection):
   - If the spec's revision is greater, flag as `REVISION_DRIFT`:
     ```
     - [ ] <spec-path>: REVISION_DRIFT — spec revision <N>, last reviewed revision <M>
     ```

5. **File drift check:** For each spec, call `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` (which compares the spec's stored content hash against the current file). If `hasDrift()` returns `true`, flag as `FILE_DRIFT`:
   ```
   - [ ] <spec-path>: FILE_DRIFT — content changed since last review
   ```
   Do NOT shell out to compute hashes from the skill — the helper computes the SHA-256 internally.

6. **Charter-revision staleness check:** For each spec with a `charter-revision` field:
   - Read the parent charter's current `revision`.
   - If the spec's `charter-revision` is less than the charter's current `revision`, flag as `CHARTER_STALE`:
     ```
     - [ ] <spec-path>: CHARTER_STALE — spec references charter revision <M>, charter is now at revision <N>
     ```

7. **Capability status consistency check:** For each charter, compare the Capability Map's `Status` column against the actual status of corresponding specs:
   - If a capability's Status says `implemented` but the spec's frontmatter status is `review-passed`, flag as `STATUS_MISMATCH`.
   - If a capability's Status says `—` (default) but a spec exists for that capability, flag as `STATUS_BEHIND`.
   - Report all mismatches:
     ```
     - [ ] <charter-path>: STATUS_MISMATCH — capability "<name>" shows "<charter-status>" but spec status is "<spec-status>"
     ```

8. **Reality drift check (codebase verification):** For each spec with status `implemented` or `validated`, verify the implementation actually exists in the codebase via the CLI:
   ```bash
   adev verify spec --spec <specPath>
   ```
   The verb wraps `lib/reality-check.mjs::verifySpecImplemented` and emits JSON `{ implemented, confidence, evidence }`.
   - If `confidence === "none"` (status claims implemented but no codebase evidence): flag as `REALITY_DRIFT`:
     ```
     - [ ] <spec-path>: REALITY_DRIFT — status is "<status>" but implementation not found in codebase (confidence: none)
     ```
   - If `confidence === "low"` (weak evidence): flag as `REALITY_WARN`:
     ```
     - [ ] <spec-path>: REALITY_WARN — status is "<status>" but implementation evidence is weak (files untracked or missing)
     ```
   - If `confidence === "medium"` or `"high"`: no finding (status matches reality).
   - If `adev verify spec` exits non-zero, skip this step with note: "Reality check unavailable — skipping codebase verification."

**Output format:**
```
## Lifecycle Audit

Specs scanned: <N>
Reviews scanned: <N>
Charters scanned: <N>

### Revision Drift
- [ ] specs/features/auth/login.spec.md: REVISION_DRIFT — spec revision 3, last reviewed revision 1

### File Drift
- [ ] specs/features/auth/login.spec.md: FILE_DRIFT — file hash changed since last review

### Charter-Revision Staleness
- [ ] specs/features/auth/login.spec.md: CHARTER_STALE — spec references charter revision 1, charter is now at revision 3

### Capability Status Inconsistencies
- [ ] specs/features/auth/charter.md: STATUS_MISMATCH — capability "login" shows "planned" but spec status is "implemented"

### Reality Drift (codebase verification)
- [ ] specs/features/payments/checkout.md: REALITY_DRIFT — status is "implemented" but implementation not found (confidence: none)
- [ ] specs/features/auth/session.md: REALITY_WARN — status is "validated" but files untracked (confidence: low)

**Actions:**
- [ ] Re-review specs with revision or file drift: /adev:review-specs
- [ ] Update specs referencing stale charter revisions: check for charter changes that affect the spec
- [ ] Fix capability status mismatches in charter Capability Map tables
- [ ] Investigate REALITY_DRIFT specs: implementation may have been reverted, never committed, or incorrectly stamped
- [ ] Commit or implement REALITY_WARN specs: files exist but are not git-tracked
```

**Integration with summary table:** Add a row for Lifecycle Audit in the report summary:
```
| Lifecycle Audit | WARN | 2 revision drift, 1 charter stale, 1 status mismatch |
```
