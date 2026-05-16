---
name: adev:hygiene
description: "Audit all context for staleness, drift, and coverage gaps. Runs nineteen audit passes across the .context-index/ directory and source code, generating actionable reports with checklists. Use when the user wants to check context health, find stale specs, detect drift between specs and code, identify missing coverage, scan for dead code, or clean up the context index."
---

# Context Hygiene Audit

Audit the health of `.context-index/` and source code, generating actionable reports. Eighteen audit passes detect staleness, drift, coverage gaps, milestone readiness, lifecycle consistency, operational patterns, code health issues, heuristic index health, and kind-discriminator validity so the team can fix them before they become obstacles.

## Arguments

- No arguments: full audit (all eighteen passes)
- `--check <type>`: run a single pass (constitution, charters, adrs, samples, drift, sessions, references, governance, recoveries, blockers, milestones, lifecycle, code-health, provenance, issue-board, heuristics, code-drift, kind-validity)
- `--pass <type>`: alias for `--check <type>` (accepted for symmetry with related skills; identical behavior)
- `--fix`: auto-fix issues where possible (runs /adev:sync for constitution drift, etc.)
- `--status <spec-path> <new-status>`: manually update a spec's status field in frontmatter. Useful for correcting status when automation gets out of sync. Example: `--status .context-index/specs/features/auth/login.spec.md validated`

  Valid status values: `draft`, `review-pending`, `review-passed`, `review-blocked`, `implemented`, `validated`

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev:init` first.

## Process

**If `--status <spec-path> <new-status>` is provided:**

1. Validate the spec path exists and is a valid spec file
2. Validate the new status value is one of: draft, review-pending, review-passed, review-blocked, implemented, validated
3. Read the spec file
4. Parse YAML frontmatter
5. Record the old status value
6. Update the status field to the new value
7. Write the spec file back
8. Log: "Updated spec status: {old} → {new}"

Then exit (skip audit passes).

**Otherwise (normal audit mode):**

1. **Load manifest:** Read `.context-index/manifest.yaml` for configuration, sync targets, and integration settings.
2. **Run audit passes:** Execute each of the eighteen passes below. If `--check` (or `--pass`) was provided, run only that pass.
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
- [ ] Run `/adev:sync` to update CLAUDE.md
- [ ] Remove or create .context-index/specs/features/payments/charter.md
```

**Auto-fix (if `--fix`):** Run `/adev:sync` for drift issues.

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
- [ ] Run `/adev:brainstorm` for src/lib/auth/ (highest churn without charter)
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

1. Check if `.context-index/hygiene/repo-map.md` exists. If not, suggest running `/adev:repomap` first.
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
- [ ] Run `/adev:repomap` to refresh the repo map
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
   To enable, set integrations.session_capture.provider to "native" or "jsonl".
   ```
3. If `provider: native`, read session tracking data from `.context-index/.session-tracking.jsonl` and session summaries from `.context-index/sessions/`. This is the default provider when hooks handle session capture directly.
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

## Audit Pass 8: Governance Policy Health

**Goal:** Verify that governance policy files are well-formed and internally consistent.

**Prerequisite check:**

If `.context-index/governance/` does not exist, SKIP this pass entirely. Print:
```
## Governance Policy Health

Skipped — no governance/ directory configured. Run `/adev:init` to set up governance.
```

**Steps (when governance/ exists):**

1. **YAML parsing.** Parse each file (`gates.yaml`, `boundaries.yaml`, `risk-policies.yaml`). Flag PARSE_ERROR on failure.
2. **Gate ID uniqueness.** Check that all gate `id` values in `gates.yaml` are unique. Flag DUPLICATE_GATE_ID if any two gates share an `id`: "Duplicate gate ID '<id>' — second definition ignored."
3. **Tier value validation.** For each gate in `gates.yaml`, verify `tier` is one of `fast`, `integration`, or `e2e`. Flag INVALID_TIER: "Gate '<id>' has invalid tier '<value>', defaulting to fast."
4. **Severity value validation.** For each gate in `gates.yaml`, verify `severity` (if present) is `error` or `warning`. Flag INVALID_SEVERITY: "Invalid severity '<value>' for gate '<id>', defaulting to error."
5. **Empty gates list.** If `gates:` key exists in `gates.yaml` but is empty or null, flag EMPTY_GATES: "gates.yaml has an empty gates list."
6. **Gate command validation.** For each gate with a non-empty `command`, check that the binary exists on PATH (e.g., `which npm`, `which pytest`). Do not run the command. Flag COMMAND_NOT_FOUND.
7. **Regex validation.** For each boundary rule, compile the `pattern` as a regex. Flag INVALID_REGEX on failure.
8. **Charter override references.** For each file in `governance/overrides/`, verify the charter exists at `.context-index/specs/features/<slug>/charter.md`. Flag ORPHAN_OVERRIDE if the charter does not exist.
9. **Transition gate references.** For each gate ID in `transitions.*.required_gates`, verify it exists in the `gates` list. Flag MISSING_GATE_REF.
10. **Risk policy completeness.** Verify all three levels (high, medium, low) are defined in `risk-policies.yaml`. Flag INCOMPLETE_POLICY.
11. **Legacy manifest gates.** Read `manifest.yaml`. If a top-level `gates:` section exists, flag LEGACY_GATES: "Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml."

**Output format:**
```
## Governance Policy Health

