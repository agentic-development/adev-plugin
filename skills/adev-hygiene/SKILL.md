---
name: adev-hygiene
description: Audit all context for staleness, drift, and coverage gaps. Runs six audit passes across the .context-index/ directory and generates actionable reports with checklists.
---

# Context Hygiene Audit

Audit the health of `.context-index/` and generate actionable reports. Six audit passes detect staleness, drift, and coverage gaps so the team can fix them before they become obstacles.

## Arguments

- No arguments: full audit (all six passes)
- `--check <type>`: run a single pass (constitution, charters, adrs, samples, drift, sessions)
- `--fix`: auto-fix issues where possible (runs /adev-sync for constitution drift, etc.)

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev-init` first.

## Process

1. **Load manifest:** Read `.context-index/manifest.yaml` for configuration, sync targets, and integration settings.
2. **Run audit passes:** Execute each of the six passes below. If `--check` was provided, run only that pass.
3. **Generate report:** Write findings to `.context-index/hygiene/drift-report.md`.
4. **Print summary:** Display pass/warn/fail counts and the top-priority actions.
5. **Offer fixes:** For automatically fixable issues, offer to run the appropriate skill or command.

## Audit Pass 1: Constitution Freshness

**Goal:** Verify that agent files are in sync with the constitution and that all pointers resolve.

**Steps:**

1. Read `.context-index/constitution.md`.
2. For each sync target in `manifest.yaml` (CLAUDE.md, AGENTS.md, .cursorrules, etc.):
   - Check that the target file exists.
   - Compare the constitution content in the target against `constitution.md`.
   - If they differ, flag as DRIFT.
3. Validate context routing pointers in the constitution:
   - Every file path referenced in the "Context Routing" section must exist on disk.
   - Flag missing files as BROKEN_POINTER.
4. Check section completeness. The constitution should have all six required sections:
   - Identity, Non-Negotiable Principles, Coding Standards, Architecture Boundaries, Context Routing, Quality Gates.
   - Flag missing sections as INCOMPLETE.
5. Check line count against `max_lines` in manifest (default: 200). Flag if over limit.

**Output format:**
```
## Constitution Freshness

- [x] constitution.md exists (92 lines, under 200 limit)
- [x] Section completeness: 6/6 sections present
- [ ] CLAUDE.md: DRIFT — constitution updated 2 days after last sync
- [x] AGENTS.md: in sync
- [ ] Context routing: BROKEN_POINTER — .context-index/specs/features/payments/charter.md does not exist
- [x] Context routing: 11/12 pointers valid

**Actions:**
- [ ] Run `/adev-sync` to update CLAUDE.md
- [ ] Remove or create .context-index/specs/features/payments/charter.md
```

**Auto-fix (if `--fix`):** Run `/adev-sync` for drift issues.

## Audit Pass 2: Charter Coverage

**Goal:** Identify which codebase areas have charters and which are uncharted territory. Prioritize by git change frequency.

**Steps:**

1. List all feature charter directories under `.context-index/specs/features/`.
2. Map each charter to its corresponding codebase area:
   - Read each charter's scope section for directory/file references.
   - If no explicit scope, infer from the module name.
3. Identify source directories that are NOT covered by any charter.
4. For uncharted areas, check git change frequency:
   ```bash
   git log --oneline --since="30 days ago" -- <directory> | wc -l
   ```
5. Rank uncharted areas by change frequency (high-churn areas need charters first).
6. Check that each charter has been updated within the last 90 days. Flag stale charters.

**Output format:**
```
## Charter Coverage

Chartered areas: 3
Uncharted areas: 5

### High Priority (high churn, no charter)
- [ ] src/lib/auth/ — 42 changes in 30 days, no charter
- [ ] src/app/api/ — 38 changes in 30 days, no charter

### Medium Priority (moderate churn, no charter)
- [ ] src/lib/payments/ — 12 changes in 30 days, no charter

### Low Priority (low churn, no charter)
- [ ] prisma/ — 5 changes in 30 days, no charter
- [ ] scripts/ — 2 changes in 30 days, no charter

