---
name: adev-hygiene
description: "Audit all context for staleness, drift, and coverage gaps. Runs eleven audit passes across the .context-index/ directory and generates actionable reports with checklists. Use when the user wants to check context health, find stale specs, detect drift between specs and code, identify missing coverage, or clean up the context index."
---

# Context Hygiene Audit

Audit the health of `.context-index/` and generate actionable reports. Eleven audit passes detect staleness, drift, coverage gaps, phase readiness, and operational patterns so the team can fix them before they become obstacles.

## Arguments

- No arguments: full audit (all eleven passes)
- `--check <type>`: run a single pass (constitution, charters, adrs, samples, drift, sessions, references, governance, recoveries, blockers, phases)
- `--fix`: auto-fix issues where possible (runs /adev-sync for constitution drift, etc.)

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev-init` first.

## Process

1. **Load manifest:** Read `.context-index/manifest.yaml` for configuration, sync targets, and integration settings.
2. **Run audit passes:** Execute each of the eleven passes below. If `--check` was provided, run only that pass.
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

Skipped — using manifest gates. No governance/ directory configured.
```

**Steps (when governance/ exists):**

1. **YAML parsing.** Parse each file (`gates.yaml`, `boundaries.yaml`, `risk-policies.yaml`). Flag PARSE_ERROR on failure.
2. **Gate command validation.** For each gate with a non-empty `command`, check that the binary exists on PATH (e.g., `which npm`, `which pytest`). Do not run the command. Flag COMMAND_NOT_FOUND.
3. **Regex validation.** For each boundary rule, compile the `pattern` as a regex. Flag INVALID_REGEX on failure.
4. **Charter override references.** For each file in `governance/overrides/`, verify the charter exists at `.context-index/specs/features/<slug>/charter.md`. Flag ORPHAN_OVERRIDE if the charter does not exist.
5. **Transition gate references.** For each gate ID in `transitions.*.required_gates`, verify it exists in the `gates` list. Flag MISSING_GATE_REF.
6. **Risk policy completeness.** Verify all three levels (high, medium, low) are defined in `risk-policies.yaml`. Flag INCOMPLETE_POLICY.

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

Skipped — no recovery records found. Records are created by /adev-recover.
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

Skipped — no blocker files found. Blockers are filed by subagents during /adev-implement.
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

## Audit Pass 11: Phase Coverage

**Goal:** Report delivery readiness per phase by cross-referencing charter capability phases with spec statuses. Identify capabilities with no phase, and phases with missing or incomplete specs.

**Steps:**

1. **Scan all charters.** Read every `.context-index/specs/features/*/charter.md`. For each charter, parse the Capability Map table. Extract each capability's name, priority, and phase.
2. **Scan all specs.** Read every spec file under `.context-index/specs/features/` (excluding `charter.md`, `*.plan.md`, `*.review.md`). Parse frontmatter for `charter`, `milestone`, and `status`.
3. **Match capabilities to specs.** For each charter capability, find the corresponding spec by:
   - Matching `milestone` in the spec to the capability's phase, AND
   - Matching the spec's `charter` field to the charter's module name.
   - If no milestone match, fall back to matching by capability name similarity against spec titles.
4. **Group by phase.** For each distinct phase found across all charters:
   - List all capabilities assigned to that phase.
   - For each capability, show the matching spec and its status (or "(no spec created)" if none).
   - Compute a summary: N specified, M implemented, K in review, J draft, L missing.
5. **List unphased capabilities.** Capabilities with no phase assigned, grouped by charter. Include their priority for triage.

**Output format:**
```
## Phase Coverage

### v1
- auth/password-login — implemented ✓
- auth/session-management — review-passed
- task-boards/create-boards — draft
  → 1/3 implemented, 1 in review, 1 draft

### v2
- auth/sso-integration — (no spec created)
  → 0/1 specified (1 charter capability without a spec)

### Unphased Capabilities
- auth: MFA — nice-to-have, no phase assigned
- task-boards: board-analytics — should-have, no phase assigned

**Actions:**
- [ ] Create spec for auth/sso-integration (v2 capability with no spec)
- [ ] Assign phase to 2 unphased capabilities
```

**Integration with summary table:** Add a row for Phase Coverage in the report summary:
```
| Phase Coverage | WARN | 1 unspecified capability, 2 unphased |
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
| External Reference Freshness | PASS | 0 issues |
| Governance Policy Health | PASS | 0 issues |
| Recovery Pattern Analysis | WARN | 2 repeat offenders |
| Blocker Frequency Analysis | WARN | 1 stale blocker |
| Phase Coverage | WARN | 1 unspecified, 2 unphased |

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