- [x] gates.yaml: valid YAML, 4 gates defined
- [x] boundaries.yaml: valid YAML, 2 rules defined
- [x] risk-policies.yaml: valid YAML, 3/3 levels defined
- [ ] Gate "custom-build": COMMAND_NOT_FOUND — "turbo" not on PATH
- [ ] Boundary "no-direct-db": INVALID_REGEX — unclosed group
- [ ] Override "payments.yaml": ORPHAN_OVERRIDE — no charter at specs/features/payments/
- [x] Transition gate references: all valid

**Actions:**
- [ ] Install turbo or update gate command
- [ ] Fix regex pattern in boundary "no-direct-db"
- [ ] Remove orphan override payments.yaml or create the charter
```

## Audit Pass 9: Recovery Pattern Analysis

**Goal:** Identify systemic context gaps from recovery records.

**Prerequisite check:**

If `.context-index/hygiene/recoveries/` does not exist or is empty, SKIP this pass. Print:
```
## Recovery Pattern Analysis

Skipped — no recovery records found. Records are created by /adev:recover.
```

**Steps (when recovery records exist):**

1. Read all recovery records in `.context-index/hygiene/recoveries/`.
2. Compute root cause distribution (count per category: MISSING_CONTEXT, AMBIGUOUS_SPEC, CONSTRAINT_CONFLICT, NOVEL_PROBLEM, TOOL_FAILURE, BUDGET_EXHAUSTION).
3. Identify repeat offenders: same root cause in the same module more than once.
4. Compute Mean Time to Recovery (MTTU) across all records.
5. Flag modules with 3+ recoveries as HIGH_RECOVERY_RATE.
6. If MISSING_CONTEXT is the top category, list which context types were missing (ADR, sample, cross-cutting spec) and suggest additions.

**Output format:**
```
## Recovery Pattern Analysis

Total recoveries: 7 (last 90 days)

| Root Cause | Count | Avg MTTU |
|-----------|-------|---------|
| MISSING_CONTEXT | 3 | 8m |
| AMBIGUOUS_SPEC | 2 | 15m |
| NOVEL_PROBLEM | 1 | 22m |
| TOOL_FAILURE | 1 | 5m |

### Repeat Offenders
- [ ] auth module: 2x MISSING_CONTEXT (missing ADR for session storage)
- [ ] payments module: 2x AMBIGUOUS_SPEC (unclear error handling)

**Actions:**
- [ ] Draft ADR for session storage (would prevent 2 recoveries)
- [ ] Clarify error handling spec in payments charter
```

## Audit Pass 10: Blocker Frequency Analysis

**Goal:** Identify patterns in agent blockers to proactively improve context.

**Prerequisite check:**

If `.context-index/hygiene/blockers/` does not exist or is empty, SKIP this pass. Print:
```
## Blocker Frequency Analysis

Skipped — no blocker files found. Blockers are filed by subagents during /adev:implement.
```

**Steps (when blocker files exist):**

1. Read all blocker files in `.context-index/hygiene/blockers/`.
2. Count blockers per category and per module.
3. Identify modules with 3+ blockers as HIGH_BLOCKER_RATE.
4. Check if blocked tasks were eventually resolved (corresponding recovery record or validation report exists).
5. Flag unresolved blockers older than 7 days as STALE_BLOCKER.

**Output format:**
```
## Blocker Frequency Analysis