### Stale Charters
- [ ] task-boards/charter.md — last updated 120 days ago, source changed 15 times since

**Actions:**
- [ ] Run `/adev-brainstorm` for src/lib/auth/ (highest churn without charter)
- [ ] Review task-boards charter for staleness
```

## Audit Pass 3: ADR Currency

**Goal:** Verify that ADRs reference current code and are not superseded.

**Steps:**

1. List all ADR files in `.context-index/adrs/`.
2. For each ADR:
   - Extract file paths and symbol names referenced in the ADR body.
   - Check that referenced files still exist. Flag deleted references as STALE_REF.
   - Check the ADR status field. Flag ADRs marked "proposed" that are older than 30 days (decision never finalized).
3. Scan recent git history for architectural changes that lack ADRs:
   ```bash
   git log --oneline --since="60 days ago" --diff-filter=A -- "**/schema.prisma" "package.json" "**/auth/**" "**/middleware/**"
   ```
   - For each significant change (new schema model, new auth provider, new middleware), check if a corresponding ADR exists.
   - Flag undocumented architectural changes as MISSING_ADR.

**Output format:**
```
## ADR Currency

Total ADRs: 4
Current: 3
Issues: 2

- [x] 001-session-store-redis.md — references valid, status: accepted
- [ ] 002-api-versioning-v2.md — STALE_REF: src/lib/api-v1.ts deleted
- [x] 003-clerk-auth.md — references valid, status: accepted
- [ ] 004-blob-storage.md — status: proposed (45 days old, never finalized)

### Missing ADRs
- [ ] 2026-03-05: Added stripe integration (prisma/schema.prisma changed) — no ADR found

**Actions:**
- [ ] Update 002-api-versioning-v2.md to reference current API files
- [ ] Finalize or supersede 004-blob-storage.md
- [ ] Draft ADR for Stripe integration
```

## Audit Pass 4: Golden Sample Validity

**Goal:** Verify that golden samples still compile, pass tests, and match current coding standards.

**Steps:**

1. List all sample files in `.context-index/samples/`.
2. If the directory is empty, flag as NO_SAMPLES and suggest creating reference implementations.
3. For each sample:
   - Check that the code syntax is valid for the project's language (run the type checker or compiler on the sample if possible).
   - Compare the sample's patterns against the constitution's Coding Standards section.
   - Flag samples that use deprecated patterns, old naming conventions, or outdated APIs.
   - Check the sample's last modification date. Flag samples older than 90 days as POTENTIALLY_STALE.

**Output format:**
```
## Golden Sample Validity

Total samples: 2
Valid: 1
Issues: 1

- [x] component-sample.md — patterns match constitution, last updated 15 days ago
- [ ] service-sample.md — STALE_PATTERN: uses callback style, constitution requires async/await

**Actions:**
- [ ] Update service-sample.md to use async/await pattern
```

## Audit Pass 5: Spec-to-Code Drift

**Goal:** Compare the repo map against `orientation/architecture.md` to detect structural drift.

**Steps:**

1. Check if `.context-index/hygiene/repo-map.md` exists. If not, suggest running `/adev-repomap` first.
2. Read `.context-index/orientation/architecture.md`.
3. Extract module names, key files, and relationships described in the orientation doc.
4. Compare against the repo map:
   - **New high-importance symbols not in orientation:** Symbols with high reference counts (top 20% in the repo map) that are not mentioned in orientation. These represent important code that the orientation does not describe.
   - **Orientation references to deleted code:** Files or modules mentioned in orientation that no longer exist in the repo map. These are stale orientation entries.
   - **Structural changes:** New top-level directories or modules that appeared since the orientation was written.
5. Check the repo map's staleness marker (commit hash) against current HEAD. If the repo map is more than 50 commits behind, flag as STALE_MAP.

**Output format:**
```
## Spec-to-Code Drift

Repo map: generated at abc1234 (current HEAD: def5678, 23 commits behind)
Orientation: last updated 2026-03-01