Total blockers: 5

| Category | Count | Resolved | Stale |
|----------|-------|----------|-------|
| MISSING_CONTEXT | 2 | 2 | 0 |
| AMBIGUOUS_SPEC | 2 | 1 | 1 |
| NOVEL_PROBLEM | 1 | 0 | 1 |

### Stale Blockers
- [ ] payments/stripe-webhook.md — AMBIGUOUS_SPEC, 12 days old, unresolved

**Actions:**
- [ ] Resolve stale blocker: clarify stripe webhook spec
- [ ] Review NOVEL_PROBLEM blocker for specialist gap
```

## Audit Pass 11: Milestone Coverage

**Goal:** Report delivery readiness per milestone by cross-referencing charter capability milestones with spec statuses. Identify capabilities with no milestone, and milestones with missing or incomplete specs.

**Steps:**

1. **Scan all charters.** Read every `.context-index/specs/features/*/charter.md`. For each charter, parse the Capability Map table. Extract each capability's name, priority, and milestone.
2. **Scan all specs.** Read every `*.spec.md` file under `.context-index/specs/features/`. Parse frontmatter for `charter`, `milestone`, and `status`.
3. **Match capabilities to specs.** For each charter capability, find the corresponding spec by:
   - Matching `milestone` in the spec to the capability's milestone, AND
   - Matching the spec's `charter` field to the charter's module name.
   - If no milestone match, fall back to matching by capability name similarity against spec titles.
4. **Group by milestone.** For each distinct milestone found across all charters:
   - List all capabilities assigned to that milestone.
   - For each capability, show the matching spec and its status (or "(no spec created)" if none).
   - Compute a summary: N specified, M implemented, K in review, J draft, L missing.
5. **List un-milestoned capabilities.** Capabilities with no milestone assigned, grouped by charter. Include their priority for triage.

**Output format:**
```
## Milestone Coverage

### v1
- auth/password-login — implemented ✓
- auth/session-management — review-passed
- task-boards/create-boards — draft
  → 1/3 implemented, 1 in review, 1 draft

### v2
- auth/sso-integration — (no spec created)
  → 0/1 specified (1 charter capability without a spec)

### Un-milestoned Capabilities
- auth: MFA — nice-to-have, no milestone assigned
- task-boards: board-analytics — should-have, no milestone assigned

**Actions:**
- [ ] Create spec for auth/sso-integration (v2 capability with no spec)
- [ ] Assign milestone to 2 un-milestoned capabilities
```

**Integration with summary table:** Add a row for Milestone Coverage in the report summary:
```
| Milestone Coverage | WARN | 1 unspecified capability, 2 un-milestoned |
```

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

8. **Reality drift check (codebase verification):** For each spec with status `implemented` or `validated`, verify the implementation actually exists in the codebase. Run via inline Node.js:
   ```bash
   node --input-type=module -e "
   import { verifySpecImplemented } from '<ADEV_ROOT>/lib/reality-check.mjs';
   const result = verifySpecImplemented('<specPath>', { projectRoot: '<projectRoot>' });
   console.log(JSON.stringify(result));
   "
   ```
   - If `confidence === "none"` (status claims implemented but no codebase evidence): flag as `REALITY_DRIFT`:
     ```
     - [ ] <spec-path>: REALITY_DRIFT — status is "<status>" but implementation not found in codebase (confidence: none)
     ```
   - If `confidence === "low"` (weak evidence): flag as `REALITY_WARN`:
     ```
     - [ ] <spec-path>: REALITY_WARN — status is "<status>" but implementation evidence is weak (files untracked or missing)
     ```
   - If `confidence === "medium"` or `"high"`: no finding (status matches reality).
   - If `lib/reality-check.mjs` fails to import, skip this step with note: "Reality check unavailable — skipping codebase verification."

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

## Audit Pass 13: Code Health

**Goal:** Detect dead exports, orphan files, unused dependencies, stale code, and duplicate logic in source code by dispatching `/adev:codehealth`.

**Prerequisite check:** Verify that `.context-index/hygiene/symbol-ranks.json` and `.context-index/hygiene/dependency-graph.json` exist. If either is missing, output SKIP:

```
| Code Health | SKIP | Repomap artifacts not found — run `/adev:repomap` first |
```

Do not invoke `/adev:codehealth`. Proceed to the report.

**Steps:**

1. Invoke `/adev:codehealth` with no filters (full scan).
2. Read the generated report at `.context-index/reports/codehealth-<YYYY-MM-DD>.md`.
3. Parse the frontmatter `summary` to extract finding counts by severity.

**Status mapping:**

| Condition | Status |
|-----------|--------|
| Zero findings | PASS |
| All findings are low severity | WARN |
| Any medium or high severity findings | FAIL |
| Repomap artifacts missing | SKIP |
| `/adev:codehealth` errors | FAIL |

**Output format:**
```
## Code Health

Dispatched `/adev:codehealth` — full scan.

Findings: N high, N medium, N low

**Actions:**
- [ ] Review full report at `.context-index/reports/codehealth-<date>.md`
- [ ] Run `/adev:specify --refactor` for high-severity clusters
```

**Integration with summary table:** Add a row for Code Health in the report summary:
```
| Code Health | WARN | 2 high, 3 medium, 1 low |
```

## Audit Pass 14: Code Provenance

**Goal:** Classify all source files by their git provenance — whether commits that touched them carry lifecycle trailers (`Spec:`, `Plan-task:`, `Issue:`, `Author-type:`).

**Steps:**

1. Identify all source files under `lib/`, `hooks/`, `cli/`, and `tests/` (or project-specific source directories from `platform-context.yaml`).
2. For each file, run `git log --format='%(trailers)' -- <file>` to extract trailers from all commits.
3. Classify each file into one of three categories:
   - **Fully traced**: ALL commits have `Spec:` and `Plan-task:` trailers → linked to the lifecycle
   - **Partially traced**: SOME commits have `Spec:` trailers, later ones don't → post-implementation drift
   - **Untraced**: NO commits have `Spec:` trailers → written entirely outside the lifecycle
4. For untraced files, cross-reference file names and content keywords against charter Capability Map entries marked as v2/future/nice-to-have. Flag potential matches.
5. Use `buildReverseIndex()` from `lib/source-manifest.mjs` to identify which files are claimed by source manifests.
6. For partially traced files, identify the most recent untracked commit and report it.

**Bootstrapping note:** Distinguish between "pre-pipeline commits" (before trailers were active in the repo) and "post-pipeline untracked commits" (written after trailers were available). Use the first commit with any trailer as the cutoff date. Commits before this date are labeled "pre-pipeline" and excluded from the untracked count.

**Status mapping:**

| Condition | Status |
|-----------|--------|
| All files fully traced | PASS |
| Some files partially traced (post-impl drift) | WARN |
| Post-pipeline untraced files exist | FAIL |
| Only pre-pipeline untraced files | WARN |

**Output format:**
```
## Code Provenance

Scanned: N source files, M commits

| Category | Count | Files |
|----------|-------|-------|
| Fully traced | N | lib/login.mjs, ... |
| Partially traced | N | lib/drifted.mjs (2 untracked commits), ... |
| Untraced (post-pipeline) | N | lib/orphan.mjs, ... |
| Untraced (pre-pipeline) | N | ... |

**Capability matches for untraced files:**
- lib/orphan.mjs → may implement "SSO Integration" (auth charter, v2)

**Actions:**
- [ ] Review N partially traced files for spec updates
- [ ] Create specs or mark N untraced files as intentionally untracked
```

**Integration with summary table:**
```
| Code Provenance | WARN | 2 drifted, 3 untraced |
```

## Audit Pass 15: Issue Board Audit

**Goal:** Cross-reference specs, plans, and the issue board to detect orphaned artifacts, stale items, and completeness gaps.

**Prerequisites:** `tasks.backend` must be configured in `manifest.yaml`. If not configured, output SKIP.

**Steps:**

1. **Orphaned plans**: Find `.plan.md` files under `.context-index/specs/features/` that have no corresponding epic on the issue board (no epic has a matching `planRef`).
2. **Orphaned issues**: Find issues whose `planRef` points to a file that no longer exists.
3. **Partial epics**: Find epics where the issue count doesn't match the plan's task count (plan says 6 tasks but only 4 issues exist).
4. **Stale deferred**: Find issues with `status: deferred` that are older than 14 days with no notes update.
5. **Epic completeness**: Find epics where all child issues are `closed` but the epic status is still `open`.
6. **Plan-spec consistency**: Find plans whose parent spec has been modified since the plan was created (spec has newer `updated` or `revision` in frontmatter).

**Status mapping:**

| Condition | Status |
|-----------|--------|
| No issues found | PASS |
| Only stale deferred or epic completeness gaps | WARN |
| Orphaned plans, orphaned issues, or partial epics | FAIL |
| Backend not configured | SKIP |

**Output format:**
```
## Issue Board Audit

| Check | Count | Details |
|-------|-------|---------|
| Orphaned plans | N | plan-x.plan.md (no epic) |
| Orphaned issues | N | issue-4 (planRef → nonexistent file) |
| Partial epics | N | epic-2 (3/6 tasks have issues) |
| Stale deferred | N | issue-5 (deferred 26 days) |
| Epic completeness | N | epic-1 (all issues closed, epic open) |
| Plan-spec consistency | N | plan-x (spec modified after plan) |

**Actions:**
- [ ] Close N stale epics
- [ ] Create missing issues for N partial epics
- [ ] Review N orphaned plans
- [ ] Triage N stale deferred issues
```

**Integration with summary table:**
```
| Issue Board Audit | FAIL | 2 orphaned, 1 stale epic |
```

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

## Audit Pass 17: Code Drift

**Goal:** Detect specs with `drift_detected: true` in their frontmatter, indicating implementation source files have been modified since the source manifest was last stamped.

**Steps:**

1. Scan all specs matching `.context-index/specs/**/*.spec.md`.
2. For each spec, read the YAML frontmatter and check if `drift_detected: true` is present.
3. If drifted specs are found, report WARN with a list:
   - Spec path
   - `drift_source` (the file that triggered the drift)
   - `drift_at` (timestamp of drift detection)
4. If no drifted specs are found, report PASS.

**Output format:**
```
## Code Drift

- PASS: No specs with drift_detected flags (or)
- WARN: N specs with code-side drift detected:
  - .context-index/specs/features/auth/login.spec.md — drift_source: lib/login.mjs, drift_at: 2026-05-01T10:00:00Z
  - .context-index/specs/features/dashboard/widgets.spec.md — drift_source: lib/widgets.mjs, drift_at: 2026-05-02T14:00:00Z

**Actions:**
- [ ] Run `/adev:validate --spec <path>` to verify spec still reflects implementation
- [ ] Run `/adev:implement` to re-stamp source manifests and clear drift flags
```

**Integration with summary table:**
```
| Code Drift | WARN | 2 drifted specs |
```

## Audit Pass 18: Kind Validity

**Goal:** Validate the `kind:` discriminator on every `*.spec.md` and `charter.md` artifact under `.context-index/`. Detect missing, invalid, or cross-layer kind values, and cross-reference `kind: module` charters against `manifest.yaml:modules[]`.

**Layer 1 posture (non-blocking):** All findings emitted by this pass — regardless of severity — are advisory in Layer 1. The pass never causes `/adev:hygiene` to exit non-zero on its own. Severity (`error` / `warn` / `info`) conveys human-triage priority, not gate-blocking semantics. A future Layer 2 enhancement (tracked under `issue-463`) may upgrade `error` findings to gate-blocking after the legacy backfill completes.

**Steps:**

1. Import `runKindValidityPass` from `<ADEV_ROOT>/lib/hygiene/kind-validity.mjs`.
2. Invoke `await runKindValidityPass(projectRoot, { cutover, moduleFilter })`. Both options are optional:
   - `cutover`: ISO 8601 timestamp distinguishing `MISSING_KIND` (warn, post-cutover) from `LEGACY_DEFAULTED` (info, pre-cutover). Defaults to `2026-05-14T00:00:00.000Z` (the date this audit landed).
   - `moduleFilter`: when invoked as `/adev:hygiene --module <slug>`, restrict the audit to artifacts under `features/<slug>/`.
3. Render each finding in the standard hygiene table:

```
| Path | Layer | Kind | Severity | Code | Reason |
|---|---|---|---|---|---|
```

4. Surface `result.headerNotes` in the report header (e.g., when `manifest.yaml` is missing and the `MODULE_KIND_NO_MANIFEST` cross-reference was skipped).
5. Attach the `timestampWarning` (when non-null) inline beside the relevant finding so reviewers can see when classification fell back from git to mtime.

**Finding codes:**

| Severity | Code | Trigger | Resolution Hint |
|---|---|---|---|
| `error` | `INVALID_KIND` | `kind:` present but value is not in `SPEC_KINDS` (for `*.spec.md`) or `CHARTER_KINDS` (for `charter.md`) — including cross-layer values | Fix the value to one of the valid kinds (see `lib/kinds.mjs`) |
| `error` | `PARSE_ERROR` | Artifact's frontmatter cannot be parsed (missing fence, malformed YAML, etc.) | Inspect the artifact manually; the file is unreadable by the discriminator parser |
| `warn` | `MISSING_KIND` | `kind:` field absent AND the artifact's creation timestamp is at or after the cutover | Run `/adev:specify` or `/adev:brainstorm` to re-author with explicit kind, or backfill manually |
| `warn` | `MODULE_KIND_NO_MANIFEST` | `charter.md` has valid `kind: module` but the module slug (derived from `features/<slug>/charter.md`) is not declared in `manifest.yaml:modules[]` | Add the module to `manifest.yaml`, or change the charter kind to `feature` |
| `info` | `LEGACY_DEFAULTED` | `kind:` field absent AND the artifact's creation timestamp is before the cutover | Backfill is part of Layer 2 (`issue-463`); no action required now |

**Exit code policy:** None of the codes above gate the `/adev:hygiene` exit code in Layer 1. `error` findings are counted in the hygiene error total for triage prioritization only. The returned `findings` array is the sole signal — the pass does not throw and does not mutate `process.exitCode`.

**Output format:**
```
## Kind Validity