### New Important Symbols (not in orientation)
- [ ] src/lib/payments/stripe-client.ts: StripeClient (referenced by 8 files)
- [ ] src/lib/notifications/email-sender.ts: sendEmail() (referenced by 6 files)

### Stale Orientation References
- [ ] orientation mentions src/lib/api-v1/ — directory no longer exists
- [ ] orientation mentions AuthProvider class — renamed to ClerkAdapter

### New Modules
- [ ] src/lib/analytics/ — new directory, 12 files, not described in orientation

**Actions:**
- [ ] Run `/adev-repomap` to refresh the repo map
- [ ] Update orientation/architecture.md to describe payments and notifications modules
- [ ] Remove api-v1 references from orientation
```

## Audit Pass 6: Session Analysis (Conditional)

**Goal:** Analyze session data to find dead context and high-failure areas. Only runs if session capture is configured.

**Prerequisite check:**

1. Read `.context-index/manifest.yaml` for `integrations.session_capture.provider`.
2. If `provider` is `none` or the `integrations.session_capture` section does not exist, SKIP this pass entirely. Print:
   ```
   ## Session Analysis

   Skipped — no session capture provider configured in manifest.yaml.
   To enable, set integrations.session_capture.provider to "entire" or "jsonl".
   ```
3. If `provider: entire`, look for session data via the Entire checkpoint branch configured in `checkpoint_branch`.
4. If `provider: jsonl`, read session logs from `.context-index/hygiene/sessions/`.

**Steps (when session data is available):**

1. Scan session logs for spec file reads:
   - Which specs were referenced during sessions? (actively used context)
   - Which specs were NEVER referenced in any session? (potentially dead context)
2. Identify high-failure areas:
   - Which files or modules had the most debugging sessions?
   - Which areas had repeated fix attempts (3+ fixes in same area within a week)?
3. Identify context gaps:
   - Sessions where the agent searched for information that does not exist in `.context-index/` (searches with no results in context directories).
   - These represent missing documentation the team should create.

**Output format:**
```
## Session Analysis

Sessions analyzed: 23 (last 30 days)

### Dead Context (never referenced)
- [ ] specs/features/onboarding/welcome-flow.md — 0 references in 23 sessions
- [ ] adrs/001-session-store-redis.md — 0 references in 23 sessions

### High-Failure Areas
- [ ] src/lib/auth/middleware.ts — 5 debugging sessions in 7 days
- [ ] src/app/api/webhooks/stripe.ts — 3 debugging sessions in 14 days

### Context Gaps (agents searched but found nothing)
- [ ] "rate limiting" — searched 4 times, no spec or ADR exists
- [ ] "file upload validation" — searched 3 times, no spec exists

**Actions:**
- [ ] Review dead context: remove or update unused specs
- [ ] Investigate auth middleware for architectural issues (repeated failures)
- [ ] Create cross-cutting spec for rate limiting
- [ ] Add file upload validation to relevant feature charter
```

## Report Format

The full report is written to `.context-index/hygiene/drift-report.md` with this structure:

```markdown
# Context Hygiene Report

**Generated:** [timestamp]
**Commit:** [HEAD hash]

## Summary

| Pass | Status | Issues |
|------|--------|--------|
| Constitution Freshness | WARN | 2 issues |
| Charter Coverage | WARN | 5 uncharted areas |
| ADR Currency | PASS | 0 issues |
| Golden Sample Validity | FAIL | 1 invalid sample |
| Spec-to-Code Drift | WARN | 3 drift items |
| Session Analysis | SKIP | no provider configured |

## Priority Actions

1. [ ] Run `/adev-sync` to fix constitution drift
2. [ ] Charter src/lib/auth/ (42 changes, no charter)
3. [ ] Update service-sample.md (stale patterns)
4. [ ] Update orientation for payments module

---

[Detailed sections for each pass follow]
```

## After the Audit

Print the summary table and top 3 priority actions to the user. Then:

```
Full report saved to .context-index/hygiene/drift-report.md

Next steps:
- Fix the highest-priority items above
- Run /adev-hygiene again after fixes to verify
- Schedule monthly hygiene audits to prevent drift
```