- PASS: All specs and charters have valid kind discriminators (or)
- FINDINGS: N kind-validity findings (non-blocking)

Header notes:
- manifest.yaml is missing or has no modules[] — MODULE_KIND_NO_MANIFEST cross-reference skipped

| Path | Layer | Kind | Severity | Code | Reason |
|---|---|---|---|---|---|
| .context-index/specs/features/foo/bar.spec.md | spec | nonsense | error | INVALID_KIND | kind 'nonsense' is not in the closed enumeration for layer 'spec' |
| .context-index/specs/features/foo/baz.spec.md | spec | — | warn | MISSING_KIND | kind: field absent and artifact was created after the Layer 1 cutover |
| .context-index/specs/features/orphan/charter.md | charter | module | warn | MODULE_KIND_NO_MANIFEST | charter declares kind:module but slug 'orphan' is not declared in manifest.yaml:modules[] |

**Actions:**
- [ ] Resolve `error`-severity findings (INVALID_KIND, PARSE_ERROR) — these indicate structural defects
- [ ] Backfill `MISSING_KIND` artifacts via `/adev:specify` or `/adev:brainstorm` re-authoring
- [ ] Reconcile `MODULE_KIND_NO_MANIFEST` charters by updating manifest.yaml or downgrading kind to `feature`
```

**Integration with summary table:**
```
| Kind Validity | WARN | 3 findings (1 error, 2 warn) |
```

## Audit Pass 19: Validate Config Drift

**Goal:** Compare the project's `.context-index/governance/validate.yaml` against the resolved domain's `validate.yaml` starter and surface divergent registry entries as INFO findings. Per `validate-config-single-source.spec.md` (Behavior 8), the audit's purpose is **visibility, not nagging** — divergence is the expected outcome of project customization and the pass never blocks. When a plugin upgrade improves a starter prompt or adds a new check, this audit surfaces the divergence so operators can opt in deliberately.

**Steps:**

1. Resolve the project's domain (from manifest, charter frontmatter, or module slug — same resolution chain used by `/adev:validate` Step 0).
2. Call `loadDomainConfig(domain, 'validate', repoRoot, pluginRoot)` to get the current domain starter.
3. **Pre-condition guards (skip cases):**
   - If `loadDomainConfig` returns `null`: SKIP with INFO "No validate.yaml starter for domain '<domain>' — drift check not applicable."
   - If `.context-index/governance/validate.yaml` does not exist: SKIP with INFO "No governance/validate.yaml found — run /adev:init to scaffold."
4. Load both files (starter via the returned object; project via `parseYaml(readFileSync(...))`). Build an id-keyed map of each registry's entries.
5. **Diff by id, field-by-field.** For each `id` present in the starter:
   - If absent in the project file: INFO "Starter contains id '<id>' not present in project config — consider adding."
   - If present but differs: emit a per-field finding (see SEC-4 below).
6. For each `id` present in the project but absent in the starter: INFO "Project adds id '<id>' (not in starter) — project customization."
7. If no divergence: INFO "Validate config is current with domain starter."

**SEC-4: per-field emission rules.** When emitting a per-field difference:
- For `prompt:` and `context_pack:` fields: emit ONLY the field name and value **type** (e.g., `prompt: <plugin-URI> vs <project-relative-path>`). Do NOT emit the full string values. Project paths may contain internal codenames or sensitive labels that should not appear in hygiene output that may be shared in chat or PRs.
- For all other fields: emit the literal starter value and project value side-by-side.

**Severity policy.** All findings from this pass are **INFO**, not WARN. Divergence is expected; the audit is informational. Severity escalation would invert the purpose — make a Layer-2 issue if a project wants to be reminded about specific drift patterns.

**Output format:**
```
## Validate Config Drift

- PASS: Validate config is current with domain starter (no divergence)

— or —

- INFO: N divergent registry entries detected (non-blocking)

| Check ID | Field | Starter | Project |
|---|---|---|---|
| validate.check-2-spec-compliance | severity | error | warning |
| validate.check-4-constitution | prompt | <plugin-URI> | <project-relative-path> |
| project.custom-check | (full entry) | — | (added by project) |

**Actions:**
- [ ] Review each divergence; adopt starter improvements where appropriate
- [ ] Document intentional deviations in governance/validate.yaml comments
```

**Integration with summary table:**
```
| Validate Config Drift | INFO | 3 divergent entries |
```

## Report Format

**Persona adaptation:** The report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

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
| External Reference Freshness | PASS | 0 issues |
| Governance Policy Health | PASS | 0 issues |
| Recovery Pattern Analysis | WARN | 2 repeat offenders |
| Blocker Frequency Analysis | WARN | 1 stale blocker |
| Milestone Coverage | WARN | 1 unspecified, 2 un-milestoned |
| Lifecycle Audit | WARN | 2 revision drift, 1 charter stale |
| Code Health | WARN | 2 high, 3 medium, 1 low |
| Code Provenance | WARN | 2 drifted, 3 untraced |
| Issue Board Audit | FAIL | 2 orphaned, 1 stale epic |
| Heuristic Index Health | WARN | 1 stale index entry, 2 orphan tags |
| Code Drift | PASS | 0 issues |
| Kind Validity | WARN | 3 findings (non-blocking) |

## Priority Actions

1. [ ] Run `/adev:sync` to fix constitution drift
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
- Run /adev:hygiene again after fixes to verify
- Schedule monthly hygiene audits to prevent drift
```

## API reference

Lifecycle projection (used by the Lifecycle Audit pass and other staleness checks):

- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregates per-spec lifecycle projections from `.context-index/lifecycle-state/*.jsonl`. Replaces the prior `.review.md` filesystem scan for revision/file-drift detection.
- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — single-spec projection (`{ status, currentStep, steps, planTasks, ... }`).
- `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` — fast drift flag read from the spec's frontmatter.
- `verifyManifest(manifest, projectRoot)` from `<ADEV_ROOT>/lib/source-manifest.mjs` — recompute the content hash for a spec's source manifest and compare; fallback when `hasDrift()` returns false.

Issue board (used by the Issue Board Audit pass and coverage scans):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.

Kind validity (used by the Kind Validity audit pass):

- `runKindValidityPass(projectRoot, options?)` from `<ADEV_ROOT>/lib/hygiene/kind-validity.mjs` — walks every `*.spec.md` and `charter.md` under `.context-index/`, validates the frontmatter `kind:` discriminator against `SPEC_KINDS` / `CHARTER_KINDS`, and emits non-blocking findings. Options: `cutover` (ISO 8601 — defaults to `2026-05-14T00:00:00.000Z`), `moduleFilter` (slug to scope the audit). Returns `{ findings, headerNotes }`. Never throws; never mutates `process.exitCode`.
- `parseSpecFrontmatter(filePath)` from `<ADEV_ROOT>/lib/meta-tools.mjs` — the underlying frontmatter discriminator parser; projects `kind`, `kindValid`, `kindResolved` sentinels onto each parsed result.
- `getCreationTimestamp(filePath)` from `<ADEV_ROOT>/lib/git-timestamp.mjs` — resolves the authoritative creation timestamp (git first-add commit, mtime fallback); used to classify `MISSING_KIND` vs `LEGACY_DEFAULTED`.
